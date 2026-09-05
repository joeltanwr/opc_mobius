import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { CheckCircle2, XCircle } from "lucide-react";
import { useDemoData, merchantById } from "../data/DataProvider";
import { HERO_MERCHANT_ID, CONSTANTS } from "../data/constants";
import { sgd, num, pct } from "../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../components/ui";

export default function CampaignResults() {
  const { data } = useDemoData();
  const merchant = merchantById(data.merchantDirectory, HERO_MERCHANT_ID);
  const c = data.campaignResults;
  const ticketP50 = data.merchantProfiles[HERO_MERCHANT_ID].ticket_p50_sgd;

  // Result A's own realised rates, derived from campaign_results.json — used
  // below as the "vs." baseline for Result B instead of a second hardcoded number.
  const resultACostPerRedemption = c.reward_cost_total_sgd / c.redemption_count;
  const resultAIncrementalPerRedemption = c.incremental_transactions / c.redemption_count;

  const scenarioB = useMemo(() => {
    const seg = data.segments[HERO_MERCHANT_ID].find((s) => s.candidate_merchant === "M0198");
    const treated = Math.round(seg.size * CONSTANTS.CAMPAIGN_TREATED_SHARE.value);
    const control = seg.size - treated;
    const redemptionRate = 0.09;
    const incrementalMultiplier = 0.5;
    const costPerRedemption = 10;
    const organicRate = 0.03;
    const redemptions = Math.round(treated * redemptionRate);
    const organic = Math.round(control * organicRate);
    const incrementalTxns = redemptions * incrementalMultiplier - organic * (treated / control);
    const incrementalSales = incrementalTxns * ticketP50;
    const rewardCostTotal = redemptions * costPerRedemption;
    const merchantFunded = rewardCostTotal * CONSTANTS.FUNDING_SPLIT_OCBC_SHARE.value;
    const netContribution = incrementalSales - merchantFunded;
    return {
      candidate: "M0198", treated, control, redemptionRate, redemptions, incrementalTxns,
      incrementalSales, rewardCostTotal, merchantFunded, netContribution, costPerRedemption, incrementalMultiplier,
    };
  }, [data, ticketP50]);

  const conversionChart = [
    { group: "Treated (got the offer)", rate: c.redemption_rate },
    { group: "Control (held out)", rate: c.control_organic_conversion_rate },
  ];

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow="Screen 5 · Campaign results"
        title="Test vs. control — not before vs. after"
        subtitle={`${merchant.canonical_name}'s completed pilot campaign, measured against a held-out group from the same segment, not against its own pre-campaign baseline.`}
      />

      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Badge tone="success">Result A — cleared reward cost</Badge>
            <h3 className="text-[16px] font-bold text-ink mt-2">{c.campaign_name}</h3>
            <p className="text-[12.5px] text-ink-secondary">{c.offer_terms}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={conversionChart} margin={{ left: -10 }}>
                <CartesianGrid vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="group" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(v) => pct(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  <Cell fill="#ED1C24" />
                  <Cell fill="#94A3B8" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <BasisNote>{num(c.treated_size)} treated vs. {num(c.control_size)} held-out control, same segment (campaign_results.json).</BasisNote>
          </div>

          <div className="space-y-3">
            <ResultLine label="Redemptions" value={`${num(c.redemption_count)} (${pct(c.redemption_rate)} of treated)`} />
            <ResultLine label="Incremental transactions" value={num(c.incremental_transactions, 1)} tone="success" />
            <ResultLine label="Incremental sales" value={sgd(c.incremental_sales_sgd)} tone="success" />
            <ResultLine label="Reward cost (total / merchant share)" value={`${sgd(c.reward_cost_total_sgd)} / ${sgd(c.reward_cost_merchant_funded_sgd)}`} />
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">Net contribution</span>
              <span className="font-num text-[20px] font-bold text-success">{sgd(c.net_contribution_sgd)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-border flex items-center gap-3">
          <CheckCircle2 size={20} className="text-success shrink-0" />
          <p className="text-[13px] text-ink-secondary">
            <span className="font-semibold text-ink">{merchant.canonical_name} opened an OCBC operating account</span> on{" "}
            {new Date(c.account_opened_date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} —
            the flywheel closing, not just the campaign.
          </p>
        </div>
      </Card>

      <Card className="p-6 border-ink-light/30">
        <Badge tone="warning">Result B — illustrative, did not clear reward cost</Badge>
        <h3 className="text-[16px] font-bold text-ink mt-2 mb-1">Same method, a mismatched mechanic</h3>
        <p className="text-[12.5px] text-ink-secondary mb-4 max-w-2xl">
          Modeled with the identical test/control method against the {num(scenarioB.treated + scenarioB.control)}-cardholder
          {" "}M0198 lookalike segment, but priced as a bundle offer: a higher cost per redemption ({sgd(scenarioB.costPerRedemption)}
          {" "}vs. {sgd(resultACostPerRedemption, 2)} in Result A) with a weaker assumed behavioural response ({scenarioB.incrementalMultiplier}×
          {" "}vs. {resultAIncrementalPerRedemption.toFixed(1)}× incremental transactions per redemption). Same formula, worse inputs
          — and the number says so.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <ResultLine label="Redemptions" value={num(scenarioB.redemptions)} />
          <ResultLine label="Incremental transactions" value={num(scenarioB.incrementalTxns, 1)} />
          <ResultLine label="Incremental sales" value={sgd(scenarioB.incrementalSales)} />
          <ResultLine label="Merchant-funded cost" value={sgd(scenarioB.merchantFunded)} />
        </div>
        <div className="flex items-center gap-3 pt-3 border-t border-border">
          <XCircle size={20} className="text-warning shrink-0" />
          <p className="text-[13px] text-ink-secondary">
            Net contribution: <span className="font-num font-bold text-warning">{sgd(scenarioB.netContribution)}</span> — reward
            cost exceeded incremental margin. This mechanic would not be recommended for this segment; a system that only
            ever reports wins isn't measuring anything.
          </p>
        </div>
      </Card>
    </div>
  );
}

function ResultLine({ label, value, tone = "default" }) {
  const toneClass = { success: "text-success", warning: "text-warning", default: "text-ink" }[tone];
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] text-ink-secondary">{label}</span>
      <span className={`font-num text-[13px] font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

