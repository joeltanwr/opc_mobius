// Proves the shared state module's rules under node against the real public/data — run by
// validate.py. Prints one JSON report; every `ok` must be true. No browser, no React: the same
// reducer the app uses, driven the way the pitch drives it.
//
//     node src/state/selftest.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATUSES, ladderAudit } from "./ladder.js";
import { reduce, audit, offerId, PER_CUSTOMER_OPTIONS, pushPreview, portfolioView, isQueued,
         cohortNamed, cohortTagsFor, reachFromSelection, perOutletFromSelection, onAllocatedPool } from "./store.js";
import { DEMO_LIFT_EDWIN_PUSH_CAP } from "../data/constants.js";
import { INTENTS, isFindable, searchPull } from "../screens/app/chatbot.js";
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
// ----------------------------------------------------------------------------------------------
// The weekly push cap is tested against a cardholder this file puts at the cap, not against
// whichever persona the shipped dataset happens to have there.
//
// Edwin used to be that persona and the assertions below read his seeded count directly, which
// made the frequency cap's entire proof depend on one fixture value. DEMO_LIFT_EDWIN_PUSH_CAP now
// moves him off the cap so the consolidated demo view can show both in-scope cardholders being
// notified — and the cap has to stay proven either way. So the blocks that test suppression set
// the state they are about to assert on, and what the seed ships is checked separately, here.
// ----------------------------------------------------------------------------------------------
const atCap = (st, id) => ({
  ...st,
  cardholders: { ...st.cardholders, [id]: { ...st.cardholders[id], pushes_this_week: st.caps.push_per_week } },
});

check("seed: the demo flag decides Edwin's starting push count, and Bernice is under the cap either way",
      (DEMO_LIFT_EDWIN_PUSH_CAP
        ? seed.cardholders.edwin.pushes_this_week === 0
        : seed.cardholders.edwin.pushes_this_week >= seed.caps.push_per_week)
      && seed.cardholders.bernice.pushes_this_week < seed.caps.push_per_week,
      { lifted: DEMO_LIFT_EDWIN_PUSH_CAP, edwin: seed.cardholders.edwin.pushes_this_week,
        bernice: seed.cardholders.bernice.pushes_this_week, cap: seed.caps.push_per_week });
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
// Edwin is put at the cap here rather than assumed to be there, so this proves the cap and not the
// dataset. Every assertion below is unchanged from when the seed supplied that state.
s = atCap(s, "edwin");
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

// ---------------------------------------------------------------- per-customer limit (merchant §7.5)
// The set-up page offers two values and the reducer enforces both, so the control is a rule and
// not a label. once_per_customer is enforced by construction (one card per cardholder per
// campaign); once_per_week only bites across a merchant's campaigns, which is the reading the
// reducer implements. The second campaign below is hand-built because the reducer creates no
// campaigns — the rule is what is under test, not the seed — so audit() is not run on this branch.
{
  const atDays = (d) => new Date(T0 + d * 86_400_000).toISOString();
  let q = seed;
  q = reduce(q, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  check("limit: the prefill seeds a value the reducer can actually enforce",
        PER_CUSTOMER_OPTIONS.includes(q.campaigns[DEMO].configuration.per_customer_limit), q.campaigns[DEMO].configuration.per_customer_limit);
  q = reduce(q, { type: "CONFIGURE", campaign_id: DEMO, field: "per_customer_limit", value: "once_per_week", by: "merchant", at: at(2), seq: 2 });
  q = reduce(q, { type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "merchant", at: at(3), seq: 3 });
  q = reduce(q, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", push_granted: true, at: at(4), seq: 4 });
  q = reduce(q, { type: "PUSH_FIRED", campaign_id: DEMO, recipients: ["bernice"], by: "rm", at: at(5), seq: 5 });
  q = reduce(q, { type: "REDEEMED", offer_id: offerId(DEMO, "bernice"), at: atDays(3), seq: 6 });
  check("limit: the first redemption under a weekly per-customer limit is honoured",
        q.offers[offerId(DEMO, "bernice")].status === "redeemed" && q.offers[offerId(DEMO, "bernice")].redeemed_at === atDays(3));

  // A second Soujourner campaign, same merchant, its own card in Bernice's feed.
  const second = JSON.parse(JSON.stringify(q.campaigns[DEMO]));
  Object.assign(second, { id: "C-SJ-04", counters: { ...second.counters, feed_delivered: 0, pushes_sent: 0, pushes_suppressed: 0, redemptions: 0, redeemers: [],
                          seeded: { feed_delivered: 0, pushes_sent: 0, pushes_suppressed: 0, redemptions: 0 } }, pushes: [], post_freeze: { redemptions: 0, offers: [] } });
  const twin = { ...q.offers[offerId(DEMO, "bernice")], id: offerId("C-SJ-04", "bernice"), campaign_id: "C-SJ-04", status: "delivered", redeemed_at: undefined, code: undefined };
  q = { ...q, campaigns: { ...q.campaigns, "C-SJ-04": second }, offers: { ...q.offers, [twin.id]: twin } };

  let r = reduce(q, { type: "REDEEMED", offer_id: twin.id, at: atDays(5), seq: 7 });
  check("limit: a second reward from the same merchant inside the week is refused, with the reason and the prior redemption named",
        r.ledger.at(-1).type === "REJECTED" && /per-customer limit/.test(r.ledger.at(-1).reason) && /bernice/.test(r.ledger.at(-1).reason)
        && r.offers[twin.id].status === "delivered", r.ledger.at(-1));
  r = reduce(q, { type: "REDEEMED", offer_id: twin.id, at: atDays(11), seq: 7 });
  check("limit: the same reward eight days later is honoured — the window is rolling, not a ban",
        r.offers[twin.id].status === "redeemed", r.ledger.at(-1));

  // once_per_customer is campaign-scoped: the merchant's other campaign is none of its business.
  q.campaigns["C-SJ-04"].configuration.per_customer_limit = "once_per_customer";
  r = reduce(q, { type: "REDEEMED", offer_id: twin.id, at: atDays(5), seq: 7 });
  check("limit: once per customer is scoped to its own campaign, so another campaign's redemption does not refuse it",
        r.offers[twin.id].status === "redeemed", r.ledger.at(-1));

  // A value the table does not know constrains nothing — the reducer never invents a rule.
  q.campaigns["C-SJ-04"].configuration.per_customer_limit = "once_per_visit";
  r = reduce(q, { type: "REDEEMED", offer_id: twin.id, at: atDays(5), seq: 7 });
  check("limit: a till-level rule the platform cannot observe constrains nothing here",
        r.offers[twin.id].status === "redeemed", r.ledger.at(-1));
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

// ---------------------------------------------------------------- submit straight to live (no approval step)
// The workflow the demo walks now: the merchant configures and submits, and the programme starts.
// The check that made submitting meaningful moved onto this edge with it, so an incomplete
// configuration has to be refused here exactly as it was on draft → pending.
{
  let d = seed;
  d = reduce(d, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  d = reduce(d, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "merchant", at: at(2), seq: 2,
                  configuration: { ...CONFIG, outlets: [] } });
  check("submit: draft → active is refused while a required field is missing, naming it",
        d.ledger.at(-1).type === "REJECTED" && /outlets/.test(d.ledger.at(-1).reason) && d.campaigns[DEMO].status === "draft",
        d.ledger.at(-1));

  // No explicit window: the prefilled one is used, and it opens on the demo clock's own day (see
  // seed.js `opensOn`). That is the pitch's path — submit, and the programme is live to be fired
  // at — so it is the one asserted here.
  d = reduce(d, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "merchant", at: at(3), seq: 3, configuration: CONFIG });
  check("submit: a complete configuration goes draft → active with no approval in between",
        d.campaigns[DEMO].status === "active"
        && d.campaigns[DEMO].history.map((h) => h.to).join(">") === "draft>active"
        && d.campaigns[DEMO].submitted_at && d.campaigns[DEMO].live_since);

  // Live versus in queue is a display refinement, not a ladder state: the campaign is `active`
  // either way, and only the start date decides which word the merchant reads.
  const clockDay = seed.clock;
  check("submit: the demo campaign's own window opens today, so it submits live and can be fired at",
        isQueued(d.campaigns[DEMO], clockDay) === false,
        { start: d.campaigns[DEMO].window?.start, clock: clockDay });

  let q = seed;
  q = reduce(q, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  q = reduce(q, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "merchant", at: at(2), seq: 2,
                  configuration: { ...CONFIG, window_start: "2026-12-01", window_end: "2026-12-28" },
                  window: { start: "2026-12-01", end: "2026-12-28" } });
  check("submit: a start date ahead of the clock reads as in queue, and the campaign is still active",
        q.campaigns[DEMO].status === "active" && isQueued(q.campaigns[DEMO], clockDay) === true,
        { start: q.campaigns[DEMO].window?.start, clock: clockDay });
  check("submit: audit clean after a direct submit", audit(q).length === 0, audit(q));
}

// ---------------------------------------------------------------- the target groups decide the audience
// The selector used to move every figure on the configuration screen and change nobody's feed.
// These prove the wiring: the pools a merchant picks resolve to cohort tags, those tags decide
// which cardholders the send reaches, and the reach committed at submit is what the selection adds
// up to rather than what the pipeline originally recommended.
{
  const base = reduce(seed, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  const pick = (st, pools) => reduce(st, { type: "CONFIGURE", campaign_id: DEMO, field: "target_segments", value: pools, by: "merchant", at: at(2), seq: 2 });

  check("target groups: the prefilled selection is the recommended acquisition pool",
        base.campaigns[DEMO].configuration.target_segments.join() === "Non-customers",
        base.campaigns[DEMO].configuration.target_segments);
  check("target groups: the acquisition pool resolves to the tag the pipeline writes on personas",
        cohortTagsFor(base.campaigns[DEMO]).join() === "soujourner_acquisition_cohort",
        cohortTagsFor(base.campaigns[DEMO]));
  check("target groups: the acquisition pool reaches Bernice and Edwin, not Alvin",
        cohortNamed(base, base.campaigns[DEMO]).sort().join() === "bernice,edwin",
        cohortNamed(base, base.campaigns[DEMO]));

  const champions = pick(base, ["Champions"]);
  check("target groups: selecting Champions re-points the send at Alvin and away from the acquisition pair",
        cohortTagsFor(champions.campaigns[DEMO]).join() === "soujourner_rfm:Champions"
        && cohortNamed(champions, champions.campaigns[DEMO]).join() === "alvin",
        cohortNamed(champions, champions.campaigns[DEMO]));

  const both = pick(base, ["Non-customers", "Champions"]);
  check("target groups: selecting both pools reaches all three, with no cardholder counted twice",
        cohortNamed(both, both.campaigns[DEMO]).sort().join() === "alvin,bernice,edwin",
        cohortNamed(both, both.campaigns[DEMO]));

  // Reach follows the selection through the same derivation the screen draws from.
  const pools = data.allocationSummary.retention_pools;
  check("target groups: Champions alone reaches the Champions pool's own count",
        reachFromSelection(champions.campaigns[DEMO]).total === pools["Champions"].count,
        { got: reachFromSelection(champions.campaigns[DEMO]).total, expected: pools["Champions"].count });
  check("target groups: both pools sum, and the two components stay separately reportable",
        reachFromSelection(both.campaigns[DEMO]).total === seed.campaigns[DEMO].segment.reach + pools["Champions"].count
        && reachFromSelection(both.campaigns[DEMO]).prospective === seed.campaigns[DEMO].segment.reach
        && reachFromSelection(both.campaigns[DEMO]).existing === pools["Champions"].count,
        reachFromSelection(both.campaigns[DEMO]));

  // Submitting commits it: the number the merchant read back is the number the send honours.
  let live = reduce(champions, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "merchant", at: at(3), seq: 3, configuration: CONFIG });
  check("target groups: submit commits the selection's reach onto the campaign",
        live.campaigns[DEMO].status === "active"
        && live.campaigns[DEMO].reach === pools["Champions"].count
        && live.campaigns[DEMO].target_pools.join() === "Champions",
        { reach: live.campaigns[DEMO].reach, pools: live.campaigns[DEMO].target_pools });
  check("target groups: a cap left over from a wider selection is clamped to the committed reach",
        live.campaigns[DEMO].reach_cap <= live.campaigns[DEMO].reach,
        { cap: live.campaigns[DEMO].reach_cap, reach: live.campaigns[DEMO].reach });

  live = reduce(live, { type: "PUSH_COHORT", campaign_id: DEMO, by: "rm", at: at(4), seq: 4 });
  check("target groups: the send reaches the selected pool's cardholder and not the deselected ones",
        Boolean(live.offers[offerId(DEMO, "alvin")])
        && !live.offers[offerId(DEMO, "bernice")] && !live.offers[offerId(DEMO, "edwin")],
        Object.keys(live.offers).filter((k) => k.startsWith(DEMO)));
  check("target groups: a campaign aimed off its allocated pool does not borrow the allocation's suppression expectation",
        onAllocatedPool(live.campaigns[DEMO]) === false && live.campaigns[DEMO].pushes.at(-1).aggregate.suppressed === 0,
        live.campaigns[DEMO].pushes.at(-1).aggregate);

  // ------------------------------------------------------------------ per-outlet, per selection
  // The count beside each outlet follows the selected pool, and the two kinds of pool are counted
  // by different measures: catchment for people who have never been in, the outlets they actually
  // use for people who already come in.
  const acqOutlets = perOutletFromSelection(base.campaigns[DEMO]);
  check("outlets: the acquisition pool reports its own catchment count at each outlet",
        acqOutlets.length === seed.campaigns[DEMO].segment.per_outlet.length
        && acqOutlets.filter((o) => o.state === "ok").every((o, i) => o.count === seed.campaigns[DEMO].segment.per_outlet.filter((p) => p.suppressed === false)[i].count),
        acqOutlets);
  check("outlets: an outlet below the floor on its own is suppressed, not shown as a small number",
        acqOutlets.some((o) => o.state === "suppressed") && acqOutlets.every((o) => o.state !== "ok" || o.count >= seed.campaigns[DEMO].segment.floor),
        acqOutlets.map((o) => ({ id: o.outlet_id, state: o.state, count: o.count })));
  check("outlets: nothing selected reports no count rather than the recommendation's",
        perOutletFromSelection(pick(base, []).campaigns[DEMO]).every((o) => o.state === "none_selected"));

  // The retention per-outlet table is pipeline output that may not be written yet. Until it is,
  // a retention selection must say the count is unknown — never borrow the acquisition figure,
  // which is a different group of people standing in different places.
  const champOutlets = perOutletFromSelection(champions.campaigns[DEMO]);
  const hasPerOutlet = Boolean(seed.campaigns[DEMO].allocation?.retention_pools_per_outlet);
  check("outlets: a retention pool is counted from its own per-outlet table, or reported as not computed",
        hasPerOutlet
          ? champOutlets.every((o) => ["ok", "suppressed"].includes(o.state))
          : champOutlets.every((o) => o.state === "not_computed" && o.missing.includes("Champions")),
        { hasPerOutlet, states: champOutlets.map((o) => o.state) });
  check("outlets: a not-computed count never reports a number",
        champOutlets.every((o) => o.state !== "not_computed" || o.count === null), champOutlets);

  // ------------------------------------------------------------------ qualifying vs contactable
  // Two different populations that a screen kept calling one number. Qualifying is the segment;
  // contactable is what survives consent and the frequency cap, and it is what the send delivers
  // to and what the dashboards print as Reach. Committing the qualifying figure into `reach` would
  // have had the RM's column read 550 for a send that reaches 400.
  const acq = reachFromSelection(base.campaigns[DEMO]);
  check("reach: qualifying is the segment, contactable is the pipeline's allocation after consent and the cap",
        acq.total === seed.campaigns[DEMO].segment.reach
        && acq.contactable === data.allocationSummary.final_allocation.count
        && acq.contactable < acq.total && acq.contactable_exact === true,
        { qualifying: acq.total, contactable: acq.contactable });

  let acqLive = reduce(base, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "merchant", at: at(4), seq: 4, configuration: CONFIG });
  check("reach: submit commits contactable as reach, and keeps qualifying beside it",
        acqLive.campaigns[DEMO].reach === data.allocationSummary.final_allocation.count
        && acqLive.campaigns[DEMO].qualifying_reach === seed.campaigns[DEMO].segment.reach,
        { reach: acqLive.campaigns[DEMO].reach, qualifying: acqLive.campaigns[DEMO].qualifying_reach });

  const mixed = reachFromSelection(pick(base, ["Non-customers", "Champions"]).campaigns[DEMO]);
  check("reach: a retention pool contributes its own count and marks the figure as not frequency-capped",
        mixed.contactable === data.allocationSummary.final_allocation.count + pools["Champions"].count
        && mixed.contactable_exact === false,
        { contactable: mixed.contactable, exact: mixed.contactable_exact });

  // Nothing selected is no audience, and the submit check says so by name.
  const none = reduce(pick(base, []), { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "merchant", at: at(5), seq: 5, configuration: CONFIG });
  check("target groups: submitting with no pool selected is refused, naming the field",
        none.ledger.at(-1).type === "REJECTED" && /target_segments/.test(none.ledger.at(-1).reason),
        none.ledger.at(-1));
}

// ---------------------------------------------------------------- the pull channel finds what push already sent
// The chatbot searches live campaigns. Firing the allocator delivers the whole allocation, which
// trips the reach cap and takes the campaign out of `active` in the same event — so a search that
// asked only for `active` lost the demo's own programme at the exact moment it was pushed. These
// pin the rule that replaced it: reach-capped is still findable, redemption-capped is not.
{
  let f = atCap(seed, "edwin");
  f = reduce(f, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  f = reduce(f, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "merchant", at: at(2), seq: 2, configuration: CONFIG });
  check("pull: the campaign is findable while it is live", isFindable(f.campaigns[DEMO]));

  f = reduce(f, { type: "PUSH_COHORT", campaign_id: DEMO, by: "rm", at: at(3), seq: 3 });
  check("pull: firing the allocator caps the campaign on reach — this is what broke the search",
        f.campaigns[DEMO].status === "capped" && f.campaigns[DEMO].capped.why === "reach cap reached",
        { status: f.campaigns[DEMO].status, why: f.campaigns[DEMO].capped?.why });
  check("pull: a reach-capped campaign is still findable — the cap bounds contact, not redemption",
        isFindable(f.campaigns[DEMO]));

  const coffee = INTENTS.find((i) => i.id === "coffee");
  const found = searchPull({
    intent: coffee, campaigns: f.campaigns, profiles: data.merchantProfiles,
    holderProfile: (data.showcasePersonas.find((p) => p.id === "charles") ?? {}).profile,
    clock: f.clock, adjacency: data.constants.district_adjacency ?? null,
  });
  check("pull: Charles finds the pushed Soujourner programme he was never targeted for",
        found.results.some((r) => r.campaign.id === DEMO),
        { results: found.results.map((r) => r.merchant?.name), funnel: { open: found.open, in_category: found.in_category } });

  // The other cap closes every delivered card, so nothing can be claimed and nothing should show.
  const redeemed = { ...f, campaigns: { ...f.campaigns,
    [DEMO]: { ...f.campaigns[DEMO], capped: { ...f.campaigns[DEMO].capped, why: "redemption limit reached" } } } };
  check("pull: a campaign capped because it is fully redeemed is not findable",
        !isFindable(redeemed.campaigns[DEMO]));
}

// ---------------------------------------------------------------- push to the whole cohort → reach cap fires
{
  // At the cap by construction, so the named half of the cohort push's suppression is proven here
  // rather than inherited from whatever the dataset ships.
  let k = atCap(seed, "edwin");
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

// ---------------------------------------------------------------- RM §3.2/§3.4: portfolio exposure, throttle, kill switch
{
  const pf = data.allocationSummary.portfolio, pf_alloc = data.allocationSummary;
  check("portfolio: seeded from allocation_summary in sample units, ceiling provisional, nothing engaged",
        seed.portfolio.contacted_this_week === pf.contacted_this_week && seed.portfolio.weekly_ceiling === pf.weekly_ceiling
        && seed.portfolio.ceiling_provisional === true && seed.portfolio.throttle === null && seed.portfolio.halted === null, seed.portfolio);
  check("portfolio: the ceiling is a share of the consented base, not a headcount off the 800,000",
        Math.round(seed.portfolio.ceiling_share_of_consented_base * seed.portfolio.consented_base) === seed.portfolio.weekly_ceiling,
        { share: seed.portfolio.ceiling_share_of_consented_base, base: seed.portfolio.consented_base, ceiling: seed.portfolio.weekly_ceiling });

  // Walk the campaign live, then look at what a cohort push would do before doing it. Edwin is at
  // the cap by construction so the preview has a named suppression to report.
  let g = atCap(seed, "edwin");
  g = reduce(g, { type: "ADVANCE", campaign_id: DEMO, to: "draft", by: "rm", at: at(1), seq: 1 });
  g = reduce(g, { type: "ADVANCE", campaign_id: DEMO, to: "pending", by: "rm", configuration: CONFIG, at: at(2), seq: 2 });
  g = reduce(g, { type: "ADVANCE", campaign_id: DEMO, to: "active", by: "ocbc", push_granted: true, window: WINDOW, at: at(3), seq: 3 });

  const preview = pushPreview(g, DEMO, { cohort: true });
  check("push confirmation: the preview names the suppressed cardholder and counts the suppression before anything is sent",
        preview.suppressed >= 1 && preview.named.some((n) => n.id === "edwin" && n.outcome === "suppressed" && /already had 2 of 2/.test(n.why)), preview.named);
  check("push confirmation: the preview reports how many recipients already had an offer this week",
        preview.named_already_pushed_this_week === 1 && preview.allocation_suppressed_expected === pf_alloc.push.suppressed_count,
        { already: preview.named_already_pushed_this_week, expected: preview.allocation_suppressed_expected });

  const fired = reduce(g, { type: "PUSH_COHORT", campaign_id: DEMO, by: "rm", at: at(4), seq: 4 });
  const p0 = fired.campaigns[DEMO].pushes.at(-1);
  check("push confirmation: the preview and the event agree exactly — delivered, sent, suppressed",
        preview.delivered === p0.delivered && preview.sent === p0.sent && preview.suppressed === p0.suppressed,
        { preview: { d: preview.delivered, s: preview.sent, x: preview.suppressed }, event: { d: p0.delivered, s: p0.sent, x: p0.suppressed } });
  check("portfolio: every delivered feed card moves the portfolio counter, including the suppressed one",
        fired.portfolio.contacted_this_week === seed.portfolio.contacted_this_week + p0.delivered, { after: fired.portfolio.contacted_this_week, delivered: p0.delivered });
  check("portfolio: crossing the provisional ceiling is recorded on the push, not silently allowed",
        p0.portfolio.over_ceiling === true && p0.portfolio.over_by === fired.portfolio.contacted_this_week - fired.portfolio.weekly_ceiling, p0.portfolio);
  check("portfolio: audit clean after a cohort push", audit(fired).length === 0, audit(fired));

  // The throttle: the control that binds.
  let t = reduce(g, { type: "THROTTLE_SET", limit: 400, by: "rm", note: "holding the book back this week", at: at(4), seq: 4 });
  check("throttle: set below the ceiling, logged with who moved it",
        t.portfolio.throttle.limit === 400 && t.portfolio.throttle.by === "rm" && t.portfolio.log.at(-1).action === "throttle set", t.portfolio.throttle);
  const over = reduce(t, { type: "THROTTLE_SET", limit: t.portfolio.weekly_ceiling + 1, by: "rm", at: at(5), seq: 5 });
  check("throttle: cannot be raised above the weekly ceiling — it tightens only",
        over.ledger.at(-1).type === "REJECTED" && /cannot raise it/.test(over.ledger.at(-1).reason) && over.portfolio.throttle.limit === 400);
  const blocked = reduce(t, { type: "PUSH_COHORT", campaign_id: DEMO, by: "rm", at: at(6), seq: 6 });
  check("throttle: a send that does not fit is refused whole, naming the headroom, and nothing is delivered",
        blocked.ledger.at(-1).type === "REJECTED" && /the throttle allows 400/.test(blocked.ledger.at(-1).reason)
        && blocked.campaigns[DEMO].counters.feed_delivered === 0 && blocked.portfolio.contacted_this_week === seed.portfolio.contacted_this_week,
        blocked.ledger.at(-1).reason);
  check("throttle: the preview refuses in the same words the reducer will use, so the dialog cannot promise a send that will fail",
        pushPreview(t, DEMO, { cohort: true }).gate.ok === false && pushPreview(t, DEMO, { cohort: true }).gate.reason === blocked.ledger.at(-1).reason);
  const cleared = reduce(blocked, { type: "THROTTLE_CLEAR", by: "rm", at: at(7), seq: 7 });
  const afterClear = reduce(cleared, { type: "PUSH_COHORT", campaign_id: DEMO, by: "rm", at: at(8), seq: 8 });
  check("throttle: cleared, the same send goes through", afterClear.campaigns[DEMO].counters.feed_delivered === p0.delivered);
  check("throttle: headroom is reported against the throttle, not the ceiling, once one is set",
        portfolioView(t.portfolio).throttle_headroom === 400 - t.portfolio.contacted_this_week && portfolioView(cleared.portfolio).throttle_headroom === null);

  // The kill switch: portfolio-wide, not per campaign.
  let h = reduce(g, { type: "HALT_SENDING", by: "rm", reason: "complaint spike under review", at: at(4), seq: 4 });
  check("kill switch: engaged, logged with who and why", h.portfolio.halted.by === "rm" && /complaint spike/.test(h.portfolio.halted.reason));
  const haltedCohort = reduce(h, { type: "PUSH_COHORT", campaign_id: DEMO, by: "rm", at: at(5), seq: 5 });
  check("kill switch: the campaign's own push is refused while it is engaged",
        haltedCohort.ledger.at(-1).type === "REJECTED" && /halted across the portfolio/.test(haltedCohort.ledger.at(-1).reason));
  const otherLive = Object.values(seed.campaigns).find((c) => c.status === "active" && c.id !== DEMO);
  const haltedOther = reduce(h, { type: "PUSH_FIRED", campaign_id: otherLive.id, recipients: ["farah"], by: "rm", at: at(5), seq: 5 });
  check("kill switch: it halts every campaign in the book, not just this one",
        haltedOther.ledger.at(-1).type === "REJECTED" && /halted across the portfolio/.test(haltedOther.ledger.at(-1).reason), otherLive.id);
  check("kill switch: cards already delivered are untouched by it",
        Object.values(h.offers).filter((o) => o.status === "delivered").length === Object.values(g.offers).filter((o) => o.status === "delivered").length);
  const resumed = reduce(h, { type: "RESUME_SENDING", by: "rm", at: at(6), seq: 6 });
  check("kill switch: released, sending works again and both moves are in the portfolio log",
        resumed.portfolio.halted === null && resumed.portfolio.log.map((l) => l.action).join(" → ") === "sending halted → sending resumed"
        && reduce(resumed, { type: "PUSH_COHORT", campaign_id: DEMO, by: "rm", at: at(7), seq: 7 }).campaigns[DEMO].counters.feed_delivered === p0.delivered);
  check("portfolio: audit clean after the controls have been moved", audit(resumed).length === 0 && audit(cleared).length === 0);
}

// ---------------------------------------------------------------- customer §5: the preference controls
{
  let c = seed;
  const cat = Object.keys(seed.cardholders.bernice.profile.category_weights)[0];
  check("preferences: a cardholder starts with no standing interest, and location relevance on",
        Object.keys(seed.cardholders.bernice.profile.interests ?? {}).length === 0 && seed.cardholders.bernice.consent.location === true);

  c = reduce(c, { type: "INTEREST", cardholder_id: "bernice", category: cat, direction: "less", at: at(1), seq: 1 });
  check("preferences: 'less of this' is recorded as a standing preference, not only as a nudge to the weights",
        c.cardholders.bernice.profile.interests[cat] === "less"
        && c.cardholders.bernice.profile.category_weights[cat] < seed.cardholders.bernice.profile.category_weights[cat],
        c.cardholders.bernice.profile.interests);
  check("preferences: the weights still sum to 1 after a preference change",
        Math.abs(Object.values(c.cardholders.bernice.profile.category_weights).reduce((a, b) => a + b, 0) - 1) < 0.001);

  c = reduce(c, { type: "INTEREST", cardholder_id: "bernice", category: cat, direction: "clear", at: at(2), seq: 2 });
  check("preferences: clearing removes the preference and leaves the weights where they are — undo is not a rewind",
        !(cat in c.cardholders.bernice.profile.interests)
        && c.cardholders.bernice.profile.category_weights[cat] < seed.cardholders.bernice.profile.category_weights[cat]);

  c = reduce(c, { type: "LOCATION_PREF", cardholder_id: "bernice", location: false, at: at(3), seq: 3 });
  check("preferences: location relevance is a real control that moves state and is logged",
        c.cardholders.bernice.consent.location === false && c.ledger.at(-1).type === "LOCATION_PREF" && /future segments/.test(c.ledger.at(-1).note));
  check("preferences: turning location off does not touch a card already held",
        Object.values(c.offers).filter((o) => o.cardholder_id === "bernice" && o.status === "delivered").length
        === Object.values(seed.offers).filter((o) => o.cardholder_id === "bernice" && o.status === "delivered").length);

  c = reduce(c, { type: "INTEREST", cardholder_id: "bernice", category: "not_a_category", direction: "more", at: at(4), seq: 4 });
  check("preferences: an unknown category is refused, not silently created", c.ledger.at(-1).type === "REJECTED");
  check("preferences: audit clean", audit(c).length === 0, audit(c));
}

// ---------------------------------------------------------------- customer §4: the feed has something to filter
{
  const mine = Object.values(seed.offers).filter((o) => o.cardholder_id === "bernice");
  check("feed: Bernice holds about a dozen cards, so the filters have something to bite on", mine.length >= 10, mine.length);
  check("feed: at least one is expired and at least one is still redeemable",
        mine.some((o) => o.status === "expired") && mine.some((o) => o.status === "delivered"),
        mine.map((o) => o.status));
  check("feed: the cards span at least four reward types and several merchants",
        new Set(mine.map((o) => o.reward_type)).size >= 4 && new Set(mine.map((o) => o.merchant_id)).size >= 8,
        { types: [...new Set(mine.map((o) => o.reward_type))], merchants: new Set(mine.map((o) => o.merchant_id)).size });
  check("feed: every card carries the window and expiry the list and the filters read",
        mine.every((o) => Array.isArray(o.days_of_week) && Array.isArray(o.hours) && o.expires_at));
  check("feed: Bernice is still at zero pushes this week, so the RM's push reaches her",
        seed.cardholders.bernice.pushes_this_week === 0);
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
