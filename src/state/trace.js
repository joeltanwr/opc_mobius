// ----------------------------------------------------------------------------------------------
// The System Trace, as data — what the demo drawer prints at each stage of the recommender.
//
// DEMO LAYER. This is not product logic and decides nothing: it reads what the product already
// decided and says it in one line per stage. The hard rule is that the drawer cannot disagree
// with the screen next to it, so there is no figure of its own anywhere in this file. Every
// number comes from the shared state (the campaign the bus replays) or the loaded dataset, through
// the same helpers the screens call — liveReach for the rounded reach every dashboard prints, the
// campaign's own counters for the push, cohortTagsFor for who is in scope. Reset clears the log,
// so it clears this too; there is nothing here to clear separately.
//
// Pure, no React, so selftest.mjs can hold it against the reducer under node.
// ----------------------------------------------------------------------------------------------

import { ACQUISITION_POOL, cohortTagsFor, liveReach, offerId, reachFromSelection } from "./store.js";
import { num, sgd, pctOf } from "../data/format.js";
import { DEMO_CAMPAIGN_ID, TRACE, CONSOLIDATED_CARDHOLDERS } from "../data/constants.js";

const MINUS = "−";

// The card a cardholder is actually holding for a campaign. A card withdrawn because they turned
// offers off is not one: it is gone from their feed, so a tile that still called them notified
// would be telling the room something their phone no longer shows.
export function heldOffer(state, campaignId, cardholderId) {
  const offer = state.offers[offerId(campaignId, cardholderId)] ?? null;
  return offer && offer.status !== "withdrawn" ? offer : null;
}

// ----------------------------------------------------------------------------------------------
// One cardholder's verdict for a campaign, and the stage that decided it.
//
//   yes   holding the card — the allocator picked them (Delivery, if the push was withheld)
//   wait  in scope, nothing sent yet — the allocator has not been fired
//   no    out — consent, a tag that rules them out of any lookalike match, or a campaign aimed
//         at a pool they are not in
//
// Scope is cohort membership against the campaign's current target tags — the same test the
// consolidated tiles and the reducer's send use, so the chip cannot disagree with the tile.
// ----------------------------------------------------------------------------------------------
export function verdictFor(state, campaign, cardholderId, label) {
  const holder = state.cardholders[cardholderId] ?? null;
  if (!holder || !campaign) return null;
  const membership = holder.cohort_membership ?? [];
  const inScope = cohortTagsFor(campaign).some((t) => membership.includes(t));
  const offer = heldOffer(state, campaign.id, cardholderId);
  const withdrawn = state.offers[offerId(campaign.id, cardholderId)]?.status === "withdrawn";

  if (offer) {
    return offer.via === "feed_only"
      ? { mark: "yes", label: `${label} · feed only`, node: "delivery" }
      : { mark: "yes", label, node: "allocator" };
  }
  if (withdrawn || (inScope && !holder.consent.offers)) return { mark: "no", label: `${label} · offers off`, node: "consent" };
  if (inScope) return { mark: "wait", label, node: "allocator" };
  if (membership.some((m) => m.startsWith("excluded:"))) return { mark: "no", label, node: "tagging" };
  return { mark: "no", label, node: "recommender" };
}

// ----------------------------------------------------------------------------------------------
// The allocator's funnel for the demo campaign.
//
// The pipeline ships the pool before filtering and what each filter removed. Everything that is
// not consent or the frequency cap is targeting (already a customer, catchment, price band,
// daypart, dormant); taking it off first gives the candidate pool the allocator works on. Consent
// includes the live departures the reducer records when a cardholder turns offers off, which is
// the same adjustment liveReach makes to the reach the dashboards print — so the exact figure and
// the rounded one move together.
//
// A campaign aimed at a retention pool has no funnel to show: those pools arrive consented and
// the frequency cap has not been run against them (reachFromSelection says the same).
// ----------------------------------------------------------------------------------------------
export function allocatorFunnel(state, campaign) {
  const alloc = campaign?.allocation ?? {};
  const removed = alloc.removed ?? {};
  const departures = campaign?.segment_departures?.consent ?? 0;
  const selected = campaign?.configuration?.target_segments ?? [];
  const retention = selected.filter((p) => p !== ACQUISITION_POOL);
  const acquisition = selected.length === 0 || selected.includes(ACQUISITION_POOL);
  const targeting = Object.entries(removed)
    .filter(([k]) => k !== "consent" && k !== "frequency_cap")
    .reduce((sum, [, v]) => sum + (typeof v === "number" ? v : 0), 0);
  const candidates = alloc.candidate_pool == null ? null : alloc.candidate_pool - targeting;
  const optedOut = (removed.consent ?? 0) + departures;
  const afterConsent = candidates == null ? null : candidates - optedOut;
  const capped = removed.frequency_cap ?? 0;
  const afterCap = afterConsent == null ? null : afterConsent - capped;
  return {
    acquisition, retention, candidates, optedOut, afterConsent, capped, afterCap,
    reach: liveReach(campaign, state.caps.reach_rounding),
    existing: retention.length ? reachFromSelection(campaign).existing : null,
  };
}

// ----------------------------------------------------------------------------------------------
// The whole strip for one view.
//
//   view    "rm" | "consolidated" | "individual"
//   pull    the chatbot's last answer on screen, if any: { id, holderId, intent, location, count }
//           Published by RewardChat from the same searchPull() result its funnel line prints.
// ----------------------------------------------------------------------------------------------
export function traceOf({ state, data, view, cardholderId = null, pull = null }) {
  const campaign = state?.campaigns?.[DEMO_CAMPAIGN_ID] ?? null;
  if (!campaign) return null;
  const constants = data?.constants?.constants ?? {};
  const mid = campaign.merchant_id;
  const cfg = campaign.configuration ?? {};
  const pulling = view === "individual" && Boolean(pull) && pull.holderId === cardholderId;
  const words = TRACE.nodes;
  const node = (key, line, extra = {}) => ({ key, label: words[key].label, info: words[key].info, line, ...extra });

  // ---------------------------------------------------------------- 1. customer tagging
  const base = constants.CARDHOLDER_BASE?.value ?? null;
  const tagging = node("tagging", base == null ? "—" : `${num(base)} cardholders tagged`);

  // ---------------------------------------------------------------- 2. SME analysis
  // The trough Customer Profile prints, from the same profile field and at the same precision.
  const trough = data?.merchantProfiles?.[mid]?.trading_pattern?.trough ?? null;
  const sme = node("sme", trough
    ? `Gap: ${trough.window}, ${MINUS}${pctOf(Math.abs(trough.magnitude_vs_own_baseline_pct), 1)} vs baseline`
    : "No recurring gap");

  // ---------------------------------------------------------------- 3. eligibility gate
  const e = campaign.eligibility ?? null;
  let gate;
  if (!e) {
    gate = node("gate", "no decision on file", { status: "fail" });
  } else {
    const bands = [e.internal_score_band, e.external_score_band].filter((b) => b != null);
    const best = bands.length ? Math.min(...bands) : null;
    const balanceOk = e.avg_balance_6m_sgd > e.balance_threshold_sgd;
    const bandOk = best != null && best <= e.max_band;
    gate = node("gate",
      `${sgd(e.avg_balance_6m_sgd)} ${balanceOk ? ">" : "≤"} ${sgd(e.balance_threshold_sgd)} · band ${best ?? "—"} ${bandOk ? "≤" : ">"} ${e.max_band} → ${e.passed ? "pass" : "fail"}`,
      { status: e.passed ? "pass" : "fail" });
  }

  // ---------------------------------------------------------------- 4. reward recommender
  // The configured type and pool once the merchant has chosen, the recommendation until then.
  // "Top pick" only while the two agree, so a merchant who overrode it is not misquoted.
  const rec = campaign.recommended ?? null;
  const type = cfg.reward_type ?? rec?.reward_type ?? null;
  const typeLabel = (data?.rewardRecommendations?.[mid]?.ranked ?? []).find((r) => r.type === type)?.label ?? type ?? "—";
  const pools = cfg.target_segments?.length ? cfg.target_segments : (campaign.prefill?.fields?.target_segments ?? []);
  const poolText = pools.length
    ? pools.map((p) => (p === ACQUISITION_POOL ? `${p} (lookalike)` : p)).join(" + ")
    : "no pool selected";
  const recommender = pulling
    ? node("recommender", TRACE.skipped, { greyed: true })
    : node("recommender", `${type && type === rec?.reward_type ? "Top pick" : "Chosen"}: ${typeLabel} → ${poolText}`);

  // ---------------------------------------------------------------- 5. RM review (fixed)
  const review = node("review", words.review.line, { control: true });

  // ---------------------------------------------------------------- 6. allocator
  const f = allocatorFunnel(state, campaign);
  const capWords = `${words.cap.info} The maximum is ${num(state.caps.offers_per_30_days)} per 30 days${state.caps.provisional?.offers_per_30_days ? ", provisional" : ""}.`;
  let allocatorLine, consentLine, capLine;
  if (!f.acquisition) {
    allocatorLine = `${f.retention.join(" + ")} → ${num(f.reach)}`;
    consentLine = "pre-filtered";
    capLine = "not applied";
  } else {
    allocatorLine = f.retention.length
      ? `${num(f.afterCap)} + ${num(f.existing)} retention (rounded to ${num(f.reach)})`
      : `${num(f.candidates)} → ${num(f.afterConsent)} → ${num(f.afterCap)} (rounded to ${num(f.reach)})`;
    consentLine = `${MINUS}${num(f.optedOut)}`;
    capLine = `${MINUS}${num(f.capped)}`;
  }
  const allocator = pulling
    ? node("allocator", TRACE.skipped, { greyed: true, sub: [node("consent", "—", { greyed: true }), node("cap", "—", { greyed: true, info: capWords })] })
    : node("allocator", allocatorLine, { sub: [node("consent", consentLine), node("cap", capLine, { info: capWords })] });

  // ---------------------------------------------------------------- 7. delivery
  const fired = (campaign.pushes ?? []).length > 0;
  let deliveryLine;
  if (pulling) {
    deliveryLine = `Query → {${pull.intent}, ${pull.location}} → ${num(pull.count)} programme${pull.count === 1 ? "" : "s"}`;
  } else if (view === "consolidated") {
    const reached = CONSOLIDATED_CARDHOLDERS.filter((entry) => heldOffer(state, campaign.id, entry.id)).length;
    deliveryLine = `Push · ${num(reached)} of ${num(CONSOLIDATED_CARDHOLDERS.length)} notified`;
  } else if (view === "individual") {
    const holder = state.cardholders[cardholderId];
    const v = verdictFor(state, campaign, cardholderId, holder?.name ?? cardholderId);
    const said = !v ? "—"
      : v.mark === "yes" ? (v.node === "delivery" ? "feed only" : "notified")
      : v.mark === "wait" ? "waiting"
      : v.node === "consent" ? "offers off" : "not targeted";
    deliveryLine = `Push · ${holder?.name ?? cardholderId} ${said}`;
  } else {
    deliveryLine = fired
      ? `Push ${num(campaign.counters.pushes_sent)} sent · ${num(campaign.counters.pushes_suppressed)} suppressed`
      : "Push · not fired";
  }
  const delivery = node("delivery", deliveryLine, {
    pending: !pulling && !fired,
    sub: [node("push", null, { active: !pulling }), node("pull", null, { active: pulling })],
  });

  const nodes = [tagging, sme, gate, recommender, review, allocator, delivery];

  // The order the lights travel in: every live stage and sub-stage, top to bottom. The RM review
  // node is skipped because the demo skips it, and a greyed stage is skipped because pull did.
  const sequence = [];
  for (const n of nodes) {
    if (n.control || n.greyed) continue;
    sequence.push(n.key);
    for (const s of n.sub ?? []) if (!s.greyed && s.active !== false && s.line !== null) sequence.push(s.key);
  }

  return {
    campaignId: campaign.id,
    view,
    mode: pulling ? "pull" : "push",
    // What the drawer animates on. A new send of the demo campaign, or a new question to the
    // chatbot — both are events in state, so a fire in another tab lights this one too.
    runKey: pulling ? `pull:${pull.id}` : `push:${(campaign.pushes ?? []).length}`,
    fired,
    nodes,
    sequence,
    chips: view === "consolidated"
      ? CONSOLIDATED_CARDHOLDERS.map((entry, i) => ({ id: entry.id, n: i + 1, ...verdictFor(state, campaign, entry.id, entry.chip) }))
      : [],
  };
}
