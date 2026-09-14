import React, { useMemo, useState } from "react";
import { ChevronDown, TrendingUp, Lock } from "lucide-react";
import { useDemoData, merchantById, constantOf } from "../data/DataProvider";
import { HERO_MERCHANT_ID, CONSTANTS, screenNum } from "../data/constants";
import { sgd, num, pct, cellCount } from "../data/format";
import { Card, SectionTitle, BasisNote } from "../components/ui";

// This screen ranks SEGMENTS; Tab 3 ranks REWARD TYPES. Different objects — but they used to
// attach the same words to different arithmetic. This screen multiplied reach by engagement by
// ticket and called the result "expected value", while Tab 3 and the set-up page rank by expected
// *incremental* value: the part that would not have happened anyway. Two adjacent screens, one
// name, two quantities, and the larger of the two numbers was the one with no control group
// behind it. This screen now uses the incremental definition — the honest one, the one §2.5
// requires, and the one already in use downstream. The pipeline ships the share per target pool,
// so nothing here is invented.

export default function OpportunityPanel() {
  const { data } = useDemoData();
  const profile = merchantById(data.merchantProfiles, HERO_MERCHANT_ID);
  const avgTicket = profile.trading_summary.avg_ticket_sgd;
  const engagementRate = CONSTANTS.BASE_ENGAGEMENT_RATE.value;
  // Every segment on this screen comes from merchant-pair lift, so every one targets cardholders
  // the merchant has never served — the non_customers pool.
  const incrementalShareConst = constantOf(data, "INCREMENTAL_SHARE");
  const incrementalShare = incrementalShareConst?.value?.non_customers ?? null;
  const shareProvisional = Boolean(incrementalShareConst?.provisional);

  // Every segment the pipeline computed for this merchant. A segment whose reach is below the
  // floor ships with no count at all, so it can be listed but never scored or sized.
  const { scored, suppressed } = useMemo(() => {
    const rows = data.segments[HERO_MERCHANT_ID].map((s) => {
      // s.reach is the pipeline's cell; reachCount is its count, or null when suppressed. Keep both:
      // the cell carries the suppression reason the panel shows instead of a number.
      const reachCount = cellCount(s.reach);
      return {
        ...s,
        reachCount,
        expectedValue:
          reachCount === null || incrementalShare === null
            ? null
            : reachCount * engagementRate * incrementalShare * avgTicket,
      };
    });
    return {
      scored: rows.filter((r) => r.expectedValue !== null).sort((a, b) => b.expectedValue - a.expectedValue),
      suppressed: rows.filter((r) => r.reachCount === null),
    };
  }, [data, engagementRate, avgTicket, incrementalShare]);

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow={`Screen ${screenNum("opportunity")} · Segments, ranked`}
        title={`Every reachable gap for ${profile.name}, ranked by expected incremental value`}
        subtitle="Not sorted by segment size, and not by gross spend either — sorted by the part that would not have happened anyway, on the same deterministic formula for every row and the same definition the reward set-up page uses."
      />

      <div className="space-y-3">
        {scored.map((op, i) => (
          <OpportunityRow
            key={op.segment_id}
            rank={i + 1}
            op={op}
            engagementRate={engagementRate}
            avgTicket={avgTicket}
            incrementalShare={incrementalShare}
            shareProvisional={shareProvisional}
            shareBasis={incrementalShareConst?.basis}
          />
        ))}
      </div>

      {suppressed.length > 0 && (
        <div className="mt-8 pt-6 border-t border-border">
          <h3 className="text-[14px] font-semibold text-ink mb-1">
            Also detected, and deliberately not shown
          </h3>
          <p className="text-[12px] text-ink-secondary mb-4 max-w-2xl">
            The same lift computation found {suppressed.length === 1 ? "one more segment" : `${suppressed.length} more segments`} for{" "}
            {profile.name} that {suppressed.length === 1 ? "sits" : "sit"} below the 250-cardholder reporting floor.
            The floor is enforced in the pipeline, not at render time: no count for{" "}
            {suppressed.length === 1 ? "it" : "them"} is sent to this screen, so there is nothing here to leak
            or to reconstruct by subtraction.
          </p>
          <div className="space-y-3">
            {suppressed.map((op) => (
              <Card key={op.segment_id} className="p-5 border-dashed bg-canvas/60">
                <div className="flex items-center gap-2 text-ink-light mb-1.5">
                  <Lock size={14} />
                  <span className="text-[12px] font-semibold uppercase tracking-wide">Suppressed</span>
                </div>
                <div className="text-[13px] font-medium text-ink-secondary mb-1">
                  Lookalike segment via {op.candidate_name ?? op.candidate_merchant}
                  {op.candidate_category ? ` (${op.candidate_category})` : ""}
                </div>
                <p className="text-[13px] text-ink-light">
                  {op.reach?.reason === "below minimum segment size"
                    ? "Below the 250-cardholder reporting threshold — no size, no profile, no expected value."
                    : op.reach?.reason ?? "Below the reporting threshold."}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OpportunityRow({ rank, op, engagementRate, avgTicket, incrementalShare, shareProvisional, shareBasis }) {
  const [open, setOpen] = useState(rank === 1);
  return (
    <Card className="p-0 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-canvas/60 transition-colors"
      >
        <div className="h-8 w-8 shrink-0 rounded-full bg-canvas border border-border flex items-center justify-center font-num text-[13px] font-bold text-ink-secondary">
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-ink truncate">
            {num(op.reachCount)} cardholders who shop at {op.candidate_name ?? op.candidate_merchant}, not yet here
          </div>
          <div className="text-[12px] text-ink-secondary mt-0.5">
            Lift {op.lift.toFixed(1)}× · support {num(op.support)} cardholders · {op.label}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-num text-[18px] font-bold text-brand">{sgd(op.expectedValue)}</div>
          <div className="text-[11px] text-ink-light">expected incremental value</div>
        </div>
        <ChevronDown size={16} className={`text-ink-light shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-border bg-canvas/40">
          <div className="flex items-center gap-2 text-[12px] text-ink-secondary mb-2">
            <TrendingUp size={13} className="text-brand" />
            <span className="font-medium text-ink">Deterministic scoring — no model in this path</span>
          </div>
          <div className="font-num text-[13px] text-ink bg-white border border-border rounded-lg px-3 py-2">
            {num(op.reachCount)} cardholders × {pct(engagementRate)} base engagement × {pct(incrementalShare, 0)} incremental
            share{" "}
            {shareProvisional && (
              <span className="mr-1 rounded bg-warning-bg px-1 py-0.5 text-[11px] font-medium text-warning">provisional</span>
            )}
            × {sgd(avgTicket, 2)} average ticket = <span className="font-bold text-brand">{sgd(op.expectedValue)}</span>
          </div>
          <p className="text-[12.5px] text-ink-secondary mt-2">{op.description}</p>
          <p className="text-[12.5px] text-ink-secondary mt-2">
            The incremental share is what makes this comparable with the reward set-up page. Without it the figure would
            be gross spend in the window, which counts trade that would have arrived anyway — and that is the number a
            bank reviewer takes apart first.
          </p>
          <BasisNote>
            Engagement rate: {CONSTANTS.BASE_ENGAGEMENT_RATE.basis} Incremental share: {shareBasis} Ticket size: this
            merchant's own average ticket (merchant_profiles.json trading_summary). Reach is rounded to the nearest 50
            in the pipeline.
          </BasisNote>
        </div>
      )}
    </Card>
  );
}
