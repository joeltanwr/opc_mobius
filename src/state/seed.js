// Builds the initial shared state from public/data/*.json — nothing else. Every figure here is
// one the pipeline wrote with a basis; the module adds structure (counters, ledgers, the live
// demo campaign's identity) but no numbers of its own.

import { PER_CUSTOMER_OPTIONS } from "./store.js";
import { DEMO_LIFT_EDWIN_PUSH_CAP } from "../data/constants.js";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// A manifest constant the seed cannot proceed without. The privacy floor and the reach rounding
// used to fall back to bare literals; a wrong floor that looks right is the worst failure mode
// this build has, so a missing one now stops the demo instead of quietly becoming 250.
function required(constants, key) {
  const c = constants[key];
  if (c?.value === undefined || c.value === null) {
    throw new Error(`constants.json is missing ${key} — the app will not render a privacy rule it cannot read.`);
  }
  return c.value;
}

function counters(seeded = {}) {
  return {
    feed_delivered: seeded.feed_delivered ?? 0, pushes_sent: seeded.pushes_sent ?? 0, pushes_suppressed: seeded.pushes_suppressed ?? 0,
    excluded_consent: 0, redemptions: seeded.redemptions ?? 0, redeemers: [],
    // What came from the pipeline before any live event, so audits can separate the two.
    seeded: { feed_delivered: seeded.feed_delivered ?? 0, pushes_sent: seeded.pushes_sent ?? 0, pushes_suppressed: seeded.pushes_suppressed ?? 0, redemptions: seeded.redemptions ?? 0 },
  };
}

function campaignShell(base) {
  return {
    configuration: null, recommended: null, window: null, reach: null, reach_cap: null, live_since: null,
    frozen: null, capped: null, stopped: null, history: [], changes: [], pushes: [], post_freeze: { redemptions: 0, offers: [] },
    segment_departures: { consent: 0 }, segment: null, prefill: null, cohort_tag: null, ...base,
  };
}

export function buildSeed(data) {
  const constants = data.constants?.constants ?? {};
  const profiles = data.merchantProfiles ?? {};
  const categoryOf = (mid) => profiles[mid]?.category ?? null;
  const nameOf = (mid) => profiles[mid]?.name ?? mid;

  const state = {
    version: 1,
    clock: constants.DEMO_CLOCK?.value ?? null,
    caps: {
      push_per_week: constants.PUSH_CAP_PER_WEEK?.value ?? null,
      offers_per_30_days: constants.FREQ_CAP_OFFERS?.value ?? null,
      profile_weight_step: constants.PROFILE_WEIGHT_STEP?.value ?? 0,
      reach_rounding: required(constants, "REACH_ROUNDING"),
      provisional: {
        push_per_week: Boolean(constants.PUSH_CAP_PER_WEEK?.provisional),
        offers_per_30_days: Boolean(constants.FREQ_CAP_OFFERS?.provisional),
        profile_weight_step: Boolean(constants.PROFILE_WEIGHT_STEP?.provisional),
      },
    },
    status_display: data.constants?.status_display ?? {},
    // One ladder state, two ways to reach it. `capped` reads "Fully redeemed" when the redemption
    // limit closed it and "Reach cap reached" when the allocation was exhausted — a campaign with
    // no redemptions must not be labelled fully redeemed. Applied at render time, like the map above.
    capped_display: data.constants?.capped_display ?? {},
    // ----------------------------------------------------------- portfolio exposure (RM §3.2)
    // The one slice that belongs to nobody's campaign. Seeded from allocation_summary.json's
    // portfolio block — every figure in sample units, the ceiling held as a share of the
    // consented base and provisional until it has a basis — and moved by every live delivery.
    portfolio: (() => {
      const pf = data.allocationSummary?.portfolio ?? {};
      return {
        week: pf.week ?? null,
        contacted_this_week: pf.contacted_this_week ?? 0,
        seeded_contacted_this_week: pf.contacted_this_week ?? 0,
        weekly_ceiling: num(pf.weekly_ceiling),
        ceiling_share_of_consented_base: pf.weekly_ceiling_share_of_consented_base ?? null,
        ceiling_provisional: Boolean(pf.ceiling_provisional),
        ceiling_basis: pf.ceiling_basis ?? null,
        consented_base: num(pf.consented_base),
        share_of_consented_base_reached_pct: pf.share_of_consented_base_reached_pct ?? null,
        concurrent_2plus: num(pf.cardholders_with_2plus_concurrent_offers),
        concurrent_basis: "allocation_summary.json portfolio.cardholders_with_2plus_concurrent_offers — the pipeline's count for this week. It is the concentration a per-campaign gate cannot see.",
        campaigns_live: pf.campaigns_live ?? null,
        note: pf.note ?? null,
        throttle: null,
        halted: null,
        log: [],
      };
    })(),
    campaigns: {},
    cardholders: {},
    offers: {},
    ledger: [],
  };

  // ------------------------------------------------------------ campaigns from campaign_results.json
  const results = data.campaignResults ?? { completed: [], active: [], applied: [] };
  for (const c of results.completed ?? []) {
    const seeded = c.measured
      ? { feed_delivered: c.cohort.treated, redemptions: c.redemption.redeemers, pushes_sent: c.cohort.treated, pushes_suppressed: 0 }
      : { feed_delivered: c.reach, redemptions: c.redemptions, pushes_sent: c.pushed, pushes_suppressed: 0 };
    state.campaigns[c.campaign_id] = campaignShell({
      id: c.campaign_id, merchant_id: c.merchant_id, merchant_name: nameOf(c.merchant_id), merchant_category: categoryOf(c.merchant_id),
      name: c.name, status: "completed", source: "campaign_results.json", measured: Boolean(c.measured), results: c,
      configuration: c.configuration, window: c.window ? { start: c.window.slice(0, 10), end: c.window.slice(-10) } : null,
      reach: c.measured ? c.cohort.treated : c.reach, counters: counters(seeded),
      frozen: { at: c.window ? c.window.slice(-10) : null, why: "window ended", counters: counters(seeded) },
    });
  }
  for (const c of results.active ?? []) {
    const seeded = { feed_delivered: c.reach, redemptions: c.redemptions, pushes_sent: c.pushed, pushes_suppressed: 0 };
    state.campaigns[c.campaign_id] = campaignShell({
      id: c.campaign_id, merchant_id: c.merchant_id, merchant_name: nameOf(c.merchant_id), merchant_category: categoryOf(c.merchant_id),
      name: c.name, status: "active", source: "campaign_results.json", measured: false, results: c,
      configuration: c.configuration, window: c.window ? { start: c.window.slice(0, 10), end: c.window.slice(-10) } : null,
      reach: c.reach, counters: counters(seeded), live_since: c.window ? c.window.slice(0, 10) : null,
    });
  }
  for (const c of results.applied ?? []) {
    state.campaigns[c.campaign_id] = campaignShell({
      id: c.campaign_id, merchant_id: c.merchant_id, merchant_name: c.merchant_name ?? nameOf(c.merchant_id), merchant_category: categoryOf(c.merchant_id),
      name: `${c.merchant_name ?? nameOf(c.merchant_id)} — application`, status: "applied", source: "campaign_results.json", measured: false, results: c,
      applied_at: c.applied_at, eligibility: c.eligibility, recommended: c.recommended_reward ? { reward_type: c.recommended_reward.type, label: c.recommended_reward.label } : null,
      counters: counters(),
    });
  }

  // ------------------------------------------------------------ the live demo campaign
  // Soujourner's next campaign: the one the merchant applies for on Tab 3 and the RM walks up the
  // ladder during the pitch. Its reach and push-cap picture are allocation_summary.json; its
  // recommended reward and window are reward_recommendations.json and demand_gaps.json. It has no
  // configuration until the RM writes one — that is the point of the ladder.
  const alloc = data.allocationSummary;
  const recs = data.rewardRecommendations?.[alloc?.merchant_id];
  const gap = (data.demandGaps ?? []).find((g) => g.merchant_id === alloc?.merchant_id);
  if (alloc) {
    const top = (recs?.ranked ?? []).find((r) => !r.disabled) ?? null;
    const seg = (data.segments?.[alloc.merchant_id] ?? []).find((x) => x.narrowing) ?? null;
    const weekdayIndex = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    // Timing and money defaults come from the merchant's own last completed campaign of the same
    // reward type, and the window runs as long as that one did. It opens on the demo clock's own
    // day — see the note on `opensOn` below, which this line used to contradict by claiming the
    // following Monday.
    const lastSame = (results.completed ?? []).filter((c) => c.merchant_id === alloc.merchant_id && c.measured && c.configuration?.reward_type === top?.type)
      .sort((a, b) => (b.window ?? "").localeCompare(a.window ?? ""))[0] ?? null;
    const clock = new Date(state.clock ?? Date.now());
    // The campaign opens the day it is approved, not the following Monday. A campaign approved on
    // stage whose window has not started yet cannot be redeemed against, and the demo's whole
    // point is that the cardholder redeems while everyone is watching.
    const opensOn = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate()));
    const lastLen = lastSame?.window ? (Date.parse(lastSame.window.slice(-10)) - Date.parse(lastSame.window.slice(0, 10))) : 27 * 86_400_000;
    const iso = (d) => d.toISOString().slice(0, 10);
    const prefillFields = {
      reward_type: top?.type ?? null,
      max_reward_value_sgd: lastSame?.configuration?.cap_per_txn_sgd ?? null,
      discount_pct: lastSame?.configuration?.discount_pct ?? null,
      days_of_week: gap?.weekdays ? gap.weekdays.map((d) => weekdayIndex[d]) : null,
      hours: gap?.hours ?? null,
      window_start: iso(opensOn), window_end: iso(new Date(opensOn.getTime() + lastLen)),
      outlets: seg ? seg.per_outlet.filter((o) => o.suppressed === false).map((o) => o.outlet_id) : null,
      redemption_limit: lastSame?.configuration?.redemption_limit ?? null,
      // §7.5 offers two values and the reducer enforces both. The last campaign of this type used
      // a till-level rule (once per visit) that constrains nothing Mobius can observe, so the
      // prefill falls back to the campaign-level default rather than seeding a dead setting.
      per_customer_limit: PER_CUSTOMER_OPTIONS.includes(lastSame?.configuration?.per_customer_limit)
        ? lastSame.configuration.per_customer_limit
        : "once_per_customer",
      push_requested: false,
      // The offer copy the RM edits (RM §5.7). Headline and terms come from the merchant's own
      // last campaign of this type, exactly as the money and timing defaults above do. The push
      // body is a template built from those fields rather than a second piece of copy nobody
      // wrote: it is the artefact that gets written carelessly, so it opens as an obvious draft.
      offer_headline: lastSame?.configuration?.offer_headline ?? null,
      offer_terms: lastSame?.configuration?.offer_terms ?? null,
      push_body: lastSame?.configuration?.offer_headline && gap?.window
        ? `${lastSame.configuration.offer_headline} at ${nameOf(alloc.merchant_id)}. Redeem ${gap.window}.`
        : null,
      // The pool the recommendation targets. Selecting a pool is choosing one Mobius proposed;
      // prefilling it is Mobius proposing it, which is the same act with the same audit entry.
      target_segments: top?.target_pool === "non_customers" ? ["Non-customers"] : null,
    };
    const basisFrom = lastSame ? `prefilled from your last ${top?.label?.toLowerCase() ?? "reward"} campaign (${lastSame.name}, campaign_results.json)` : "no prior campaign of this type; left for the merchant";
    const prefillBasis = {
      reward_type: "prefilled from reward_recommendations.json — the top-ranked reward for this gap",
      max_reward_value_sgd: basisFrom, discount_pct: basisFrom, redemption_limit: basisFrom,
      per_customer_limit: PER_CUSTOMER_OPTIONS.includes(lastSame?.configuration?.per_customer_limit)
        ? basisFrom
        : "one reward per cardholder for this campaign — the default; the merchant's last campaign used a till-level rule the platform cannot enforce",
      days_of_week: "prefilled from demand_gaps.json — the trough window", hours: "prefilled from demand_gaps.json — the trough window",
      window_start: "the day the campaign is approved — a window that has not opened yet cannot be redeemed against", window_end: `same length as ${lastSame?.name ?? "a four-week campaign"}`,
      outlets: `every outlet that clears the ${required(constants, "MIN_SEGMENT_SIZE")} floor on its own (segments.json per_outlet)`,
      push_requested: "push is a request, not a setting — off until the merchant asks",
      offer_headline: basisFrom, offer_terms: basisFrom,
      push_body: "a draft built from the headline and the trough window — the push copy is a different artefact from the feed card and is meant to be rewritten",
      target_segments: "the pool reward_recommendations.json targets for this gap",
    };
    state.campaigns["C-SJ-03"] = campaignShell({
      id: "C-SJ-03", merchant_id: alloc.merchant_id, merchant_name: nameOf(alloc.merchant_id), merchant_category: categoryOf(alloc.merchant_id),
      name: `${nameOf(alloc.merchant_id)} — ${gap?.window ?? "next campaign"}`, status: "applied", source: "live",
      basis: "reach and push-cap state from allocation_summary.json; recommended reward from reward_recommendations.json; window from demand_gaps.json",
      eligibility: recs?.eligibility ?? null,
      recommended: top ? { reward_type: top.type, label: top.label, reason: top.reason, new_or_returning: top.new_or_returning,
                           window: gap?.window ?? null, days_of_week: gap ? gap.weekdays : null, hours: gap?.hours ?? null,
                           expected_incremental_share: top.expected_incremental_share, provisional: top.incremental_share_provisional } : null,
      reach: num(alloc.final_allocation?.count), reach_cap: num(alloc.final_allocation?.count),
      allocation: { push_eligible: alloc.push.eligible, push_suppressed_expected: alloc.push.suppressed_count, cap_per_week: alloc.push.cap_per_week,
                    cap_provisional: alloc.push.cap_provisional, week: alloc.push.week, note: alloc.push.note,
                    removed: alloc.removed, frequency_cap: alloc.frequency_cap, retention_pools: alloc.retention_pools,
                    ranking_rule: alloc.ranking_rule },
      counters: counters(),
      cohort_tag: "soujourner_acquisition_cohort",
      prefill: { fields: Object.fromEntries(Object.entries(prefillFields).filter(([, v]) => v != null)), basis: prefillBasis },
      segment: seg ? {
        segment_id: seg.segment_id, label: seg.label, description: seg.description, candidate_name: seg.candidate_name,
        base_reach: num(seg.reach?.count), reach: num(seg.reach?.count), constraints: {}, refinements_used: 0,
        max_refinements: required(constants, "NARROW_MAX_REFINEMENTS"), floor: required(constants, "MIN_SEGMENT_SIZE"),
        rounding: required(constants, "REACH_ROUNDING"), protected_terms: constants.NARROW_PROTECTED_TERMS?.value ?? {},
        per_outlet: seg.per_outlet, filters: seg.filters, narrowing: seg.narrowing, log: [],
      } : null,
    });
  }

  // ------------------------------------------------------------ cardholders from showcase_personas.json
  for (const p of data.showcasePersonas ?? []) {
    state.cardholders[p.id] = {
      id: p.id, name: p.name, role: p.role, is_illustrative: true,
      // Location relevance defaults on, and the preferences screen says why: the catchment filter
      // is what keeps an offer to somewhere the cardholder can actually walk to, so turning it off
      // makes the offers worse rather than fewer. Stated as a choice, not buried as a default.
      consent: { offers: Boolean(p.consent?.offers), push: Boolean(p.consent?.push), location: true, changed_at: null },
      // Edwin ships at the cap so the frequency cap has a named face. The consolidated cardholder
      // view needs both in-scope cardholders to visibly receive the push, so the demo flag zeroes
      // his count here — once, in the seed, so no two screens disagree about him. See the flag's
      // comment in data/constants.js for what that costs and how to put it back.
      pushes_this_week: DEMO_LIFT_EDWIN_PUSH_CAP && p.id === "edwin" ? 0 : (p.push_state?.pushes_this_week ?? 0),
      offers_held_30d: p.push_state?.offers_held_30d ?? 0,
      push_state_basis: p.push_state?.basis ?? null,
      profile: { category_weights: { ...(p.profile?.category_weights ?? {}) }, daypart_availability: p.profile?.daypart_availability ?? {},
                 home_district: p.profile?.home_district ?? p.home_district, work_district: p.profile?.work_district ?? null,
                 price_band_pref: p.profile?.price_band_pref ?? null, interests: {}, last_redemption: null },
      feed: [], notifications: [], segments_left_at: null, cohort_membership: p.cohort_membership ?? [],
    };
    // Their real offer history, as the customer view's reward-card contract.
    for (const o of p.offers ?? []) {
      const oid = `${o.campaign_id}:${p.id}`;
      state.offers[oid] = {
        id: oid, campaign_id: o.campaign_id, cardholder_id: p.id, merchant_id: o.merchant_id, merchant_name: o.merchant_name,
        reward_type: o.reward_type, offer_headline: o.offer_headline, offer_terms: o.offer_terms, days_of_week: o.days_of_week, hours: o.hours,
        delivered_at: o.pushed_at ?? o.allocated_date, expires_at: o.window_end ? `${o.window_end}T23:59:59+08:00` : null,
        status: o.status, via: o.pushed_at ? (o.push_suppressed ? "feed_only" : "push") : "feed_only", source: "allocations.parquet",
      };
      if (o.status === "delivered") state.cardholders[p.id].feed.push(oid);
    }
  }
  return state;
}
