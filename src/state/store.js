// The shared state reducer — brief §4, merchant §9, RM §9, customer §10.
//
// One pure function: reduce(state, event) → state. No React, no DOM, no clock of its own (every
// event carries `at`), so the same code runs in the browser behind the event bus and under node
// in selftest.mjs, which is how validate.py proves the propagation rules instead of trusting them.
//
// Nothing is ever silently dropped. A push that cannot go out is a counted suppression; an event
// the rules refuse is a REJECTED ledger entry with the reason; a redemption after a campaign
// froze is honoured for the customer and counted apart from the frozen results.

import { canTransition, isTerminal } from "./ladder.js";

const clone = (o) => JSON.parse(JSON.stringify(o));

// Deterministic offer ids: a cardholder holds at most one card per campaign.
export const offerId = (campaignId, cardholderId) => `${campaignId}:${cardholderId}`;

// Redemption codes are derived, not random, so two tabs replaying the same log agree.
const redemptionCode = (offer, seq) => `MOB-${offer.campaign_id.replace(/[^A-Z0-9]/gi, "").slice(-4)}-${String(seq).padStart(4, "0")}`;

const endOfDay = (isoDate) => (isoDate ? `${isoDate}T23:59:59+08:00` : null);

function reject(state, event, reason) {
  const next = clone(state);
  next.ledger.push({ seq: event.seq ?? null, at: event.at ?? null, type: "REJECTED", event: event.type, reason, detail: { ...event, type: undefined } });
  return next;
}

function log(next, event, entry) {
  next.ledger.push({ seq: event.seq ?? null, at: event.at ?? null, type: event.type, ...entry });
}

// Move a cardholder's category weights toward the redeemed merchant's category and renormalise.
// PROFILE_WEIGHT_STEP is the (provisional) learning rate from constants.json.
function learn(weights, category, step) {
  if (!category) return weights;
  const out = { ...weights, [category]: (weights[category] ?? 0) + step };
  const total = Object.values(out).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(out)) out[k] = Math.round((out[k] / total) * 1e5) / 1e5;
  return out;
}

function freeze(campaign, at, why) {
  campaign.frozen = { at, why, counters: clone(campaign.counters) };
}

function cap(next, campaign, event, why) {
  campaign.status = "capped";
  campaign.capped = { at: event.at, why };
  freeze(campaign, event.at, why);
  // A redemption limit is exhausted: nobody can redeem again, so the cards close and say so.
  // A reach cap only stops new deliveries; a card already delivered is a reward the customer
  // holds, and it stays valid until it expires — the contract says never revoke one.
  if (why === "redemption limit reached") {
    for (const offer of Object.values(next.offers)) {
      if (offer.campaign_id === campaign.id && offer.status === "delivered") {
        offer.status = "closed";
        offer.closed = { at: event.at, why: "This offer has been fully redeemed." };
      }
    }
  }
  log(next, { ...event, type: "CAPPED" }, { campaign_id: campaign.id, why });
}

export function reduce(state, event) {
  switch (event.type) {
    // ---------------------------------------------------------------- the ladder
    case "ADVANCE": {
      const c = state.campaigns[event.campaign_id];
      if (!c) return reject(state, event, "unknown campaign");
      if (!canTransition(c.status, event.to)) return reject(state, event, `no transition ${c.status} → ${event.to}`);
      const next = clone(state);
      const campaign = next.campaigns[event.campaign_id];
      const from = campaign.status;
      campaign.status = event.to;
      if (event.configuration) campaign.configuration = { ...(campaign.configuration ?? {}), ...event.configuration };
      if (event.to === "active") {
        campaign.live_since = event.at;
        if (event.window) campaign.window = event.window;
      }
      if (event.to === "completed") freeze(campaign, event.at, "window ended");
      campaign.history.push({ from, to: event.to, by: event.by ?? null, at: event.at, note: event.note ?? null });
      log(next, event, { campaign_id: campaign.id, from, to: event.to, by: event.by ?? null });
      return next;
    }

    case "STOPPED": {
      const c = state.campaigns[event.campaign_id];
      if (!c) return reject(state, event, "unknown campaign");
      if (!canTransition(c.status, "stopped")) return reject(state, event, `no transition ${c.status} → stopped`);
      const next = clone(state);
      const campaign = next.campaigns[event.campaign_id];
      campaign.status = "stopped";
      campaign.stopped = { at: event.at, by: event.by ?? "merchant", reason: event.reason ?? null };
      freeze(campaign, event.at, "stopped by merchant");
      // Delivered offers are untouched: each still carries its own expires_at and stays
      // redeemable until then. The customer view says when it expires instead of pulling it.
      let held = 0;
      for (const offer of Object.values(next.offers)) if (offer.campaign_id === campaign.id && offer.status === "delivered") held += 1;
      campaign.history.push({ from: "active", to: "stopped", by: event.by ?? "merchant", at: event.at, note: event.reason ?? null });
      log(next, event, { campaign_id: campaign.id, offers_still_held: held, note: "results frozen; delivered offers stay valid until expiry" });
      return next;
    }

    // ---------------------------------------------------------------- event 1: push
    case "PUSH_FIRED": {
      const c = state.campaigns[event.campaign_id];
      if (!c) return reject(state, event, "unknown campaign");
      if (c.status !== "active") return reject(state, event, `campaign is ${c.status}, not active`);
      const next = clone(state);
      const campaign = next.campaigns[event.campaign_id];
      const capPerWeek = next.caps.push_per_week;
      const sent = [], suppressed = [], excluded = [], unknown = [], already = [];
      for (const id of event.recipients ?? []) {
        const ch = next.cardholders[id];
        if (!ch) { unknown.push(id); continue; }
        if (!ch.consent.offers) { excluded.push({ id, why: "offers off" }); continue; }
        const oid = offerId(campaign.id, id);
        if (next.offers[oid]) { already.push(id); continue; }
        next.offers[oid] = {
          id: oid, campaign_id: campaign.id, cardholder_id: id, merchant_id: campaign.merchant_id, merchant_name: campaign.merchant_name,
          reward_type: campaign.configuration?.reward_type ?? campaign.recommended?.reward_type ?? null,
          offer_headline: campaign.configuration?.offer_headline ?? null, offer_terms: campaign.configuration?.offer_terms ?? null,
          days_of_week: campaign.configuration?.days_of_week ?? null, hours: campaign.configuration?.hours ?? null,
          delivered_at: event.at, expires_at: endOfDay(campaign.window?.end ?? null), status: "delivered", via: null, source: "live",
        };
        ch.feed.push(oid);
        ch.offers_held_30d += 1;
        // The weekly push cap is the frequency cap doing visible work: the card lands in the feed
        // either way, and only the push is withheld — counted, with the reason.
        if (!ch.consent.push) {
          suppressed.push({ id, why: "push off" });
          next.offers[oid].via = "feed_only";
        } else if (ch.pushes_this_week >= capPerWeek) {
          suppressed.push({ id, why: `weekly push cap (${ch.pushes_this_week} of ${capPerWeek} already this week)` });
          next.offers[oid].via = "feed_only";
        } else {
          ch.pushes_this_week += 1;
          ch.notifications.push({ offer_id: oid, at: event.at, campaign_id: campaign.id, merchant_name: campaign.merchant_name });
          sent.push(id);
          next.offers[oid].via = "push";
        }
      }
      const delivered = sent.length + suppressed.length;
      campaign.counters.feed_delivered += delivered;
      campaign.counters.pushes_sent += sent.length;
      campaign.counters.pushes_suppressed += suppressed.length;
      campaign.counters.excluded_consent += excluded.length;
      campaign.pushes.push({ at: event.at, by: event.by ?? "rm", recipients: (event.recipients ?? []).length, delivered, sent: sent.length,
                             suppressed: suppressed.length, suppressed_detail: suppressed, excluded: excluded.length, excluded_detail: excluded,
                             already_holding: already.length, unknown: unknown.length, reconciles: delivered === sent.length + suppressed.length });
      log(next, event, { campaign_id: campaign.id, delivered, sent: sent.length, suppressed: suppressed.length, suppressed_detail: suppressed,
                         excluded: excluded.length, already_holding: already.length, unknown: unknown.length });
      if (campaign.reach_cap != null && campaign.counters.feed_delivered >= campaign.reach_cap) cap(next, campaign, event, "reach cap reached");
      return next;
    }

    // ---------------------------------------------------------------- event 2 + 3: redeem, limit
    case "REDEEMED": {
      const o = state.offers[event.offer_id];
      if (!o) return reject(state, event, "unknown offer");
      const c = state.campaigns[o.campaign_id];
      if (o.status !== "delivered") return reject(state, event, `offer is ${o.status}, not delivered`);
      if (o.expires_at && Date.parse(event.at) > Date.parse(o.expires_at)) return reject(state, event, `offer expired ${o.expires_at}`);
      if (["applied", "draft", "pending"].includes(c.status)) return reject(state, event, `campaign is ${c.status}`);
      // No status check beyond that: a delivered card is a reward the customer holds. A redemption
      // limit closes the cards themselves (status "closed", caught above); a reach cap, a stop or
      // a completed window leave them valid until expiry, and the redemption is honoured.
      const next = clone(state);
      const offer = next.offers[event.offer_id];
      const campaign = next.campaigns[o.campaign_id];
      const ch = next.cardholders[o.cardholder_id];
      offer.status = "redeemed";
      offer.redeemed_at = event.at;
      offer.code = redemptionCode(offer, event.seq ?? 0);
      // The customer's own weights move toward what they just redeemed (customer §5, §6).
      const before = ch.profile.category_weights[campaign.merchant_category] ?? 0;
      ch.profile.category_weights = learn(ch.profile.category_weights, campaign.merchant_category, next.caps.profile_weight_step);
      ch.profile.last_redemption = { offer_id: offer.id, category: campaign.merchant_category, at: event.at,
                                     weight_before: before, weight_after: ch.profile.category_weights[campaign.merchant_category] ?? 0 };
      if (campaign.status === "active") {
        campaign.counters.redemptions += 1;
        if (!campaign.counters.redeemers.includes(o.cardholder_id)) campaign.counters.redeemers.push(o.cardholder_id);
      } else {
        // Stopped or completed: results are frozen, but the reward is honoured and the
        // redemption is counted where a reader can find it.
        campaign.post_freeze.redemptions += 1;
        campaign.post_freeze.offers.push(offer.id);
      }
      log(next, event, { offer_id: offer.id, campaign_id: campaign.id, cardholder_id: o.cardholder_id, code: offer.code,
                         counted_in: campaign.status === "active" ? "live results" : "post-freeze ledger",
                         weight: ch.profile.last_redemption });
      const limit = campaign.configuration?.redemption_limit;
      if (campaign.status === "active" && limit != null && campaign.counters.redemptions >= limit) cap(next, campaign, event, "redemption limit reached");
      return next;
    }

    // ---------------------------------------------------------------- event 5: consent
    case "OFFERS_OFF": {
      const ch = state.cardholders[event.cardholder_id];
      if (!ch) return reject(state, event, "unknown cardholder");
      if (!ch.consent.offers) return reject(state, event, "offers already off");
      const next = clone(state);
      const holder = next.cardholders[event.cardholder_id];
      holder.consent.offers = false;
      holder.consent.changed_at = event.at;
      holder.segments_left_at = event.at;
      let withdrawn = 0;
      for (const oid of holder.feed) {
        const offer = next.offers[oid];
        if (offer && offer.status === "delivered") {
          offer.status = "withdrawn";
          offer.withdrawn = { at: event.at, why: "You turned offers off." };
          withdrawn += 1;
        }
      }
      holder.feed = [];
      holder.notifications = [];
      // Out of every future segment: the pipeline's reach is static JSON, so the departure is
      // recorded here and the live reach shown is reach − departures (still rounded to 50).
      for (const campaign of Object.values(next.campaigns)) {
        if (!isTerminal(campaign.status)) campaign.segment_departures.consent += 1;
      }
      log(next, event, { cardholder_id: holder.id, withdrawn, note: "feed emptied; excluded from every future push" });
      return next;
    }

    case "OFFERS_ON": {
      const ch = state.cardholders[event.cardholder_id];
      if (!ch) return reject(state, event, "unknown cardholder");
      if (ch.consent.offers) return reject(state, event, "offers already on");
      const next = clone(state);
      const holder = next.cardholders[event.cardholder_id];
      holder.consent.offers = true;
      holder.consent.changed_at = event.at;
      holder.segments_left_at = null;
      for (const campaign of Object.values(next.campaigns)) {
        if (!isTerminal(campaign.status) && campaign.segment_departures.consent > 0) campaign.segment_departures.consent -= 1;
      }
      log(next, event, { cardholder_id: holder.id, note: "back in future segments; withdrawn offers are not restored" });
      return next;
    }

    case "PUSH_PREF": {
      const ch = state.cardholders[event.cardholder_id];
      if (!ch) return reject(state, event, "unknown cardholder");
      const next = clone(state);
      next.cardholders[event.cardholder_id].consent.push = Boolean(event.push);
      log(next, event, { cardholder_id: event.cardholder_id, push: Boolean(event.push) });
      return next;
    }

    case "INTEREST": {
      const ch = state.cardholders[event.cardholder_id];
      if (!ch) return reject(state, event, "unknown cardholder");
      if (!(event.category in ch.profile.category_weights)) return reject(state, event, `unknown category ${event.category}`);
      const next = clone(state);
      const holder = next.cardholders[event.cardholder_id];
      const step = next.caps.profile_weight_step * (event.direction === "less" ? -1 : 1);
      const bumped = { ...holder.profile.category_weights };
      bumped[event.category] = Math.max(0, (bumped[event.category] ?? 0) + step);
      holder.profile.category_weights = learn(bumped, null, 0);
      const total = Object.values(holder.profile.category_weights).reduce((a, b) => a + b, 0) || 1;
      for (const k of Object.keys(holder.profile.category_weights)) holder.profile.category_weights[k] = Math.round((holder.profile.category_weights[k] / total) * 1e5) / 1e5;
      log(next, event, { cardholder_id: holder.id, category: event.category, direction: event.direction });
      return next;
    }

    default:
      return reject(state, event, `unknown event type ${event.type}`);
  }
}

// Live reach for display: the pipeline's rounded reach less consent departures, re-rounded so a
// single departure never reveals itself as a count of one.
export function liveReach(campaign, rounding = 50) {
  if (campaign.reach == null) return null;
  const raw = campaign.reach - (campaign.segment_departures?.consent ?? 0);
  return Math.max(0, Math.round(raw / rounding) * rounding);
}

// Invariants a view (or validate.py) can check on any state.
export function audit(state) {
  const problems = [];
  for (const c of Object.values(state.campaigns)) {
    for (const p of c.pushes) if (p.delivered !== p.sent + p.suppressed) problems.push(`${c.id}: push at ${p.at} does not reconcile`);
    const fromPushes = c.pushes.reduce((a, p) => ({ d: a.d + p.delivered, s: a.s + p.sent, x: a.x + p.suppressed }), { d: 0, s: 0, x: 0 });
    if (c.counters.feed_delivered - (c.counters.seeded?.feed_delivered ?? 0) !== fromPushes.d) problems.push(`${c.id}: feed_delivered != Σ pushes`);
    if (c.counters.pushes_suppressed - (c.counters.seeded?.pushes_suppressed ?? 0) !== fromPushes.x) problems.push(`${c.id}: pushes_suppressed != Σ pushes`);
    const liveRedeemed = Object.values(state.offers).filter((o) => o.campaign_id === c.id && o.status === "redeemed" && o.source === "live").length;
    if (liveRedeemed !== c.counters.redemptions - (c.counters.seeded?.redemptions ?? 0) + c.post_freeze.redemptions) problems.push(`${c.id}: redeemed offers != counted redemptions`);
    if (isTerminal(c.status) && !c.frozen) problems.push(`${c.id}: terminal without frozen results`);
    if (c.frozen && c.status === "active") problems.push(`${c.id}: frozen while active`);
  }
  for (const ch of Object.values(state.cardholders)) {
    const total = Object.values(ch.profile.category_weights).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.001) problems.push(`${ch.id}: weights sum to ${total}`);
    if (ch.pushes_this_week > state.caps.push_per_week) problems.push(`${ch.id}: over the weekly push cap`);
    if (!ch.consent.offers && ch.feed.length) problems.push(`${ch.id}: offers off but feed not empty`);
  }
  return problems;
}
