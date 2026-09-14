// Proves the shared state module's rules under node against the real public/data — run by
// validate.py. Prints one JSON report; every `ok` must be true. No browser, no React: the same
// reducer the app uses, driven the way the pitch drives it.
//
//     node src/state/selftest.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATUSES, ladderAudit } from "./ladder.js";
import { reduce, audit, offerId } from "./store.js";
import { buildSeed } from "./seed.js";
import { createBus, replay } from "./bus.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUB = path.join(ROOT, "public", "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(PUB, f), "utf8"));

const data = {
  constants: load("constants.json"), merchantProfiles: load("merchant_profiles.json"), campaignResults: load("campaign_results.json"),
  allocationSummary: load("allocation_summary.json"), showcasePersonas: load("showcase_personas.json"),
  rewardRecommendations: load("reward_recommendations.json"), demandGaps: load("demand_gaps.json"), segments: load("segments.json"),
};

const report = { checks: {}, notes: {} };
const check = (name, ok, detail) => { report.checks[name] = { ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) }; };

// A tiny in-memory localStorage so the bus's log-replay path is exercised too.
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const T0 = Date.parse(data.constants.constants.DEMO_CLOCK.value);
const at = (minutes) => new Date(T0 + minutes * 60_000).toISOString();
const DEMO = "C-SJ-03";
const CONFIG = {
  reward_type: "discount", offer_headline: "20% off any drink, weekday afternoons",
  offer_terms: "20% off, capped at S$5 per transaction. Tue–Thu 14:00–17:00. One redemption per visit.",
  days_of_week: [1, 2, 3], hours: [14, 17], redemption_limit: 2,
};
const WINDOW = { start: "2026-09-14", end: "2026-10-11" };

// ---------------------------------------------------------------- ladder
const seed = buildSeed(data);
const ladder = ladderAudit(seed.status_display);
report.notes.ladder = ladder;
check("ladder: no unreachable state", ladder.unreachable.length === 0, ladder.unreachable);
check("ladder: display map keys are exactly the ladder states", ladder.missing_display.length === 0 && ladder.extra_display.length === 0, ladder);
check("ladder: every edge has an actor", ladder.every_edge_has_actor);
check("ladder: no transition to an unknown state", ladder.transitions_to_unknown.length === 0);
check("seed: every seeded campaign status is a ladder state", Object.values(seed.campaigns).every((c) => STATUSES.includes(c.status)));
check("seed: live demo campaign starts at applied with reach from allocation_summary",
      seed.campaigns[DEMO]?.status === "applied" && seed.campaigns[DEMO]?.reach === data.allocationSummary.final_allocation.count);
check("seed: Edwin starts at the weekly push cap, Bernice does not",
      seed.cardholders.edwin.pushes_this_week >= seed.caps.push_per_week && seed.cardholders.bernice.pushes_this_week < seed.caps.push_per_week,
      { edwin: seed.cardholders.edwin.pushes_this_week, bernice: seed.cardholders.bernice.pushes_this_week, cap: seed.caps.push_per_week });
check("seed: an expired reward is seeded from a real allocation row",
      Object.values(seed.offers).some((o) => o.status === "expired" && o.source === "allocations.parquet"));
check("seed: audit clean", audit(seed).length === 0, audit(seed));

// ---------------------------------------------------------------- guards before active
let s = seed;
s = reduce(s, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["bernice"], at: at(1), seq: 1 });
check("push on a campaign that is not active is rejected and logged",
      s.ledger.at(-1).type === "REJECTED" && Object.keys(s.offers).length === Object.keys(seed.offers).length, s.ledger.at(-1));
s = reduce(s, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", at: at(2), seq: 2 });
check("ladder cannot be skipped (applied → active rejected)", s.ledger.at(-1).type === "REJECTED" && s.campaigns[DEMO].status === "applied");

// ---------------------------------------------------------------- walk the ladder
s = reduce(s, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(3), seq: 3 });
s = reduce(s, { type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "rm", at: at(4), seq: 4, configuration: CONFIG });
s = reduce(s, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", at: at(5), seq: 5, window: WINDOW });
check("ladder walked applied → draft → pending → active with history recorded",
      s.campaigns[DEMO].status === "active" && s.campaigns[DEMO].history.map((h) => h.to).join(">") === "draft>pending>active");

// ---------------------------------------------------------------- event 1: push with suppression
const beforePush = s;
s = reduce(s, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["bernice", "edwin", "charles"], by: "rm", at: at(6), seq: 6 });
const push = s.campaigns[DEMO].pushes[0];
const bOffer = s.offers[offerId(DEMO, "bernice")], eOffer = s.offers[offerId(DEMO, "edwin")];
check("event 1: every recipient with offers on gets the feed card", bOffer?.status === "delivered" && eOffer?.status === "delivered");
check("event 1: Bernice gets the push, Edwin is suppressed by the weekly cap",
      bOffer?.via === "push" && eOffer?.via === "feed_only" && push.suppressed_detail.some((d) => d.id === "edwin" && /weekly push cap/.test(d.why)), push);
check("event 1: suppression is counted, not dropped — delivered = sent + suppressed",
      push.reconciles && push.delivered === 3 && push.sent === 2 && push.suppressed === 1
      && s.campaigns[DEMO].counters.pushes_suppressed === 1 && s.campaigns[DEMO].counters.feed_delivered === 3);
check("event 1: Edwin's push count did not move; Bernice's did",
      s.cardholders.edwin.pushes_this_week === beforePush.cardholders.edwin.pushes_this_week
      && s.cardholders.bernice.pushes_this_week === beforePush.cardholders.bernice.pushes_this_week + 1);
check("event 1: the notification exists for Bernice only",
      s.cardholders.bernice.notifications.length === 1 && s.cardholders.edwin.notifications.length === 0);
check("event 1: pipeline suppressed_count agrees with the seeded personas at the cap",
      data.allocationSummary.push.suppressed_count === Object.values(seed.cardholders).filter((c) => c.cohort_membership.includes("push_suppressed_frequency_cap")).length);
s = reduce(s, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["bernice"], by: "rm", at: at(7), seq: 7 });
check("event 1: a repeat push to a holder of the card is counted as already_holding, not delivered twice",
      s.campaigns[DEMO].pushes[1].already_holding === 1 && s.campaigns[DEMO].pushes[1].delivered === 0);

// ---------------------------------------------------------------- event 2: redemption propagates
const wBefore = s.cardholders.bernice.profile.category_weights[s.campaigns[DEMO].merchant_category];
s = reduce(s, { type: "REDEEMED", offer_id: bOffer.id, at: at(8), seq: 8 });
const wAfter = s.cardholders.bernice.profile.category_weights[s.campaigns[DEMO].merchant_category];
const wSum = Object.values(s.cardholders.bernice.profile.category_weights).reduce((a, b) => a + b, 0);
check("event 2: redemption counted on the campaign (merchant dashboard + RM detail read this)",
      s.campaigns[DEMO].counters.redemptions === 1 && s.campaigns[DEMO].counters.redeemers.includes("bernice") && s.offers[bOffer.id].status === "redeemed" && Boolean(s.offers[bOffer.id].code));
check("event 2: customer profile weight moved toward the merchant's category and still sums to 1",
      wAfter > wBefore && Math.abs(wSum - 1) < 0.001, { before: wBefore, after: wAfter, category: s.campaigns[DEMO].merchant_category });
check("event 2: nobody else's profile moved",
      JSON.stringify(s.cardholders.edwin.profile.category_weights) === JSON.stringify(beforePush.cardholders.edwin.profile.category_weights));
s = reduce(s, { type: "REDEEMED", offer_id: bOffer.id, at: at(9), seq: 9 });
check("event 2: a second redemption of the same card is rejected", s.ledger.at(-1).type === "REJECTED");

// ---------------------------------------------------------------- event 3: redemption limit → capped
s = reduce(s, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["alvin"], by: "rm", at: at(10), seq: 10 });
s = reduce(s, { type: "REDEEMED", offer_id: eOffer.id, at: at(11), seq: 11 });
check("event 3: reaching the redemption limit moves the campaign to capped with the reason",
      s.campaigns[DEMO].status === "capped" && s.campaigns[DEMO].capped.why === "redemption limit reached" && s.campaigns[DEMO].frozen != null);
const alvinOffer = s.offers[offerId(DEMO, "alvin")];
check("event 3: unredeemed cards close in the feed and say why", alvinOffer.status === "closed" && /fully redeemed/i.test(alvinOffer.closed.why));
check("event 3: redeemed cards keep their redemption", s.offers[bOffer.id].status === "redeemed" && s.offers[eOffer.id].status === "redeemed");
s = reduce(s, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["farah"], by: "rm", at: at(12), seq: 12 });
check("event 3: pushes after capped are rejected", s.ledger.at(-1).type === "REJECTED");
s = reduce(s, { type: "REDEEMED", offer_id: alvinOffer.id, at: at(13), seq: 13 });
check("event 3: redeeming a closed card is rejected", s.ledger.at(-1).type === "REJECTED");
check("event 3: audit clean after capped", audit(s).length === 0, audit(s));

// reach cap, on a fresh state
{
  let r = seed;
  r = reduce(r, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  r = reduce(r, { type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "rm", at: at(2), seq: 2, configuration: { ...CONFIG, redemption_limit: 50 } });  // limit is required (§7.5); large so the reach cap fires first
  r = reduce(r, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", at: at(3), seq: 3, window: WINDOW });
  r.campaigns[DEMO].reach_cap = 2;      // test input: a two-person reach so the cap is reachable
  r = reduce(r, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["bernice", "edwin"], by: "rm", at: at(4), seq: 4 });
  const held = r.offers[offerId(DEMO, "bernice")];
  check("event 3 (reach): reaching the reach cap moves the campaign to capped", r.campaigns[DEMO].status === "capped" && r.campaigns[DEMO].capped.why === "reach cap reached");
  check("event 3 (reach): delivered cards are not revoked by a reach cap", held.status === "delivered");
  r = reduce(r, { type: "REDEEMED", offer_id: held.id, at: at(5), seq: 5 });
  check("event 3 (reach): a card delivered before the reach cap is still honoured — capped by reach never revokes",
        r.offers[held.id].status === "redeemed" && r.campaigns[DEMO].post_freeze.redemptions === 1, r.ledger.at(-1));
  check("event 3 (reach): audit clean", audit(r).length === 0, audit(r));
}

// ---------------------------------------------------------------- event 4: stopped
{
  let t = seed;
  t = reduce(t, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  t = reduce(t, { type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "rm", at: at(2), seq: 2, configuration: { ...CONFIG, redemption_limit: 50 } });
  t = reduce(t, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", at: at(3), seq: 3, window: WINDOW });
  t = reduce(t, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["bernice", "edwin"], by: "rm", at: at(4), seq: 4 });
  t = reduce(t, { type: "REDEEMED", offer_id: offerId(DEMO, "bernice"), at: at(5), seq: 5 });
  t = reduce(t, { type: "STOPPED", campaign_id: DEMO, by: "merchant", reason: "owner paused it", at: at(6), seq: 6 });
  const frozen = t.campaigns[DEMO].frozen;
  check("event 4: stopped freezes results", t.campaigns[DEMO].status === "stopped" && frozen.counters.redemptions === 1);
  check("event 4: Edwin's delivered card is still valid after the stop", t.offers[offerId(DEMO, "edwin")].status === "delivered");
  t = reduce(t, { type: "REDEEMED", offer_id: offerId(DEMO, "edwin"), at: at(7), seq: 7 });
  check("event 4: a card held at the stop can still be redeemed — never revoked", t.offers[offerId(DEMO, "edwin")].status === "redeemed");
  check("event 4: frozen results did not move; the late redemption is counted apart",
        t.campaigns[DEMO].frozen.counters.redemptions === 1 && t.campaigns[DEMO].counters.redemptions === 1 && t.campaigns[DEMO].post_freeze.redemptions === 1);
  t = reduce(t, { type: "REDEEMED", offer_id: offerId(DEMO, "edwin"), at: new Date(Date.parse(WINDOW.end) + 3 * 86_400_000).toISOString(), seq: 8 });
  check("event 4: after expiry the card cannot be redeemed (already redeemed here; expiry guard exercised below)", t.ledger.at(-1).type === "REJECTED");
  t = reduce(t, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["alvin"], by: "rm", at: at(9), seq: 9 });
  check("event 4: no new deliveries after a stop", t.ledger.at(-1).type === "REJECTED");
  check("event 4: audit clean after stop", audit(t).length === 0, audit(t));
  // expiry guard across UTC offsets: 04:00 SGT on the day after expiry, written in Z
  {
    let w = seed;
    w = reduce(w, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
    w = reduce(w, { type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "rm", at: at(2), seq: 2, configuration: { ...CONFIG, redemption_limit: 50 } });
    w = reduce(w, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", at: at(3), seq: 3, window: WINDOW });
    w = reduce(w, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["bernice"], by: "rm", at: at(4), seq: 4 });
    w = reduce(w, { type: "REDEEMED", offer_id: offerId(DEMO, "bernice"), at: `${WINDOW.end}T20:00:00Z`, seq: 5 });
    check("expiry: compared as instants, not strings (20:00Z on the last day is 04:00 SGT the next day — expired)", w.ledger.at(-1).type === "REJECTED", w.ledger.at(-1));
  }
  // expiry guard on a real seeded expired card
  const expired = Object.values(seed.offers).find((o) => o.status === "expired");
  const u = reduce(seed, { type: "REDEEMED", offer_id: expired.id, at: at(1), seq: 1 });
  check("expiry: a seeded expired reward cannot be redeemed", u.ledger.at(-1).type === "REJECTED");
}

// ---------------------------------------------------------------- event 5: offers off
{
  let v = seed;
  v = reduce(v, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  v = reduce(v, { type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "rm", at: at(2), seq: 2, configuration: { ...CONFIG, redemption_limit: 50 } });
  v = reduce(v, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", at: at(3), seq: 3, window: WINDOW });
  const edwinFeedBefore = v.cardholders.edwin.feed.length;
  v = reduce(v, { type: "OFFERS_OFF", cardholder_id: "edwin", at: at(4), seq: 4 });
  check("event 5: turning offers off empties the feed", edwinFeedBefore > 0 && v.cardholders.edwin.feed.length === 0 && !v.cardholders.edwin.consent.offers);
  check("event 5: the held cards are marked withdrawn by the customer, not revoked by us",
        Object.values(v.offers).filter((o) => o.cardholder_id === "edwin" && o.status === "withdrawn").length === edwinFeedBefore);
  check("event 5: departure recorded against every non-terminal campaign's segment", v.campaigns[DEMO].segment_departures.consent === 1);
  v = reduce(v, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["bernice", "edwin"], by: "rm", at: at(5), seq: 5 });
  const p = v.campaigns[DEMO].pushes[0];
  check("event 5: a later push excludes them and counts the exclusion separately from suppression",
        p.delivered === 1 && p.excluded === 1 && p.suppressed === 0 && !v.offers[offerId(DEMO, "edwin")]);
  check("event 5: audit clean after offers off", audit(v).length === 0, audit(v));
}

// ---------------------------------------------------------------- set-up page: narrowing agent, permissions, submit
{
  let n = seed;
  n = reduce(n, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  const segBefore = n.campaigns[DEMO].segment;
  check("setup: prefill applied on → draft, every field logged and attributed to mobius",
        n.campaigns[DEMO].configuration?.reward_type === "discount" && n.campaigns[DEMO].configuration.redemption_limit === 200
        && n.campaigns[DEMO].changes.length >= 8 && n.campaigns[DEMO].changes.every((ch) => ch.by === "mobius" && ch.note), n.campaigns[DEMO].configuration);
  check("setup: segment seeded with base reach and the narrowing table", segBefore?.base_reach === 550 && segBefore.narrowing.cells.length > 0);
  const narrow = (req, by = "merchant") => { n = reduce(n, { type: "NARROW", campaign_id: DEMO, request: req, by, at: at(2), seq: n.ledger.length + 1 }); return n.campaigns[DEMO].segment.log.at(-1); };
  let e = narrow("only around the Tanjong Pagar outlet");
  check("narrow: outlet narrowing applied with a rounded reach", e.outcome === "applied" && e.reach_after === 550 && n.campaigns[DEMO].segment.constraints.outlet === "M0001-O1", e);
  e = narrow("only the weekday lunch regulars");
  check("narrow: below-floor narrowing refused with NO count reported",
        e.outcome === "refused" && e.code === "floor" && e.reach_after === null && !/\d{3}/.test(e.message.replace(String(seed.campaigns[DEMO].segment.floor), "")) && n.campaigns[DEMO].segment.reach === 550, e);
  check("narrow: a floor refusal consumes a refinement", n.campaigns[DEMO].segment.refinements_used === 2);
  e = narrow("only women");
  check("narrow: protected characteristic refused, explained, and does not consume a refinement",
        e.outcome === "refused" && e.code === "protected" && /gender/.test(e.message) && n.campaigns[DEMO].segment.refinements_used === 2, e);
  e = narrow("only Malaysians");
  check("narrow: nationality refused", e.code === "protected" && /nationality/.test(e.message));
  e = narrow("add everyone in the CBD");
  check("narrow: widening refused", e.code === "widen");
  e = narrow("weekends only");
  check("narrow: weekday/weekend redirected to the window, not treated as a segment property", e.code === "window_not_segment");
  e = narrow("only 25-34");
  check("narrow: age band applied on top of outlet (two constraints, cell exists)", e.outcome === "applied" && e.reach_after === 400 && n.campaigns[DEMO].segment.constraints.age_band === "25-34", e);
  e = narrow("only the Raffles Place kiosk");
  check("narrow: changing an existing constraint is refused as not-a-narrowing", e.code === "already_narrowed");
  e = narrow("evening only");
  check("narrow: third dimension below floor refused without a count", e.code === "floor" && e.reach_after === null);
  check("narrow: refinements 4 of 5 used", n.campaigns[DEMO].segment.refinements_used === 4);
  e = narrow("morning only");
  check("narrow: fifth refinement applied (outlet × age × morning cell exists) and uses the last slot", n.campaigns[DEMO].segment.refinements_used === 5 && e.outcome === "applied" && e.reach_after === 400, e);
  e = narrow("afternoon only");
  check("narrow: changing the daypart once set is refused as not-a-narrowing, and does not consume", e.code === "already_narrowed" && n.campaigns[DEMO].segment.refinements_used === 5, e);
  n = reduce(n, { type: "RESET_SEGMENT", campaign_id: DEMO, by: "merchant", at: at(3), seq: n.ledger.length + 1 });
  check("narrow: reset restores the AI segment but not the refinements", n.campaigns[DEMO].segment.reach === 550 && Object.keys(n.campaigns[DEMO].segment.constraints).length === 0 && n.campaigns[DEMO].segment.refinements_used === 5);
  e = narrow("afternoon only");
  check("narrow: after reset the sixth narrowing is refused by the cap — reset does not refund", e.code === "cap" && n.campaigns[DEMO].segment.refinements_used === 5 && n.campaigns[DEMO].segment.reach === 550, e);
  check("narrow: the log is on the segment, every attempt attributed", n.campaigns[DEMO].segment.log.length === 13 && n.campaigns[DEMO].segment.log.every((x) => x.by && x.request && x.message));
  check("narrow: audit clean", audit(n).length === 0, audit(n));

  const conf = (field, value, by) => { n = reduce(n, { type: "CONFIGURE", campaign_id: DEMO, field, value, by, at: at(4), seq: n.ledger.length + 1 }); return n.ledger.at(-1); };
  check("permissions: merchant sets the limit", conf("redemption_limit", 150, "merchant").type === "CONFIGURE" && n.campaigns[DEMO].configuration.redemption_limit === 150);
  check("permissions: OCBC staff cannot set the limit", conf("redemption_limit", 999, "ocbc").type === "REJECTED" && n.campaigns[DEMO].configuration.redemption_limit === 150);
  check("permissions: merchant requests push; cannot grant it", conf("push_requested", true, "merchant").type === "CONFIGURE" && conf("push_granted", true, "merchant").type === "REJECTED");
  check("permissions: OCBC staff adjust timing", conf("hours", [15, 17], "ocbc").type === "CONFIGURE");
  check("permissions: nobody can author the segment as a field", conf("segment", {}, "merchant").type === "REJECTED" && conf("segment", {}, "ocbc").type === "REJECTED");
  check("audit: every change attributed and timestamped", n.campaigns[DEMO].changes.every((ch) => ch.by && ch.at && "from" in ch && "to" in ch));

  n = reduce(n, { type: "CONFIGURE", campaign_id: DEMO, field: "outlets", value: [], by: "merchant", at: at(5), seq: n.ledger.length + 1 });
  n = reduce(n, { type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "merchant", at: at(6), seq: n.ledger.length + 1 });
  check("submit: refused while a required field is missing, naming it", n.ledger.at(-1).type === "REJECTED" && /outlets/.test(n.ledger.at(-1).reason), n.ledger.at(-1));
  n = reduce(n, { type: "CONFIGURE", campaign_id: DEMO, field: "outlets", value: ["M0001-O1", "M0001-O2"], by: "merchant", at: at(7), seq: n.ledger.length + 1 });
  n = reduce(n, { type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "merchant", at: at(8), seq: n.ledger.length + 1 });
  check("submit: complete configuration moves draft → pending (display 'Submitted')", n.campaigns[DEMO].status === "pending" && seed.status_display.pending === "Submitted" && n.campaigns[DEMO].submitted_at);
  check("after submit: merchant cannot edit, OCBC staff can, and the edit is logged",
        conf("hours", [14, 16], "merchant").type === "REJECTED" && conf("hours", [14, 16], "ocbc").type === "CONFIGURE" && n.campaigns[DEMO].changes.at(-1).by === "ocbc");
  n = reduce(n, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", push_granted: true, at: at(9), seq: n.ledger.length + 1 });
  check("approval: → active takes the window from the configuration and records push as granted at approval",
        n.campaigns[DEMO].status === "active" && n.campaigns[DEMO].window?.start === n.campaigns[DEMO].configuration.window_start && n.campaigns[DEMO].configuration.channel.push_granted === true);
  n = reduce(n, { type: "NARROW", campaign_id: DEMO, request: "afternoon only", by: "merchant", at: at(10), seq: n.ledger.length + 1 });
  check("live: the segment cannot be narrowed once live", n.ledger.at(-1).type === "REJECTED");
}

// ---------------------------------------------------------------- push to the whole cohort → reach cap fires
{
  let k = seed;
  k = reduce(k, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  k = reduce(k, { type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "merchant", at: at(2), seq: 2 });
  k = reduce(k, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", push_granted: true, at: at(3), seq: 3 });
  k = reduce(k, { type: "PUSH_COHORT", campaign_id: DEMO, by: "rm", at: at(4), seq: 4 });
  const p = k.campaigns[DEMO].pushes[0], cnt = k.campaigns[DEMO].counters;
  check("cohort push: delivers to every named cohort persona individually (Bernice pushed, Edwin feed-only)",
        k.offers[offerId(DEMO, "bernice")]?.via === "push" && k.offers[offerId(DEMO, "edwin")]?.via === "feed_only");
  check("cohort push: counters advance by the allocation figure — delivered == reach, and reconcile",
        cnt.feed_delivered === data.allocationSummary.final_allocation.count && p.reconciles && p.delivered === p.sent + p.suppressed, { p, cnt });
  check("cohort push: suppressed total equals the pipeline's suppressed_count (Edwin is the one)",
        cnt.pushes_suppressed === data.allocationSummary.push.suppressed_count && p.suppressed_detail.some((d) => d.id === "edwin"));
  check("cohort push: the reach cap fires — campaign capped with the reason, results frozen",
        k.campaigns[DEMO].status === "capped" && k.campaigns[DEMO].capped.why === "reach cap reached" && k.campaigns[DEMO].frozen != null);
  k = reduce(k, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["farah"], by: "rm", at: at(5), seq: 5 });
  check("cohort push: no further pushes after the reach cap", k.ledger.at(-1).type === "REJECTED");
  k = reduce(k, { type: "REDEEMED", offer_id: offerId(DEMO, "bernice"), at: at(6), seq: 6 });
  check("cohort push: Bernice's card is still honoured after the reach cap", k.offers[offerId(DEMO, "bernice")].status === "redeemed");
  check("cohort push: audit clean", audit(k).length === 0, audit(k));
}

// ---------------------------------------------------------------- the bus: log replay converges
{
  const storage = memoryStorage();
  const a = createBus({ seed, storage, channelFactory: () => null });
  a.dispatch({ type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm" });
  a.dispatch({ type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "rm", configuration: CONFIG });
  a.dispatch({ type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", window: WINDOW });
  a.dispatch({ type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["bernice", "edwin"], by: "rm" });
  const b = createBus({ seed, storage, channelFactory: () => null });   // a second tab opened late
  check("bus: a tab opened later derives the same state from the log",
        JSON.stringify(b.getState()) === JSON.stringify(a.getState()) && b.getLog().length === 4);
  check("bus: replay is deterministic", JSON.stringify(replay(seed, a.getLog())) === JSON.stringify(a.getState()));
}

report.ok = Object.values(report.checks).every((c) => c.ok);
report.failed = Object.entries(report.checks).filter(([, c]) => !c.ok).map(([k]) => k);
console.log(JSON.stringify(report, null, 1));
process.exitCode = report.ok ? 0 : 1;
