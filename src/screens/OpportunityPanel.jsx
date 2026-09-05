import React, { useMemo, useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import { useDemoData, merchantById } from "../data/DataProvider";
import { HERO_MERCHANT_ID, SEASONAL_MERCHANT_ID, CONSTANTS } from "../data/constants";
import { sgd, num, pct } from "../data/format";
import { Card, SectionTitle, Badge, SuppressedCard, BasisNote } from "../components/ui";

export default function OpportunityPanel() {
  const { data } = useDemoData();
  const merchant = merchantById(data.merchantDirectory, HERO_MERCHANT_ID);
  const profile = data.merchantProfiles[HERO_MERCHANT_ID];
  const ticketP50 = profile.ticket_p50_sgd;
  const engagementRate = CONSTANTS.BASE_ENGAGEMENT_RATE.value;

  const opportunities = useMemo(() => {
    return data.segments[HERO_MERCHANT_ID]
      .filter((s) => !s.suppressed)
      .map((s) => {
        const candidate = merchantById(data.merchantDirectory, s.candidate_merchant);
        const expectedValue = s.size * engagementRate * ticketP50;
        return { ...s, candidateName: candidate?.canonical_name ?? s.candidate_merchant, expectedValue };
      })
      .sort((a, b) => b.expectedValue - a.expectedValue);
  }, [data, engagementRate, ticketP50]);

  const seasonalMerchant = merchantById(data.merchantDirectory, SEASONAL_MERCHANT_ID);
  const suppressedExample = data.segments[SEASONAL_MERCHANT_ID].find((s) => s.suppressed);

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow="Screen 3 · Opportunity panel"
        title={`Every reachable gap for ${merchant.canonical_name}, ranked by expected value`}
        subtitle="Not sorted by segment size — sorted by what it's actually worth, using the same deterministic formula for every row."
      />

      <div className="space-y-3">
        {opportunities.map((op, i) => (
          <OpportunityRow key={op.segment_id} rank={i + 1} op={op} engagementRate={engagementRate} ticketP50={ticketP50} />
        ))}
      </div>

      <div className="mt-10 pt-8 border-t border-border">
        <h3 className="text-[14px] font-semibold text-ink mb-1">Also detected across the merchant book</h3>
        <p className="text-[12px] text-ink-secondary mb-4 max-w-2xl">
          Not {merchant.canonical_name}'s data — shown to demonstrate that the privacy floor is real, not
          a policy promise. The same lift computation ran for {seasonalMerchant.canonical_name} ({seasonalMerchant.category})
          and came back too small to act on.
        </p>
        <SuppressedCard label={`${seasonalMerchant.canonical_name} — lookalike segment via ${suppressedExample.candidate_merchant}`} />
      </div>
    </div>
  );
}

function OpportunityRow({ rank, op, engagementRate, ticketP50 }) {
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
            {num(op.size)} cardholders who shop at {op.candidateName}, not yet here
          </div>
          <div className="text-[12px] text-ink-secondary mt-0.5">
            Lift {op.lift.toFixed(1)}× · support {op.support} cardholders
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-num text-[18px] font-bold text-brand">{sgd(op.expectedValue)}</div>
          <div className="text-[11px] text-ink-light">expected value</div>
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
            {num(op.size)} cardholders × {pct(engagementRate)} base engagement × {sgd(ticketP50, 2)} median ticket ={" "}
            <span className="font-bold text-brand">{sgd(op.expectedValue)}</span>
          </div>
          <BasisNote>
            Engagement rate: {CONSTANTS.BASE_ENGAGEMENT_RATE.basis} Ticket size: this merchant's own median ticket (merchant_profiles.json).
          </BasisNote>
        </div>
      )}
    </Card>
  );
}
