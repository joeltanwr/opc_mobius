import React from "react";
import { HelpCircle } from "lucide-react";
import { Badge } from "../../components/ui";
import { num, sgd } from "../../data/format";
import { CONSTANTS } from "../../data/constants";

// Shared furniture for the four RM screens. Status colours are RM §7: pending amber, live
// emerald, completed slate; red belongs to the throttle, the kill switch and primary actions and
// to nothing else, which is why a losing net contribution below is rendered in red only where it
// is a figure the merchant is owed plainly — never as a status.

export const STATUS_TONE = {
  applied: "warning",     // pending — amber
  draft: "info",
  pending: "info",
  active: "success",      // live — emerald
  capped: "neutral",
  stopped: "neutral",
  completed: "neutral",   // completed — slate
};

export const TIER_TONE = { high: "success", medium: "info", low: "neutral", insufficient_data: "neutral" };
export const TIER_LABEL = { high: "High", medium: "Medium", low: "Low", insufficient_data: "Unranked" };

// Whole days between two instants, floored. Both come from the shipped data — the demo clock from
// constants.json, the application date from campaign_results.json — so no screen computes "now".
export function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  return Math.floor((Date.parse(toIso) - Date.parse(String(fromIso).length === 10 ? `${fromIso}T00:00:00+08:00` : fromIso)) / 86_400_000);
}

// How long an application has been waiting. Clamped at zero: a campaign applied for live during
// the demo is stamped a few seconds after the demo clock, and "waiting -1 days" is the kind of
// detail that costs a pitch its credibility for no reason.
export function daysWaiting(appliedAt, clock) {
  const d = daysBetween(appliedAt, clock);
  return d === null ? null : Math.max(0, d);
}

// A pending row ages once it has outlived the promise made to the merchant when it applied.
export const CONTACT_PROMISE_DAYS = CONSTANTS.RM_CONTACT_PROMISE_DAYS.value;
export const CONTACT_PROMISE_BASIS = CONSTANTS.RM_CONTACT_PROMISE_DAYS.basis;
export const isOverdue = (days) => days !== null && days > CONTACT_PROMISE_DAYS;

// The display map is settled once, in the pipeline manifest, and `capped` reads "Fully redeemed"
// there. A campaign can also be capped by reach rather than by redemptions, so wherever a capped
// campaign is shown the reason travels with the label — otherwise the screen says a campaign with
// no redemptions was fully redeemed, which is the kind of small untruth a reviewer catches.
export function StatusPill({ statusKey, display, note }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={STATUS_TONE[statusKey] ?? "neutral"}>{display(statusKey)}</Badge>
      {note && <span className="text-[11px] text-ink-light">{note}</span>}
    </span>
  );
}

// A figure the pipeline shipped with provisional: true. The pill is small and grey on purpose —
// a threshold nobody has calibrated should be legible as such without shouting.
export function Provisional({ title }) {
  return (
    <span title={title} className="ml-1 inline-flex items-center gap-0.5 rounded bg-canvas border border-border px-1 py-0.5 text-[10.5px] font-medium text-ink-secondary align-middle">
      provisional
      <HelpCircle size={9} className="text-ink-light" />
    </span>
  );
}

// The relationship-value score as the RM reads it: the tier, the score, and the three components
// that produced it, all on the row. The explainability claim in sme-relationship-value-score.md
// depends on the RM answering "why is this one first" without opening anything, so the components
// are never behind a disclosure.
export function PriorityCell({ priority }) {
  if (!priority) return <span className="text-[12px] text-ink-light">no score</span>;
  if (priority.tier === "insufficient_data") {
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge tone="neutral" className="border-dashed">Unranked</Badge>
        <span className="text-[11px] text-ink-light leading-snug max-w-[13rem]">{priority.rm_text}</span>
      </div>
    );
  }
  const c = priority.components ?? {};
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Badge tone={TIER_TONE[priority.tier] ?? "neutral"}>{TIER_LABEL[priority.tier] ?? priority.tier}</Badge>
        <span className="font-num text-[15px] font-bold text-ink tabular-nums">{num(priority.score)}</span>
      </div>
      <div className="flex items-center gap-2 font-num text-[11px] text-ink-secondary tabular-nums">
        <ScorePart label="size" value={c.size_points} outOf={40} />
        <ScorePart label="upside" value={c.upside_points} outOf={40} />
        <ScorePart label="credit" value={c.quality_points} outOf={20} />
      </div>
    </div>
  );
}

function ScorePart({ label, value, outOf }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink-light">{label} </span>
      <span className="font-semibold text-ink">{value == null ? "—" : num(value, 1)}</span>
      <span className="text-ink-light">/{outOf}</span>
    </span>
  );
}

// Why this merchant scores what it scores, in the RM's own words. Every number is the one in
// merchant_priority.json inputs_used, not a restatement of it.
export function priorityReading(priority) {
  if (!priority || priority.tier === "insufficient_data") return null;
  const i = priority.inputs_used ?? {};
  const capture = i.capture_ratio == null ? "—" : `${Math.round(i.capture_ratio * 1000) / 10}%`;
  return `Turnover ${sgd(i.turnover_ann_sgd)} a year against ${sgd(i.avg_casa_6m_sgd)} average balance — ${capture} of it sits with OCBC, so the rest is headroom. Best score band ${i.best_score_band ?? "—"}. Ranked against ${num(i.pool_size)} merchants on the programme, ${i.data_window}.`;
}

// Column headings and cells for the three programme tables, kept together so the tables stay
// aligned with each other — RM §7 asks for tabular figures because this view is mostly tables.
export function Th({ children, align = "left", className = "" }) {
  return <th className={`py-2 px-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-light ${align === "right" ? "text-right" : "text-left"} ${className}`}>{children}</th>;
}

export function Td({ children, align = "left", className = "" }) {
  return <td className={`py-2.5 px-3 align-top text-[13px] ${align === "right" ? "text-right font-num tabular-nums" : ""} ${className}`}>{children}</td>;
}
