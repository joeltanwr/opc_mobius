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
import { decideNarrowing } from "./narrow.js";

// Field-level permissions on the joint set-up page (merchant §7.6). The merchant proposes and
// sets the limit, since the limit bounds its own spend; OCBC staff adjust reward, timing and
// location and decide push. Neither party can author the segment — it is only narrowed.
export const FIELD_OWNERS = {
  reward_type: ["merchant", "ocbc"], discount_pct: ["merchant", "ocbc"], max_reward_value_sgd: ["merchant", "ocbc"],
  offer_headline: ["merchant", "ocbc"], offer_terms: ["merchant", "ocbc"],
  days_of_week: ["merchant", "ocbc"], hours: ["merchant", "ocbc"], window_start: ["merchant", "ocbc"], window_end: ["merchant", "ocbc"],
  outlets: ["merchant", "ocbc"], redemption_limit: ["merchant"], per_customer_limit: ["merchant"],
  push_requested: ["merchant"], push_granted: ["ocbc"],
  // Added for the RM configuration page (RM §5). Per-reward-type detail, the pool selection, the
  // reach cap, how often the offer resurfaces, and the push copy — which is written separately
  // from the feed card because it is a different artefact.
  min_spend_sgd: ["merchant", "ocbc"], bundle_quantity: ["merchant", "ocbc"], type_detail: ["merchant", "ocbc"],
  target_segments: ["merchant", "ocbc"], reach_cap: ["ocbc"], promotion_frequency: ["ocbc"], push_body: ["merchant", "ocbc"],
};

// The pools a campaign may target. Selecting one is choosing a pool Mobius proposed; writing
// anything else would be authoring a segment, which neither party can do on any screen. The
// reducer checks the value against the pools the pipeline shipped with this campaign rather than
// trusting the form to only offer good ones — a rule, not a label.
export function allowedPools(campaign) {
  const retention = Object.keys(campaign?.allocation?.retention_pools ?? {}).filter((k) => !k.startsWith("_"));
  return [...retention, "Non-customers"];
}
export const REQUIRED_TO_SUBMIT = ["reward_type", "max_reward_value_sgd", "days_of_week", "hours", "window_start", "window_end", "outlets", "redemption_limit"];

const clone = (o) => JSON.parse(JSON.stringify(o));

// Deterministic offer ids: a cardholder holds at most one card per campaign.
export const offerId = (campaignId, cardholderId) => `${campaignId}:${cardholderId}`;

// Redemption codes are derived, not random, so two tabs replaying the same log agree.
const redemptionCode = (offer, seq) => `MOB-${offer.campaign_id.replace(/[^A-Z0-9]/gi, "").slice(-4)}-${String(seq).padStart(4, "0")}`;

const endOfDay = (isoDate) => (isoDate ? `${isoDate}T23:59:59+08:00` : null);

// ---------------------------------------------------------------------------------------------
// The per-customer limit (merchant §7.5). Two values, both enforced here, so the control on the
// set-up page is a rule and not a label:
//
//   once_per_customer — one reward per cardholder for this campaign. The offer model already
//     issues exactly one card per cardholder per campaign (offerId is campaign:cardholder), so
//     this is enforced by construction; asserting it here makes it a checked invariant rather
//     than an accident of how ids are built, and it survives any later change to that model.
//   once_per_week — one reward from THIS MERCHANT per rolling seven days, across its campaigns.
//     Within a single campaign a cardholder holds one card, so the merchant scope is the only
//     reading under which a weekly limit does any work — and it is what a merchant means by it.
//
// Historical configurations shipped by the generator use once_per_campaign (same rule as
// once_per_customer) and once_per_day (one day instead of seven). once_per_visit is a rule at the
// till — the app never sees a visit — so it constrains nothing here and is not offered at set-up.
// A value this table does not know constrains nothing: the reducer never invents a rule.
// ---------------------------------------------------------------------------------------------
export const PER_CUSTOMER_LIMITS = {
  once_per_customer: { scope: "campaign", days: null, label: "once per customer, for this campaign" },
  once_per_campaign: { scope: "campaign", days: null, label: "once per customer, for this campaign" },
  once_per_week: { scope: "merchant", days: 7, label: "once per customer per week, across this merchant's campaigns" },
  once_per_day: { scope: "merchant", days: 1, label: "once per customer per day, across this merchant's campaigns" },
};

// What the set-up page offers (merchant §7.5 names exactly these two). The table above is wider
// because it also has to read the generator's historical configurations back.
export const PER_CUSTOMER_OPTIONS = ["once_per_customer", "once_per_week"];

// The prior redemption that a per-customer limit refuses this one for, or null if none does.
function perCustomerBlocker(state, campaign, cardholderId, at) {
  const rule = PER_CUSTOMER_LIMITS[campaign.configuration?.per_customer_limit];
  if (!rule) return null;
  const cutoff = rule.days == null ? null : Date.parse(at) - rule.days * 86_400_000;
  return Object.values(state.offers).find((o) => {
    if (o.cardholder_id !== cardholderId || o.status !== "redeemed") return false;
    if (rule.scope === "campaign" ? o.campaign_id !== campaign.id : o.merchant_id !== campaign.merchant_id) return false;
    if (cutoff === null) return true;
    // A redemption we cannot date cannot be shown to fall inside the window, so it does not refuse.
    return o.redeemed_at != null && Date.parse(o.redeemed_at) >= cutoff;
  }) ?? null;
}

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

// ---------------------------------------------------------------------------------------------
// Portfolio exposure and its two controls — RM prompt §3.2.
//
// This is the layer no single campaign's approval can see: an approver looking at one campaign
// cannot see the other campaigns contacting the same cardholders this week. The counters live on
// the state, not on a campaign, and every delivery anywhere in the portfolio moves them.
//
// Two controls, and they are deliberately not the same kind of thing:
//
//   the weekly ceiling   a stated policy line, PROVISIONAL and not yet calibrated. It measures
//                        and it warns; it does not block. An uncalibrated round number that
//                        silently refuses a send would be a policy nobody agreed to — so a send
//                        that crosses it is recorded as crossing it (`over_ceiling` on the push,
//                        and in the ledger) and the interface makes the RM acknowledge the breach
//                        before it goes. Visible and deliberate, never silent.
//   the throttle         the RM's own control, and the one that binds. It only ever tightens: it
//                        cannot be set above the ceiling, for the same reason a segment can only
//                        be narrowed. A send that does not fit inside it is refused in full, with
//                        the headroom named.
//
// A send is refused in full rather than trimmed to fit because the app holds aggregate figures
// only. The allocator ranks by propensity in the pipeline; this layer cannot honestly choose
// which cardholders to drop, and an RM asked "who got left out" must be able to answer.
//
// The kill switch halts every send in the portfolio until it is released — not one campaign's.

export function effectiveCap(portfolio) {
  // What actually binds a send. null = nothing binds; the ceiling warns (see above).
  return portfolio?.throttle?.limit ?? null;
}

export function portfolioView(portfolio) {
  const contacted = portfolio?.contacted_this_week ?? 0;
  const ceiling = portfolio?.weekly_ceiling ?? null;
  const cap = effectiveCap(portfolio);
  return {
    contacted,
    ceiling,
    ceiling_headroom: ceiling == null ? null : ceiling - contacted,
    ceiling_used_pct: ceiling ? Math.round((contacted / ceiling) * 1000) / 10 : null,
    throttle: portfolio?.throttle ?? null,
    throttle_headroom: cap == null ? null : Math.max(0, cap - contacted),
    halted: portfolio?.halted ?? null,
  };
}

// Does a send of `delivered` feed cards clear the portfolio controls? Pure, so the confirmation
// dialog can ask the same question the reducer will ask.
export function portfolioGate(portfolio, delivered) {
  const v = portfolioView(portfolio);
  if (v.halted) {
    return { ok: false, reason: `sending is halted across the portfolio (kill switch engaged by ${v.halted.by} at ${String(v.halted.at).slice(0, 16).replace("T", " ")}${v.halted.reason ? `: ${v.halted.reason}` : ""})`, ...v, delivered };
  }
  if (v.throttle && delivered > v.throttle_headroom) {
    return { ok: false, reason: `the throttle allows ${v.throttle.limit.toLocaleString()} contacts this week and ${v.contacted.toLocaleString()} have been made, so ${v.throttle_headroom.toLocaleString()} remain — this send is ${delivered.toLocaleString()}. Raise the throttle or wait for the week to roll; the send is refused whole rather than trimmed, because this layer holds aggregate figures and cannot say which cardholders it would drop`, ...v, delivered };
  }
  const projected = v.contacted + delivered;
  return { ok: true, ...v, delivered, projected, over_ceiling: v.ceiling != null && projected > v.ceiling, over_by: v.ceiling == null ? null : Math.max(0, projected - v.ceiling) };
}

// ---------------------------------------------------------------------------------------------
// What a push would do, computed from the state before it happens — RM §3.4.
//
// The confirmation dialog has to show exactly what will be sent, to how many, and how many will
// be suppressed. It computes that here, with the same rules the reducer applies a moment later,
// so the confirmation cannot promise one thing and the event do another. selftest.mjs checks the
// two agree.
// ---------------------------------------------------------------------------------------------

// The named cardholders in a campaign's cohort. Six showcase personas out of an allocation of
// several hundred: they are the ones whose own feeds move on screen.
export function cohortNamed(state, campaign) {
  return Object.values(state.cardholders)
    .filter((ch) => (ch.cohort_membership ?? []).some((m) => m === campaign.cohort_tag))
    .map((ch) => ch.id);
}

export function pushPreview(state, campaignId, { cohort = false, recipients = [] } = {}) {
  const campaign = state.campaigns[campaignId];
  if (!campaign) return null;
  const capPerWeek = state.caps.push_per_week;
  const ids = cohort ? cohortNamed(state, campaign) : recipients;
  const named = [];
  let deliverable = 0;
  for (const id of ids) {
    const ch = state.cardholders[id];
    if (!ch) { named.push({ id, outcome: "unknown", why: "not a cardholder in this dataset" }); continue; }
    if (!ch.consent.offers) { named.push({ id, name: ch.name, outcome: "excluded", why: "this cardholder has offers turned off" }); continue; }
    if (state.offers[offerId(campaignId, id)]) { named.push({ id, name: ch.name, outcome: "already_holding", why: "already holds this campaign's card" }); continue; }
    deliverable += 1;
    if (!ch.consent.push) named.push({ id, name: ch.name, outcome: "suppressed", why: "push turned off — feed card only", pushes_this_week: ch.pushes_this_week });
    else if (ch.pushes_this_week >= capPerWeek) named.push({ id, name: ch.name, outcome: "suppressed", why: `already had ${ch.pushes_this_week} of ${capPerWeek} pushes this week — feed card only`, pushes_this_week: ch.pushes_this_week });
    else named.push({ id, name: ch.name, outcome: "push", why: "under the weekly cap", pushes_this_week: ch.pushes_this_week });
  }
  const namedSuppressed = named.filter((n) => n.outcome === "suppressed").length;

  // Everyone else in the allocation: counted in aggregate from the pipeline's own figures, never
  // listed and never named. Mirrors exactly what PUSH_COHORT will do.
  let rest = 0, restSuppressed = 0;
  if (cohort) {
    const cap = campaign.reach_cap ?? campaign.reach;
    const already = campaign.counters.feed_delivered - campaign.counters.seeded.feed_delivered;
    rest = cap == null ? 0 : Math.max(0, cap - already - deliverable);
    const expected = Math.max(0, (campaign.allocation?.push_suppressed_expected ?? 0) - campaign.counters.pushes_suppressed - namedSuppressed);
    restSuppressed = Math.min(rest, expected);
  }
  const delivered = deliverable + rest;
  const suppressed = namedSuppressed + restSuppressed;
  return {
    campaign_id: campaignId, cohort, named, rest, rest_suppressed: restSuppressed,
    delivered, sent: delivered - suppressed, suppressed,
    excluded: named.filter((n) => n.outcome === "excluded").length,
    already_holding: named.filter((n) => n.outcome === "already_holding").length,
    unknown: named.filter((n) => n.outcome === "unknown").length,
    cap_per_week: capPerWeek, cap_provisional: Boolean(state.caps.provisional.push_per_week),
    // "how many of those recipients have already had an offer this week" (RM §3.4) — the named
    // ones we can count exactly; the rest is the pipeline's own expectation for the allocation.
    named_already_pushed_this_week: named.filter((n) => (n.pushes_this_week ?? 0) > 0).length,
    allocation_suppressed_expected: campaign.allocation?.push_suppressed_expected ?? null,
    allocation_week: campaign.allocation?.week ?? null,
    gate: portfolioGate(state.portfolio, delivered),
  };
}

export function reduce(state, event) {
  switch (event.type) {
    // ---------------------------------------------------------------- the ladder
    case "ADVANCE": {
      const c = state.campaigns[event.campaign_id];
      if (!c) return reject(state, event, "unknown campaign");
      if (!canTransition(c.status, event.to)) return reject(state, event, `no transition ${c.status} → ${event.to}`);
      if (event.to === "pending") {
        const cfg = { ...(c.configuration ?? {}), ...(event.configuration ?? {}) };
        const missing = REQUIRED_TO_SUBMIT.filter((f) => cfg[f] == null || (Array.isArray(cfg[f]) && cfg[f].length === 0) || cfg[f] === "");
        if (missing.length) return reject(state, event, `cannot submit: missing ${missing.join(", ")}`);
        if (!(Number(cfg.redemption_limit) > 0)) return reject(state, event, "cannot submit: redemption limit must be above zero");
      }
      const next = clone(state);
      const campaign = next.campaigns[event.campaign_id];
      const from = campaign.status;
      campaign.status = event.to;
      if (event.to === "draft" && campaign.prefill) {
        // Mobius prefills from the recommendation; every prefilled field is a logged, attributed change.
        campaign.configuration = { ...(campaign.configuration ?? {}) };
        for (const [field, value] of Object.entries(campaign.prefill.fields)) {
          campaign.configuration[field] = value;
          campaign.changes.push({ field, from: null, to: value, by: "mobius", at: event.at, note: campaign.prefill.basis[field] ?? "prefilled by Mobius" });
        }
      }
      if (event.configuration) campaign.configuration = { ...(campaign.configuration ?? {}), ...event.configuration };
      if (event.to === "pending") campaign.submitted_at = event.at;
      if (event.to === "active") {
        campaign.live_since = event.at;
        const cfg = campaign.configuration ?? {};
        // The reach cap the RM set on the configuration page is the cap the reducer enforces. It
        // only ever tightens the allocation: a cap above it would be reaching people the allocator
        // did not allocate, which is widening a segment by the back door.
        if (cfg.reach_cap != null) campaign.reach_cap = Math.min(Number(cfg.reach_cap), campaign.reach ?? Number(cfg.reach_cap));
        campaign.window = event.window ?? (cfg.window_start && cfg.window_end ? { start: cfg.window_start, end: cfg.window_end } : campaign.window);
        campaign.configuration = { ...cfg, push_granted: event.push_granted ?? cfg.push_granted ?? false,
                                   channel: { feed: true, push_requested: Boolean(cfg.push_requested), push_granted: Boolean(event.push_granted ?? cfg.push_granted) } };
      }
      if (event.to === "completed") freeze(campaign, event.at, "window ended");
      campaign.history.push({ from, to: event.to, by: event.by ?? null, at: event.at, note: event.note ?? null });
      log(next, event, { campaign_id: campaign.id, from, to: event.to, by: event.by ?? null });
      return next;
    }

    // ---------------------------------------------------------------- merchant §6: the application
    // Tab 3's only action. The campaign sits at `applied` from the seed because Mobius has already
    // computed the recommendation — but a recommendation is not an application, and `applied_at` is
    // what separates them. Applying stamps who applied and when, and nothing else: no configuration
    // exists yet, nothing is reviewable yet, and the next move belongs to the relationship manager.
    case "APPLY": {
      const c = state.campaigns[event.campaign_id];
      if (!c) return reject(state, event, "unknown campaign");
      if (c.status !== "applied") return reject(state, event, `campaign is ${c.status}; an application only exists at the foot of the ladder`);
      if (c.applied_at) return reject(state, event, `already applied on ${String(c.applied_at).slice(0, 10)}`);
      const next = clone(state);
      const campaign = next.campaigns[event.campaign_id];
      campaign.applied_at = event.at;
      campaign.applied_by = event.by ?? "merchant";
      campaign.rm_message = event.rm_message ?? "A relationship manager will be in touch within the week.";
      campaign.history.push({ from: null, to: "applied", by: event.by ?? "merchant", at: event.at, note: "merchant applied on Tab 3; nothing configured, nothing sent" });
      log(next, event, { campaign_id: campaign.id, by: campaign.applied_by, rm_message: campaign.rm_message,
                         note: "application received; configuration happens on the set-up page once the RM is in the conversation" });
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
      // The portfolio controls sit above the campaign gate and are checked before anything moves.
      // `_gated` is set when PUSH_COHORT has already gated the whole send, named and aggregate
      // together — re-gating the named subset here would be checking the same send twice.
      if (!event._gated) {
        const plan = pushPreview(state, event.campaign_id, { recipients: event.recipients ?? [] });
        if (!plan.gate.ok) return reject(state, event, plan.gate.reason);
      }
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
      // Every feed card delivered is a cardholder contacted, and the portfolio counter is the only
      // place that sees them all. A push suppressed by the weekly cap still delivered a card, so it
      // still counts as a contact.
      const gate = event._gate ?? portfolioGate(state.portfolio, delivered);
      next.portfolio.contacted_this_week += delivered;
      campaign.pushes.push({ at: event.at, by: event.by ?? "rm", recipients: (event.recipients ?? []).length, delivered, sent: sent.length,
                             suppressed: suppressed.length, suppressed_detail: suppressed, excluded: excluded.length, excluded_detail: excluded,
                             already_holding: already.length, unknown: unknown.length, reconciles: delivered === sent.length + suppressed.length,
                             portfolio: { contacted_before: state.portfolio.contacted_this_week, contacted_after: next.portfolio.contacted_this_week,
                                          ceiling: next.portfolio.weekly_ceiling, throttle: next.portfolio.throttle?.limit ?? null,
                                          over_ceiling: Boolean(gate.over_ceiling), over_by: gate.over_by ?? null,
                                          acknowledged_over_ceiling: Boolean(event.acknowledge_over_ceiling) } });
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
      const blocker = perCustomerBlocker(state, c, o.cardholder_id, event.at);
      if (blocker) {
        const rule = PER_CUSTOMER_LIMITS[c.configuration.per_customer_limit];
        return reject(state, event, `per-customer limit: this campaign is ${rule.label}, and ${o.cardholder_id} redeemed ${blocker.id}${blocker.redeemed_at ? ` on ${blocker.redeemed_at.slice(0, 10)}` : ""}`);
      }
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
      // recorded here and the live reach shown is reach − departures (still rounded).
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

    // ---------------------------------------------------------------- joint set-up page (merchant §7)
    case "CONFIGURE": {
      const c = state.campaigns[event.campaign_id];
      if (!c) return reject(state, event, "unknown campaign");
      const owners = FIELD_OWNERS[event.field];
      if (!owners) return reject(state, event, `no such field ${event.field}`);
      if (!owners.includes(event.by)) return reject(state, event, `${event.by} cannot set ${event.field}; only ${owners.join(" or ")} can`);
      if (c.status === "draft") { /* both parties configure */ }
      else if (c.status === "pending" && event.by === "ocbc") { /* staff edits after submission, visible to the merchant */ }
      else return reject(state, event, `${event.field} cannot change while the campaign is ${c.status}${c.status === "pending" ? " (only OCBC staff edit a submitted campaign)" : ""}`);
      if (event.field === "target_segments") {
        const allowed = allowedPools(c);
        const bad = (event.value ?? []).filter((v) => !allowed.includes(v));
        // An empty allowed list means this campaign ships no pool table; nothing to check against.
        if (allowed.length && bad.length) return reject(state, event, `${bad.join(", ")} is not a pool Mobius proposed for this campaign — a segment can be selected and narrowed, never authored`);
      }
      const next = clone(state);
      const campaign = next.campaigns[event.campaign_id];
      campaign.configuration = { ...(campaign.configuration ?? {}) };
      const from = campaign.configuration[event.field] ?? null;
      if (JSON.stringify(from) === JSON.stringify(event.value)) return reject(state, event, `${event.field} unchanged`);
      campaign.configuration[event.field] = event.value;
      campaign.changes.push({ field: event.field, from, to: event.value, by: event.by, at: event.at, note: event.note ?? null });
      log(next, event, { campaign_id: campaign.id, field: event.field, from, to: event.value, by: event.by });
      return next;
    }

    case "NARROW": {
      const c = state.campaigns[event.campaign_id];
      if (!c) return reject(state, event, "unknown campaign");
      if (!c.segment) return reject(state, event, "campaign has no segment to narrow");
      if (!["draft", "pending"].includes(c.status)) return reject(state, event, `segment cannot change while the campaign is ${c.status}`);
      const next = clone(state);
      const campaign = next.campaigns[event.campaign_id];
      const seg = campaign.segment;
      const decision = decideNarrowing(seg, event.request);
      if (decision.consumes) seg.refinements_used += 1;
      if (decision.outcome === "applied") {
        seg.constraints = decision.constraints;
        seg.reach = decision.reach;
      }
      const entry = { at: event.at, by: event.by ?? "merchant", request: event.request, outcome: decision.outcome, code: decision.code,
                      message: decision.message, consumed_refinement: decision.consumes,
                      constraints_after: seg.constraints, reach_after: decision.outcome === "applied" ? seg.reach : (decision.code === "floor" ? null : seg.reach),
                      refinements_used: seg.refinements_used, refinements_left: Math.max(0, seg.max_refinements - seg.refinements_used) };
      seg.log.push(entry);
      log(next, event, { campaign_id: campaign.id, ...entry });
      return next;
    }

    case "RESET_SEGMENT": {
      const c = state.campaigns[event.campaign_id];
      if (!c?.segment) return reject(state, event, "campaign has no segment");
      if (!["draft", "pending"].includes(c.status)) return reject(state, event, `segment cannot change while the campaign is ${c.status}`);
      const next = clone(state);
      const seg = next.campaigns[event.campaign_id].segment;
      seg.constraints = {};
      seg.reach = seg.base_reach;
      const entry = { at: event.at, by: event.by ?? "merchant", request: "Reset to the AI segment", outcome: "reset", code: "reset",
                      message: `Back to the segment Mobius proposed: ${seg.base_reach.toLocaleString()} cardholders. Refinements used stay used (${seg.refinements_used} of ${seg.max_refinements}).`,
                      consumed_refinement: false, constraints_after: {}, reach_after: seg.reach, refinements_used: seg.refinements_used,
                      refinements_left: Math.max(0, seg.max_refinements - seg.refinements_used) };
      seg.log.push(entry);
      log(next, event, { campaign_id: event.campaign_id, ...entry });
      return next;
    }

    // ---------------------------------------------------------------- push to the whole cohort
    // The named personas are six people out of a 400-cardholder allocation. This delivers to the
    // named ones individually (so their feeds move) and advances the counters by the allocation's
    // rounded figure for everyone else, so the reach cap can actually fire on stage.
    case "PUSH_COHORT": {
      const c = state.campaigns[event.campaign_id];
      if (!c) return reject(state, event, "unknown campaign");
      if (c.status !== "active") return reject(state, event, `campaign is ${c.status}, not active`);
      if (c.reach == null) return reject(state, event, "campaign has no allocation to push to");
      // Gate the whole send — named cardholders and the aggregate rest together — before anything
      // moves, so the throttle and the kill switch see the real size of it.
      const plan = pushPreview(state, event.campaign_id, { cohort: true });
      if (!plan.gate.ok) return reject(state, event, plan.gate.reason);
      const named = cohortNamed(state, c);
      const individual = reduce(state, { ...event, type: "PUSH_FIRED", recipients: named, _gated: true, _gate: plan.gate });
      if (individual.ledger.at(-1).type === "REJECTED") return individual;
      const next = individual;
      const campaign = next.campaigns[event.campaign_id];
      const last = campaign.pushes.at(-1);
      // Everyone in the allocation who is not a named persona: counted in aggregate, never listed.
      const cohortSize = Math.max(0, (campaign.reach_cap ?? campaign.reach) - (campaign.counters.feed_delivered - campaign.counters.seeded.feed_delivered));
      const expectedSuppressed = Math.max(0, (campaign.allocation?.push_suppressed_expected ?? 0) - campaign.counters.pushes_suppressed);
      const restDelivered = Math.max(0, cohortSize);
      const restSuppressed = Math.min(restDelivered, expectedSuppressed);
      const restSent = restDelivered - restSuppressed;
      campaign.counters.feed_delivered += restDelivered;
      campaign.counters.pushes_sent += restSent;
      campaign.counters.pushes_suppressed += restSuppressed;
      next.portfolio.contacted_this_week += restDelivered;
      last.portfolio.contacted_after = next.portfolio.contacted_this_week;
      Object.assign(last, { cohort: true, recipients: last.recipients + restDelivered, delivered: last.delivered + restDelivered, sent: last.sent + restSent,
                            suppressed: last.suppressed + restSuppressed, aggregate: { delivered: restDelivered, sent: restSent, suppressed: restSuppressed,
                            basis: "allocation_summary.json final_allocation and push.suppressed_count, less the named personas delivered individually" },
                            reconciles: (last.delivered + restDelivered) === (last.sent + restSent) + (last.suppressed + restSuppressed) });
      next.ledger.at(-1).type = "PUSH_COHORT";
      Object.assign(next.ledger.at(-1), { delivered: last.delivered, sent: last.sent, suppressed: last.suppressed, named: named.length, aggregate: last.aggregate });
      if (campaign.reach_cap != null && campaign.counters.feed_delivered - campaign.counters.seeded.feed_delivered >= campaign.reach_cap && campaign.status === "active") {
        cap(next, campaign, event, "reach cap reached");
      }
      return next;
    }

    // ---------------------------------------------------------------- RM §3.2: the two portfolio controls
    // Both write to the same portfolio slice the exposure panel reads, and both are logged with
    // who moved them. Neither is a per-campaign setting: they bind every send in the book.
    case "THROTTLE_SET": {
      const limit = Number(event.limit);
      if (!Number.isFinite(limit) || limit < 0) return reject(state, event, "the throttle must be a number of cardholders, zero or above");
      const ceiling = state.portfolio.weekly_ceiling;
      // Tightens only, for the same reason a segment narrows only: a control that can raise the
      // stated policy line is not a control, it is an override.
      if (ceiling != null && limit > ceiling) return reject(state, event, `the throttle tightens the weekly ceiling of ${ceiling.toLocaleString()}; it cannot raise it`);
      const next = clone(state);
      const from = next.portfolio.throttle?.limit ?? null;
      next.portfolio.throttle = { limit: Math.round(limit), by: event.by ?? "rm", at: event.at, note: event.note ?? null };
      next.portfolio.log.push({ at: event.at, by: event.by ?? "rm", action: "throttle set", from, to: Math.round(limit), note: event.note ?? null });
      log(next, event, { from, to: Math.round(limit), contacted_this_week: next.portfolio.contacted_this_week,
                         headroom: Math.max(0, Math.round(limit) - next.portfolio.contacted_this_week) });
      return next;
    }

    case "THROTTLE_CLEAR": {
      if (!state.portfolio.throttle) return reject(state, event, "no throttle is set");
      const next = clone(state);
      const from = next.portfolio.throttle.limit;
      next.portfolio.throttle = null;
      next.portfolio.log.push({ at: event.at, by: event.by ?? "rm", action: "throttle cleared", from, to: null, note: event.note ?? null });
      log(next, event, { from, to: null, note: "back to the weekly ceiling, which warns rather than blocks" });
      return next;
    }

    case "HALT_SENDING": {
      if (state.portfolio.halted) return reject(state, event, "sending is already halted");
      const next = clone(state);
      next.portfolio.halted = { at: event.at, by: event.by ?? "rm", reason: event.reason ?? null };
      next.portfolio.log.push({ at: event.at, by: event.by ?? "rm", action: "sending halted", from: null, to: null, note: event.reason ?? null });
      log(next, event, { by: event.by ?? "rm", reason: event.reason ?? null,
                         note: "every send in the portfolio is refused until this is released; cards already delivered are untouched" });
      return next;
    }

    case "RESUME_SENDING": {
      if (!state.portfolio.halted) return reject(state, event, "sending is not halted");
      const next = clone(state);
      const was = next.portfolio.halted;
      next.portfolio.halted = null;
      next.portfolio.log.push({ at: event.at, by: event.by ?? "rm", action: "sending resumed", from: null, to: null, note: `halted by ${was.by} at ${was.at}` });
      log(next, event, { by: event.by ?? "rm", halted_by: was.by, halted_at: was.at });
      return next;
    }

    default:
      return reject(state, event, `unknown event type ${event.type}`);
  }
}

// Live reach for display: the pipeline's rounded reach less consent departures, re-rounded so a
// single departure never reveals itself as a count of one. `rounding` is required, not defaulted:
// it used to fall back to a bare 50, which would have kept rounding to the old grain — silently,
// and on the one figure the rounding exists to protect — if the manifest's value ever changed.
export function liveReach(campaign, rounding) {
  if (campaign.reach == null || rounding == null) return null;
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
  for (const c of Object.values(state.campaigns)) {
    const seg = c.segment;
    if (!seg) continue;
    if (seg.reach < seg.floor || seg.reach % seg.rounding) problems.push(`${c.id}: segment reach ${seg.reach} is below the floor or unrounded`);
    if (seg.refinements_used > seg.max_refinements) problems.push(`${c.id}: refinements over the cap`);
    for (const e of seg.log) if (e.outcome === "refused" && e.code === "floor" && e.reach_after != null) problems.push(`${c.id}: a floor refusal reported a count`);
    if (seg.log.filter((e) => e.consumed_refinement).length !== seg.refinements_used) problems.push(`${c.id}: refinements_used != consumed log entries`);
  }
  // The portfolio counter is the sum of every campaign's live deliveries plus what the pipeline
  // had already counted for the week. If those two ever disagree the exposure panel is fiction.
  const p = state.portfolio;
  if (p) {
    const liveDelivered = Object.values(state.campaigns).reduce((a, c) => a + (c.counters.feed_delivered - (c.counters.seeded?.feed_delivered ?? 0)), 0);
    if (p.contacted_this_week !== p.seeded_contacted_this_week + liveDelivered) problems.push(`portfolio: contacted_this_week ${p.contacted_this_week} != seeded ${p.seeded_contacted_this_week} + live ${liveDelivered}`);
    if (p.throttle && p.weekly_ceiling != null && p.throttle.limit > p.weekly_ceiling) problems.push(`portfolio: throttle ${p.throttle.limit} is above the ceiling ${p.weekly_ceiling}`);
  }
  for (const ch of Object.values(state.cardholders)) {
    const total = Object.values(ch.profile.category_weights).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.001) problems.push(`${ch.id}: weights sum to ${total}`);
    if (ch.pushes_this_week > state.caps.push_per_week) problems.push(`${ch.id}: over the weekly push cap`);
    if (!ch.consent.offers && ch.feed.length) problems.push(`${ch.id}: offers off but feed not empty`);
  }
  return problems;
}
