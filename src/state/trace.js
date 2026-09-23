// ----------------------------------------------------------------------------------------------
// The System Trace, as data — what the demo drawer prints at each stage of the recommender.
//
// DEMO LAYER. This is not product logic and decides nothing: it reads what the product already
// decided and lays out how. Each stage names the "agent" (the demo's word for a pipeline module),
// the module and skill it implements, a one-line headline, the figures it actually worked from,
// and its rule. The hard rule is that the drawer cannot disagree with the screen next to it, so
// there is no figure of its own anywhere in this file: every number comes from the shared state
// (the campaign the bus replays) or the loaded dataset, through the same helpers the screens call.
// Reset clears the log, so it clears this too.
//
// Three shapes:
//   merchant       why this target group and this reward, for whichever merchant is on screen —
//                  follows the Customer Profile account switcher and every Reward Configuration
//                  choice, and opens the stage the last choice touched
//   consolidated / individual (push)
//                  the demo campaign from tagging to the notification
//   individual (pull)
//                  the chatbot's answer: intent → search → catchment → ranking, with the
//                  targeting stages shown as skipped
//
// Pure, no React, so selftest.mjs can hold it against the reducer under node.
// ----------------------------------------------------------------------------------------------

import { ACQUISITION_POOL, cohortTagsFor, liveReach, offerId, reachFromSelection, perOutletFromSelection } from "./store.js";
import { num, sgd, pctOf } from "../data/format.js";
import { DEMO_CAMPAIGN_ID, TRACE, CONSOLIDATED_CARDHOLDERS, REWARD_SCORE } from "../data/constants.js";
import { catchmentOf, INTENTS } from "../screens/app/chatbot.js";

const MINUS = "−";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pc = (fraction, d = 1) => pctOf(fraction * 100, d);

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
//   no    out — consent; a lift filter (price band and the like) that ruled them out of the
//         lookalike pool; or a campaign aimed at a pool they are not in
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
  // "excluded:<rule>" is written by pipeline/lift.py's filters — the Lift Agent removed them.
  if (membership.some((m) => m.startsWith("excluded:"))) return { mark: "no", label, node: "lift" };
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
// A shipped reward score, taken apart.
//
// pipeline/reward.py: rank points by position in the skill's ordering for the gap type, plus
// round(30 × expected incremental share) — Python's round, half to even — plus 10 if the target
// pool clears the floor. The floor term is read back as what is left, so the parts always add up to
// the shipped score; selftest.mjs checks that what is left is 0 or the bonus for every merchant,
// which is what proves the formula here still matches the pipeline's.
// ----------------------------------------------------------------------------------------------
export function roundHalfEven(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

export function scoreParts(entry) {
  if (!entry || entry.disabled) return { rank: 0, uplift: 0, floor: 0, total: entry?.score ?? 0, disabled: true };
  const rank = REWARD_SCORE.rank_points[entry.rank - 1] ?? 0;
  const uplift = roundHalfEven(REWARD_SCORE.uplift_weight * (entry.expected_incremental_share ?? 0));
  const floor = entry.score - rank - uplift;
  return { rank, uplift, floor, total: entry.score, disabled: false };
}

// ----------------------------------------------------------------------------------------------
// How the lookalike pool was built for a merchant, from segments.json and affinity.json.
//
// P(you | them) is the pair's support over the other merchant's cardholders (the population the
// filters start from). P(you) is read back from the shipped lift rather than recomputed from a
// second population, so the three figures on screen are always the ones that produced the lift.
// ----------------------------------------------------------------------------------------------
const FILTER_WORDS = {
  already_customer: "already yours",
  catchment: "out of reach of your outlets",
  price_band: "outside your price band",
  daypart: "not free in the gap daypart",
  dormant: "dormant",
};

export function liftStory(data, mid, campaign = null) {
  const segments = data?.segments?.[mid] ?? [];
  const aff = data?.affinity?.[mid] ?? null;
  const own = campaign && campaign.merchant_id === mid && campaign.segment
    ? segments.find((s) => s.segment_id === campaign.segment.segment_id) : null;
  const seg = own ?? segments.find((s) => s.source === "lift" || s.source === "category_catchment_fallback") ?? null;
  if (!seg) return { kind: "none" };
  const evaluated = seg.filters?.evaluated ?? null;
  const removed = Object.entries(seg.filters?.removed ?? {}).filter(([, n]) => typeof n === "number" && n > 0);
  const left = evaluated == null ? null : evaluated - removed.reduce((a, [, n]) => a + n, 0);
  const reach = seg.reach?.suppressed === false ? seg.reach.count : null;
  if (seg.source !== "lift") {
    return { kind: "fallback", seg, evaluated, removed, left, reach, peers: aff?.based_on_category_peers?.length ?? null };
  }
  const pGivenB = evaluated ? seg.support / evaluated : null;
  const pA = pGivenB != null && seg.lift ? pGivenB / seg.lift : null;
  const others = (aff?.pairs ?? []).filter((p) => p.merchant_id !== seg.candidate_merchant).slice(0, 2);
  return { kind: "lift", seg, aff, evaluated, removed, left, reach, pGivenB, pA, others, pairs: aff?.pairs?.length ?? 0 };
}

// ----------------------------------------------------------------------------------------------
// The whole strip for one view.
//
//   view        "merchant" | "consolidated" | "individual"
//   merchantId  merchant view only: the account on screen (defaults to the demo campaign's)
//   route       merchant view only: the pathname, so Reward Configuration can open the stage the
//               last choice touched
//   pull        the chatbot's last answer on screen, if any — published by RewardChat from the
//               same searchPull() result its funnel line prints
// ----------------------------------------------------------------------------------------------
export function traceOf({ state, data, view, cardholderId = null, pull = null, merchantId = null, route = null }) {
  const campaign = state?.campaigns?.[DEMO_CAMPAIGN_ID] ?? null;
  if (!campaign) return null;
  const constants = data?.constants?.constants ?? {};
  const floor = constants.MIN_SEGMENT_SIZE?.value ?? null;
  const rounding = state.caps.reach_rounding;
  const words = TRACE.nodes;
  const node = (key, line, extra = {}) => ({
    key, line, label: words[key].label, module: words[key].module ?? null, skill: words[key].skill ?? null,
    kind: words[key].kind ?? null, how: words[key].how ?? null, info: words[key].info, facts: [], ...extra,
  });
  const fact = (k, v, hi = false) => ({ k, v, hi });
  const skipped = (key, why = TRACE.skipped) => node(key, why, { greyed: true, facts: [] });

  const pulling = view === "individual" && Boolean(pull) && pull.holderId === cardholderId;
  const mid = view === "merchant" ? (merchantId ?? campaign.merchant_id) : campaign.merchant_id;
  const isCampaignMerchant = mid === campaign.merchant_id;
  const cfg = isCampaignMerchant ? (campaign.configuration ?? {}) : {};
  const profile = data?.merchantProfiles?.[mid] ?? null;
  const rec = data?.rewardRecommendations?.[mid] ?? null;
  const gap = (data?.demandGaps ?? []).find((g) => g.merchant_id === mid) ?? null;
  const merchantName = profile?.name ?? mid;

  // ---------------------------------------------------------------- tagging
  const base = constants.CARDHOLDER_BASE?.value ?? null;
  const sample = constants.SAMPLE_CARDHOLDERS?.value ?? null;
  const holder = cardholderId ? state.cardholders[cardholderId] ?? null : null;
  const tagging = node("tagging", base == null ? "—" : `${num(base)} cardholders tagged`, {
    facts: [
      fact("Cardholders", `${num(base)} (${num(sample)} in this sample)`),
      fact("Dormant rule", `< ${num(constants.DORMANT_TXN_PER_MONTH?.value)} txns a month or bottom ${num(constants.DORMANT_PERCENTILE?.value)}% — stricter wins`),
      fact("Tags", "category mix · frequency tier · local / foreign · daypart · home & work district · price band"),
    ],
  });

  // ---------------------------------------------------------------- SME analysis
  const gate0 = profile?.gate ?? null;
  const rfm = profile?.rfm ?? null;
  const rfmFact = rfm
    ? fact("RFM", `${num(rfm.customers_scored)} customers scored · lapsed ${num(rfm.lapsed_total?.count)}`)
    : fact("RFM", `not run — under ${num(gate0?.threshold)} OCBC transactions`);
  const rfmRule = fact("RFM rule", "R, F, M each scored 1–5 by quintile → segment from the R × avg(F, M) grid");
  let sme;
  if (gap?.type === "off_peak") {
    const trough = profile?.trading_pattern?.trough ?? null;
    sme = node("sme", `Gap: ${gap.window}, ${MINUS}${pctOf(Math.abs(trough?.magnitude_vs_own_baseline_pct ?? gap.magnitude_vs_own_baseline_pct), 1)} vs baseline`, {
      facts: [
        fact("Vs own baseline", `${MINUS}${pctOf(Math.abs(gap.magnitude_vs_own_baseline_pct), 1)} (flag at ≤ ${pc(constants.GAP_SLOT_RATIO?.value, 0)} of the slot's own mean)`, true),
        fact("Vs peers", `${MINUS}${pctOf(Math.abs(gap.magnitude_vs_peers_pct), 1)} across ${num(gap.peers_used)} peers (${gap.peer_basis})`),
        fact("Persistence", `below in ${num(gap.weeks_below_min)} of the last ${num(constants.GAP_TRAILING_WEEKS?.value)} weeks (needs ≥ ${num(constants.GAP_MIN_WEEKS?.value)})`),
        fact("Verdict", `${gap.confidence} confidence · ${gap.structural ? "structural — recurs weekly" : "seasonal"}`),
        rfmFact, rfmRule,
      ],
    });
  } else if (gap?.type === "cold_start") {
    sme = node("sme", `Cold start: ${num(gate0?.ocbc_txn_count)} of ${num(gate0?.threshold)} OCBC transactions`, {
      status: "fail",
      facts: [
        fact("History", `${gap.history_weeks} weeks of acquiring`, true),
        fact("Fallback", `peer daypart shape from ${num(gap.peers_used)} peers (${gap.peer_basis})`),
        rfmFact,
      ],
    });
  } else {
    sme = node("sme", gap ? "No trough vs own baseline · shape below peers" : "No gap analysis", {
      facts: gap ? [
        fact("Vs own baseline", `no slot ≤ ${pc(constants.GAP_SLOT_RATIO?.value, 0)} of its mean for ${num(constants.GAP_MIN_WEEKS?.value)} of ${num(constants.GAP_TRAILING_WEEKS?.value)} weeks`, true),
        fact("Vs peers", `${gap.confidence} confidence, ${num(gap.peers_used)} peers (${gap.peer_basis})`),
        rfmFact, rfmRule,
      ] : [rfmFact],
    });
  }
  // A window moved off the trough on Reward Configuration is the main way a campaign goes wrong.
  if (isCampaignMerchant && gap?.type === "off_peak" && cfg.days_of_week?.length && cfg.hours?.length === 2) {
    const chosen = `${cfg.days_of_week.map((d) => WEEKDAYS[d]).join("/")} ${String(cfg.hours[0]).padStart(2, "0")}:00–${String(cfg.hours[1]).padStart(2, "0")}:00`;
    const onTrough = cfg.hours[0] === gap.hours?.[0] && cfg.hours[1] === gap.hours?.[1]
      && cfg.days_of_week.every((d) => (gap.weekdays ?? []).includes(WEEKDAYS[d]));
    sme.facts.push(fact("Window chosen", `${chosen} — ${onTrough ? "inside the trough" : "outside the trough"}`, !onTrough));
  }

  // ---------------------------------------------------------------- eligibility gate
  const e = rec?.eligibility ?? (isCampaignMerchant ? campaign.eligibility : null);
  let gate;
  if (!e) {
    gate = node("gate", "no decision on file", { status: "fail" });
  } else {
    const bands = [e.internal_score_band, e.external_score_band].filter((b) => b != null);
    const best = bands.length ? Math.min(...bands) : null;
    const balanceOk = e.avg_balance_6m_sgd > e.balance_threshold_sgd;
    const bandOk = best != null && best <= e.max_band;
    const tick = (ok) => (ok ? "✓" : "✗");
    gate = node("gate",
      `${sgd(e.avg_balance_6m_sgd)} ${balanceOk ? ">" : "≤"} ${sgd(e.balance_threshold_sgd)} · band ${best ?? "—"} ${bandOk ? "≤" : ">"} ${e.max_band} → ${e.passed ? "pass" : "fail"}`,
      {
        status: e.passed ? "pass" : "fail",
        facts: [
          fact(`Avg balance, ${num(e.balance_months)} mo`, `${sgd(e.avg_balance_6m_sgd)} vs > ${sgd(e.balance_threshold_sgd)} ${tick(balanceOk)}`, !balanceOk),
          fact("Internal score", e.internal_score_band == null ? "none on file" : `band ${e.internal_score_band} ${tick(e.internal_score_band <= e.max_band)}`, e.internal_score_band > e.max_band),
          fact("External score", e.external_score_band == null ? "none on file" : `band ${e.external_score_band} ${tick(e.external_score_band <= e.max_band)}`, e.external_score_band > e.max_band),
          ...(e.passed ? [] : [fact("Why it failed", (e.reasons ?? []).join("; ") || "—", true)]),
        ],
      });
  }
  const gateFailed = e && !e.passed;
  const notRun = (key) => node(key, "not run — eligibility failed", { greyed: true });

  // ---------------------------------------------------------------- lift
  let lift;
  const L = liftStory(data, mid, isCampaignMerchant ? campaign : null);
  if (gateFailed) {
    lift = notRun("lift");
  } else if (L.kind === "lift") {
    const s = L.seg;
    const chain = [num(L.evaluated), ...L.removed.map(([k, n]) => `${MINUS}${num(n)} ${FILTER_WORDS[k] ?? k.replace(/_/g, " ")}`)].join(" → ");
    lift = node("lift", `${s.candidate_name} → ${Number(s.lift).toFixed(2)}× lift → ${L.reach == null ? "below the floor" : `${num(L.reach)} lookalikes`}`, {
      facts: [
        fact("Pairs scored", `${num(L.pairs)} merchants · support ≥ ${num(L.aff?.min_support)} · ${num(L.aff?.aggregators_excluded)} aggregators excluded`),
        fact("Top pair", `${s.candidate_name} (${s.candidate_category})`, true),
        fact(`P(you | ${s.candidate_name})`, `${pc(L.pGivenB)} — ${num(s.support)} of their ${num(L.evaluated)} cardholders also shop with you`),
        fact("P(you)", `${pc(L.pA)} of all cardholders`),
        fact("Lift", `${pc(L.pGivenB)} ÷ ${pc(L.pA)} = ${Number(s.lift).toFixed(2)}×`, true),
        ...(L.others.length ? [fact("Runners-up", L.others.map((o) => `${o.name} ${Number(o.lift).toFixed(2)}×`).join(" · "))] : []),
        fact("Filters", `${chain} → ${num(L.left)}`),
        fact("Target group", L.reach == null ? `${num(L.left)} — below the ${num(floor)} floor, not shown` : `${num(L.left)} → ${num(L.reach)} after rounding to ${num(rounding)}`, true),
      ],
    });
  } else if (L.kind === "fallback") {
    const chain = [num(L.evaluated), ...L.removed.map(([k, n]) => `${MINUS}${num(n)} ${FILTER_WORDS[k] ?? k.replace(/_/g, " ")}`)].join(" → ");
    lift = node("lift", `No lift pair yet → category catchment → ${L.reach == null ? "below the floor" : num(L.reach)}`, {
      facts: [
        fact("Why", `cold start: no merchant pair clears support ≥ ${num(data?.affinity?.[mid]?.min_support)}`, true),
        fact("Instead", `shoppers at ${num(L.peers)} ${profile?.category?.replace(/_/g, " ") ?? "category"} peers`),
        fact("Filters", `${chain} → ${num(L.left)}`),
        fact("Target group", L.reach == null ? "below the floor" : `${num(L.left)} → ${num(L.reach)} after rounding to ${num(rounding)}`, true),
      ],
    });
  } else {
    lift = node("lift", "No lookalike pool for this merchant", { greyed: true });
  }
  // Outlets chosen on Reward Configuration: how many of the selected pool each can reach.
  if (!gateFailed && isCampaignMerchant && lift.facts && (cfg.outlets ?? []).length) {
    const per = perOutletFromSelection(campaign, floor, rounding);
    if (per.length) {
      lift.facts.push(fact("Outlets", per.map((o) => `${o.name.split(" (")[0]} ${cfg.outlets.includes(o.outlet_id) ? "✓" : "–"} ${o.count == null ? "below floor" : num(o.count)}`).join(" · ")));
    }
  }

  // ---------------------------------------------------------------- reward
  let recommender;
  const ranked = rec?.ranked ?? [];
  if (gateFailed) {
    recommender = notRun("recommender");
  } else if (!ranked.length) {
    recommender = node("recommender", "No recommendation", { greyed: true });
  } else {
    const top = ranked.find((r) => !r.disabled) ?? ranked[0];
    const chosenType = (isCampaignMerchant && cfg.reward_type) || top.type;
    const chosen = ranked.find((r) => r.type === chosenType) ?? top;
    const pools = isCampaignMerchant && cfg.target_segments?.length ? cfg.target_segments
      : isCampaignMerchant && campaign.prefill?.fields?.target_segments ? campaign.prefill.fields.target_segments
      : chosen.target_pool === "non_customers" ? [ACQUISITION_POOL] : chosen.target_segments.filter((t) => t.reach?.suppressed === false).map((t) => t.segment);
    const poolText = pools.length ? pools.map((p) => (p === ACQUISITION_POOL ? `${p} (lookalike)` : p)).join(" + ") : "no pool clears the floor";
    const parts = (r) => { const p = scoreParts(r); return p.disabled ? "disabled · 0" : `${p.rank} + ${p.uplift} + ${p.floor} = ${p.total}`; };
    const ordering = ranked.map((r) => r.label + (r.disabled ? " (disabled)" : "")).join(" › ");
    const cp = scoreParts(chosen);
    // The headline names the pool plainly so it fits one line; the facts say where it came from.
    const poolShort = pools.length ? pools.join(" + ") : "no pool";
    recommender = node("recommender", chosen.type === top.type
      ? `Top pick: ${chosen.label} → ${poolShort} · ${chosen.score}`
      : `Chosen: ${chosen.label} #${chosen.rank} (${chosen.score}) vs ${top.label} #${top.rank} (${top.score})`, {
      facts: [
        fact("Gap type", `${String(rec.gap_type ?? "none").replace(/_/g, "-")} → ${ordering}`),
        fact("Score", "rank points + uplift + floor bonus"),
        ...ranked.map((r) => fact(`${r.rank}. ${r.label}`, parts(r), r.type === chosen.type)),
        fact("Uplift, chosen", `${REWARD_SCORE.uplift_weight} × ${chosen.expected_incremental_share} incremental share = ${cp.uplift}${chosen.incremental_share_provisional ? " (share provisional)" : ""}`),
        fact("Target", `${chosen.new_or_returning} → ${poolText}`, true),
        ...poolSources(pools),
        // The reward is ranked for one kind of customer and the pool on the page may be the other:
        // say so, rather than let the two lines above quietly disagree.
        ...(poolMismatch(chosen, pools) ? [fact("Mismatch", `${chosen.label} is ranked for ${chosen.new_or_returning.toLowerCase()}s; the pool selected is ${poolShort}`, true)] : []),
      ],
    });
  }

  // ---------------------------------------------------------------- RM review (fixed)
  const review = node("review", words.review.line, { control: true });

  // ---------------------------------------------------------------- allocator
  let allocator;
  const capWords = `${words.cap.info} The maximum is ${num(state.caps.offers_per_30_days)} per 30 days${state.caps.provisional?.offers_per_30_days ? ", provisional" : ""}.`;
  if (gateFailed) {
    allocator = notRun("allocator");
  } else if (!isCampaignMerchant) {
    allocator = node("allocator", `no campaign for ${merchantName} in this demo`, { greyed: true });
  } else {
    const f = allocatorFunnel(state, campaign);
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
    allocator = node("allocator", allocatorLine, {
      sub: [node("consent", consentLine), node("cap", capLine, { info: capWords })],
      facts: f.acquisition ? [
        fact("Candidate pool", `${num(f.candidates)} from the Lift Agent's filters`),
        fact("Consent", `${MINUS}${num(f.optedOut)} have offers turned off`),
        fact("Frequency cap", `${MINUS}${num(f.capped)} already hold ${num(state.caps.offers_per_30_days)} offers in 30 days${state.caps.provisional?.offers_per_30_days ? " (provisional)" : ""}`),
        fact("Ranking", campaign.allocation?.ranking_rule ?? "—"),
        fact("Reach", `${num(f.afterCap)} → ${num(f.reach)} after rounding to ${num(rounding)}`, true),
      ] : [fact("Retention pools", "arrive consented; the frequency cap is not run against them")],
    });
  }

  // ---------------------------------------------------------------- merchant view: done
  if (view === "merchant") {
    const nodes = [tagging, sme, gate, lift, recommender, review, allocator];
    const focus = gateFailed ? ["gate"] : merchantFocus(route, campaign, isCampaignMerchant);
    return finish({ campaign, view, mode: "recommend", nodes, focus,
      runKey: `acct:${mid}`,
      flashKey: route === "/reward-configuration" && isCampaignMerchant ? `cfg:${campaign.changes?.length ?? 0}` : `acct:${mid}`,
      subject: merchantName });
  }

  // ---------------------------------------------------------------- pull: a different path
  if (pulling) {
    const tax = data?.taxonomy?.categories ?? [];
    const catLabel = (id) => tax.find((c) => c.id === id)?.label ?? id;
    const intent = INTENTS.find((i) => i.id === pull.intent) ?? null;
    const adjacency = data?.constants?.district_adjacency ?? null;
    const { districts } = catchmentOf(holder?.profile, adjacency);
    const zone = [...districts].sort((a, b) => a - b).map((d) => `D${d}`).join(", ");
    const pullTagging = node("tagging", `${holder?.name ?? cardholderId} · ${pull.location}`, {
      facts: [
        fact("Home district", holder?.profile?.home_district == null ? "—" : `D${holder.profile.home_district}`),
        fact("Work district", holder?.profile?.work_district == null ? "—" : `D${holder.profile.work_district}`),
        fact("Catchment", `${zone} (home, work and adjacent)`, true),
      ],
    });
    const intentNode = intent
      ? node("intent", `"${pull.q}" → ${intent.id}`, {
          facts: [
            fact("Matched on", pull.phrase ? `"${pull.phrase}"` : "—", true),
            fact("Categories", intent.categories.map(catLabel).join(", ")),
            fact("Engine", "fixed intent table — not a language model"),
          ],
        })
      : node("intent", `"${pull.q}" → no intent matched`, { status: "fail", facts: [fact("Result", "fallback reply; nothing searched", true)] });
    const searchNode = intent
      ? node("search", `${num(pull.searched)} live → ${num(pull.in_category)} in category → ${num(pull.count)} near you`, {
          facts: [
            fact("Live programmes", `${num(pull.searched)} — active, or closed only by their reach cap`),
            fact("Within dates", num(pull.open)),
            fact("In category", num(pull.in_category)),
            fact("Near you", `${num(pull.count)} — an outlet in ${pull.exact_only ? "your home or work district" : "your catchment"}`, true),
            fact("Open right now", num(pull.open_now)),
          ],
        })
      : node("search", "not run — no intent", { greyed: true });
    const delivery = node("delivery", `Query → {${pull.intent ?? "?"}, ${pull.location}} → ${num(pull.count)} programme${pull.count === 1 ? "" : "s"}`, {
      facts: [
        ...(pull.results ?? []).map((r, i) => fact(`${i + 1}. ${r.name}`, `${num(r.near)} of ${num(r.of)} outlets near · ${r.open_now ? "open now" : "not open right now"}`, i === 0)),
        fact("Ranking", "open now first → most nearby outlets → name"),
        fact("Not applied", "segment match · frequency cap · push cap"),
      ],
      sub: [node("push", null, { active: false }), node("pull", null, { active: true })],
    });
    const nodes = [pullTagging, intentNode, searchNode, skipped("lift"), skipped("recommender"), skipped("allocator"), delivery];
    return finish({ campaign, view, mode: "pull", nodes, focus: ["intent", "search", "delivery"], runKey: `pull:${pull.id}`, flashKey: `pull:${pull.id}`, subject: holder?.name });
  }

  // ---------------------------------------------------------------- push: delivery
  const fired = (campaign.pushes ?? []).length > 0;
  let deliveryLine;
  if (view === "consolidated") {
    const reached = CONSOLIDATED_CARDHOLDERS.filter((entry) => heldOffer(state, campaign.id, entry.id)).length;
    deliveryLine = `Push · ${num(reached)} of ${num(CONSOLIDATED_CARDHOLDERS.length)} notified`;
  } else {
    const v = verdictFor(state, campaign, cardholderId, holder?.name ?? cardholderId);
    const said = !v ? "—"
      : v.mark === "yes" ? (v.node === "delivery" ? "feed only" : "notified")
      : v.mark === "wait" ? "waiting"
      : v.node === "consent" ? "offers off" : "not targeted";
    deliveryLine = `Push · ${holder?.name ?? cardholderId} ${said}`;
  }
  const delivery = node("delivery", deliveryLine, {
    pending: !fired,
    sub: [node("push", null, { active: true }), node("pull", null, { active: false })],
    facts: [
      fact("Feed", "every allocated cardholder gets the card"),
      fact("Push", fired
        ? `${num(campaign.counters.pushes_sent)} sent · ${num(campaign.counters.pushes_suppressed)} held back at ${num(state.caps.push_per_week)} a week${state.caps.provisional?.push_per_week ? " (provisional)" : ""}`
        : `not fired yet · cap ${num(state.caps.push_per_week)} a week`, true),
    ],
  });
  const nodes = [tagging, sme, gate, lift, recommender, review, allocator, delivery];
  return finish({ campaign, view, mode: "push", nodes, focus: ["allocator"],
    runKey: `push:${(campaign.pushes ?? []).length}`, flashKey: `push:${(campaign.pushes ?? []).length}`, subject: merchantName,
    chips: view === "consolidated"
      ? CONSOLIDATED_CARDHOLDERS.map((entry, i) => ({ id: entry.id, n: i + 1, ...verdictFor(state, campaign, entry.id, entry.chip) }))
      : [] });
}

// Where each selected pool came from: the lookalike pool is the Lift Agent's, an RFM segment is the
// SME Analysis Agent's scoring of the merchant's own customers.
function poolSources(pools) {
  const out = [];
  if (pools.includes(ACQUISITION_POOL)) out.push({ k: "Pool from", v: "Lift Agent — lookalikes who have never visited", hi: false });
  if (pools.some((p) => p !== ACQUISITION_POOL)) out.push({ k: "Pool from", v: "SME Analysis Agent — your own customers by RFM segment", hi: false });
  return out;
}

function poolMismatch(chosen, pools) {
  if (!pools.length) return false;
  const wantsNew = chosen.target_pool === "non_customers";
  const hasNew = pools.includes(ACQUISITION_POOL);
  const hasOwn = pools.some((p) => p !== ACQUISITION_POOL);
  return wantsNew ? !hasNew : !hasOwn;
}

// Which stages open on their own in the merchant view. On Reward Configuration it is the stage the
// last recorded change touched (campaign.changes — the same log the page prints), so choosing a
// reward type opens the Reward Agent and moving the window opens the SME Analysis Agent.
const FIELD_STAGES = {
  reward_type: ["recommender"], discount_pct: ["recommender"], max_reward_value_sgd: ["recommender"], min_spend_sgd: ["recommender"],
  bundle_quantity: ["recommender"], type_detail: ["recommender"],
  target_segments: ["lift", "recommender"], outlets: ["lift"],
  days_of_week: ["sme"], hours: ["sme"], window_start: ["sme"], window_end: ["sme"],
  reach_cap: ["allocator"],
};

function merchantFocus(route, campaign, isCampaignMerchant) {
  if (route === "/reward-configuration" && isCampaignMerchant) {
    const last = (campaign.changes ?? []).filter((c) => c.by !== "mobius").at(-1);
    if (last && FIELD_STAGES[last.field]) return FIELD_STAGES[last.field];
  }
  return ["lift", "recommender"];
}

function finish({ campaign, view, mode, nodes, focus, runKey, flashKey, subject, chips = [] }) {
  // The order the lights travel in: every live stage and sub-stage, top to bottom. The RM review
  // node is skipped because the demo skips it, and a greyed stage is skipped because it did not run.
  const sequence = [];
  for (const n of nodes) {
    if (n.control || n.greyed) continue;
    sequence.push(n.key);
    for (const s of n.sub ?? []) if (!s.greyed && s.active !== false && s.line !== null) sequence.push(s.key);
  }
  return { campaignId: campaign.id, view, mode, nodes, sequence, focus, runKey, flashKey, subject,
           fired: (campaign.pushes ?? []).length > 0, chips };
}
