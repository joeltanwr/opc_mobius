// Builds the initial shared state from public/data/*.json — nothing else. Every figure here is
// one the pipeline wrote with a basis; the module adds structure (counters, ledgers, the live
// demo campaign's identity) but no numbers of its own.

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

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
    frozen: null, capped: null, stopped: null, history: [], pushes: [], post_freeze: { redemptions: 0, offers: [] },
    segment_departures: { consent: 0 }, ...base,
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
      reach_rounding: constants.REACH_ROUNDING?.value ?? 50,
      provisional: {
        push_per_week: Boolean(constants.PUSH_CAP_PER_WEEK?.provisional),
        offers_per_30_days: Boolean(constants.FREQ_CAP_OFFERS?.provisional),
        profile_weight_step: Boolean(constants.PROFILE_WEIGHT_STEP?.provisional),
      },
    },
    status_display: data.constants?.status_display ?? {},
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
                    removed: alloc.removed, frequency_cap: alloc.frequency_cap },
      counters: counters(),
    });
  }

  // ------------------------------------------------------------ cardholders from showcase_personas.json
  for (const p of data.showcasePersonas ?? []) {
    state.cardholders[p.id] = {
      id: p.id, name: p.name, role: p.role, is_illustrative: true,
      consent: { offers: Boolean(p.consent?.offers), push: Boolean(p.consent?.push), changed_at: null },
      pushes_this_week: p.push_state?.pushes_this_week ?? 0,
      offers_held_30d: p.push_state?.offers_held_30d ?? 0,
      push_state_basis: p.push_state?.basis ?? null,
      profile: { category_weights: { ...(p.profile?.category_weights ?? {}) }, daypart_availability: p.profile?.daypart_availability ?? {},
                 home_district: p.profile?.home_district ?? p.home_district, last_redemption: null },
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
