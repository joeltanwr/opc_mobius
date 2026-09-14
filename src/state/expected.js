// Expected cost and expected incremental value for a campaign being configured — merchant
// prompt §7.2, §7.3, §7.5, §7.7. Pure and deterministic, so the number recomputes live as the
// window moves and the same code can be checked under node.
//
// Every input is named and sourced:
//   reach in window   segment narrowing table (segments.json) — how many of the segment are
//                     usually free in the dayparts the window covers
//   engagement        BASE_ENGAGEMENT_RATE (base case) to UPSIDE_ENGAGEMENT_RATE (labelled upside)
//                     — src/data/constants.js, each with a basis; this is why the value is a range
//   incremental share reward_recommendations.json — the share of redemptions that would not have
//                     happened anyway (provisional)
//   ticket            merchant_profiles.json trading_summary.avg_ticket_sgd — the merchant's own
//   limit, max value  the merchant's own configuration
// Cost is the merchant's whole cost. There is no split anywhere in this arithmetic.

import { lookupReach } from "./narrow.js";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Dayparts whose hour range intersects [start, end).
export function daypartsCovering(hours, dayparts) {
  if (!hours || hours.length !== 2) return [];
  const [a, b] = hours;
  return dayparts.filter((d) => d.hours[0] < b && d.hours[1] > a).map((d) => d.id);
}

// How many of the (possibly narrowed) segment are usually free in the window. One daypart → that
// cell; several → the largest covered cell (someone free in any of them is at least that many);
// none clearing the floor → null, and the window cannot be offered to this segment.
export function reachInWindow(segment, hours) {
  const covered = daypartsCovering(hours, segment.narrowing?.dimensions?.daypart ?? []);
  if (!covered.length) return { reach: null, dayparts: covered, basis: "no daypart covered" };
  if (segment.constraints?.daypart) {
    const inWindow = covered.includes(segment.constraints.daypart);
    return { reach: inWindow ? segment.reach : null, dayparts: covered,
             basis: inWindow ? `segment already narrowed to ${segment.constraints.daypart}` : `segment is narrowed to ${segment.constraints.daypart}, which this window does not cover` };
  }
  const counts = covered.map((d) => lookupReach(segment.narrowing, { ...segment.constraints, daypart: d })).filter((n) => n !== null);
  if (!counts.length) return { reach: null, dayparts: covered, basis: `fewer than ${segment.floor} of the segment are usually free in ${covered.join("/")}` };
  return { reach: Math.max(...counts), dayparts: covered, basis: covered.length === 1 ? `segment members usually free in the ${covered[0]}` : `largest of the covered dayparts (${covered.join(", ")})` };
}

// Is the chosen window busier than the merchant's own average slot? Above its own mean is "peak":
// no threshold constant, just the merchant's own trading pattern (trading_pattern.slots).
export function windowLoad(profile, daysOfWeek, hours) {
  const slots = profile?.trading_pattern?.slots ?? [];
  const dayparts = [...new Set(slots.map((s) => s.daypart))].map((id) => ({ id, hours: slots.find((s) => s.daypart === id).hours }));
  const covered = daypartsCovering(hours, dayparts);
  const days = new Set((daysOfWeek ?? []).map((i) => WEEKDAYS[i]));
  const inWindow = slots.filter((s) => days.has(s.weekday) && covered.includes(s.daypart));
  const share = inWindow.reduce((a, s) => a + (s.share ?? 0), 0);
  const typical = slots.length ? inWindow.length / slots.length : 0;
  return { share_pct: Math.round(share * 1000) / 10, typical_pct: Math.round(typical * 1000) / 10, slots: inWindow.length,
           is_peak: inWindow.length > 0 && share > typical, basis: "share of the trailing 12 weeks' transactions falling in the window, against the same number of average slots" };
}

export function expectedOutcome({ segment, configuration, profile, ranked, engagement }) {
  const cfg = configuration ?? {};
  const reward = (ranked ?? []).find((r) => r.type === cfg.reward_type) ?? null;
  const share = reward?.expected_incremental_share ?? null;
  const ticket = profile?.trading_summary?.avg_ticket_sgd ?? null;
  const limit = Number(cfg.redemption_limit) > 0 ? Number(cfg.redemption_limit) : null;
  const maxValue = Number(cfg.max_reward_value_sgd) > 0 ? Number(cfg.max_reward_value_sgd) : null;
  const inWindow = segment ? reachInWindow(segment, cfg.hours) : { reach: null, dayparts: [], basis: "no segment" };
  const reach = inWindow.reach;
  const band = (rate) => {
    if (reach === null || rate == null) return null;
    const redemptions = limit === null ? reach * rate : Math.min(limit, reach * rate);
    return {
      redemptions: Math.round(redemptions),
      cost_sgd: maxValue === null ? null : Math.round(redemptions * maxValue * 100) / 100,
      incremental_value_sgd: share === null || ticket === null ? null : Math.round(redemptions * share * ticket * 100) / 100,
    };
  };
  return {
    reward, incremental_share: share, incremental_share_provisional: Boolean(reward?.incremental_share_provisional),
    reach_in_window: reach, window_dayparts: inWindow.dayparts, reach_basis: inWindow.basis, ticket_sgd: ticket,
    max_cost_sgd: limit !== null && maxValue !== null ? Math.round(limit * maxValue * 100) / 100 : null,
    low: band(engagement?.low?.value), high: band(engagement?.high?.value),
    engagement,
  };
}
