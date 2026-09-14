import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { useDemoData, merchantById, merchantName } from "../data/DataProvider";
import { HERO_MERCHANT_ID, HERO_RIVAL_MERCHANT_ID } from "../data/constants";
import { num, pctOf, cellText, cellCount } from "../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../components/ui";
import PersonaCard from "../components/PersonaCard";
import { ArrowRight, Info } from "lucide-react";

export default function DemandGap() {
  const { data } = useDemoData();
  const profile = merchantById(data.merchantProfiles, HERO_MERCHANT_ID);
  const rivalName = merchantName(data, HERO_RIVAL_MERCHANT_ID);
  const gap = data.demandGaps.find((g) => g.merchant_id === HERO_MERCHANT_ID);
  const segment = data.segments[HERO_MERCHANT_ID].find((s) => s.candidate_merchant === HERO_RIVAL_MERCHANT_ID);
  const affinityPair = data.affinity[HERO_MERCHANT_ID].pairs.find((p) => p.merchant_id === HERO_RIVAL_MERCHANT_ID);
  const rationale = data.rationales[HERO_MERCHANT_ID];
  const reach = cellCount(segment.reach);

  const personas = data.showcasePersonas;
  const alvin = personas.find((p) => p.id === "alvin");
  const bernice = personas.find((p) => p.id === "bernice");
  const charles = personas.find((p) => p.id === "charles");

  // demand_gaps.json ships the shortfall as a signed percentage against each baseline; the chart
  // shows what is left of the baseline, so 1.0 is "trading as its own week would predict".
  const gapBars = [
    { label: "Own weekday baseline", value: 1, tone: "#94A3B8" },
    { label: `${gap.window} (actual)`, value: 1 + gap.magnitude_vs_own_baseline_pct / 100, tone: "#ED1C24" },
    { label: `Comparable merchants, same window`, value: 1 + gap.magnitude_vs_peers_pct / 100, tone: "#1E293B" },
  ];

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow="Screen 2 · The demand gap"
        title="The turn: this is what your own POS can never show you"
        subtitle={`${profile.name} sees every card that taps at its own counter. It has no way to see the ${cellText(segment.reach, "below-floor number of")} people who tap at a café just like it, two streets over.`}
      />

      <Card className="p-8 mb-6 border-brand/20 bg-gradient-to-br from-white to-[#FFF8F8]">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="text-[13px] font-medium text-ink-secondary mb-1">Identified, reachable, and never served</div>
            <div className="font-num text-[52px] font-extrabold text-brand leading-none">
              {cellText(segment.reach)}
            </div>
            <div className="text-[14px] text-ink-secondary mt-1">
              cardholders who regularly shop at <span className="font-semibold text-ink">{rivalName}</span> — a
              comparable café — and have <span className="font-semibold text-ink">zero recorded visits</span> to{" "}
              {profile.name}.
            </div>
            {reach !== null && (
              <div className="text-[11px] text-ink-light mt-2">
                Rounded to the nearest 50. Counts below 250 are never shown, only suppressed.
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <MiniStat label="Lift vs. random cardholder" value={`${affinityPair.lift.toFixed(1)}×`} />
            <MiniStat label="Cardholders behind the estimate" value={num(affinityPair.support)} />
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-brand/10 flex items-start gap-2 text-[13px] text-ink-secondary">
          <Info size={15} className="mt-0.5 shrink-0 text-brand" />
          <p>{rationale.segment}</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="md:col-span-2">
          <Card className="p-5 h-full">
            <h3 className="text-[14px] font-semibold text-ink mb-1">Why now: an off-peak window, not just an off-peak feeling</h3>
            <p className="text-[12px] text-ink-secondary mb-3">
              Context for the gap above — {gap.window} specifically underperforms, both against{" "}
              {profile.name}'s own week and against comparable merchants in the same window.
            </p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={gapBars} layout="vertical" margin={{ left: 0, right: 40 }}>
                <CartesianGrid horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" hide domain={[0, 1.1]} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#334155" }}
                  axisLine={false}
                  tickLine={false}
                  width={185}
                />
                <Tooltip formatter={(v) => `${(v * 100).toFixed(0)}% of baseline`} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {gapBars.map((b, i) => (
                    <Cell key={i} fill={b.tone} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <BasisNote>
              {pctOf(Math.abs(gap.magnitude_vs_own_baseline_pct))} below its own weekday-afternoon baseline ·{" "}
              {pctOf(Math.abs(gap.magnitude_vs_peers_pct))} below {gap.peers_used} comparable merchants (
              {gap.peer_basis}) · below the threshold in {gap.weeks_below_min} of the trailing 12 weeks ·
              confidence: {gap.confidence} (demand_gaps.json).
            </BasisNote>
          </Card>
        </div>
        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-ink mb-2">Where this comes from</h3>
          <ul className="space-y-2 text-[12.5px] text-ink-secondary">
            <li className="flex gap-2"><ArrowRight size={13} className="mt-0.5 text-brand shrink-0" />High weekday-afternoon availability, same as your regulars</li>
            <li className="flex gap-2"><ArrowRight size={13} className="mt-0.5 text-brand shrink-0" />Within your catchment and price band</li>
            <li className="flex gap-2"><ArrowRight size={13} className="mt-0.5 text-brand shrink-0" />Zero visits here, ever</li>
          </ul>
          <div className="mt-3 rounded-lg bg-canvas border border-border px-3 py-2 text-[11.5px] text-ink-secondary">
            {segment.filters.evaluated} evaluated ·{" "}
            {Object.entries(segment.filters.removed)
              .map(([rule, n]) => `${n} removed on ${rule.replace(/_/g, " ")}`)
              .join(" · ")}
          </div>
          <p className="text-[11px] text-ink-light mt-3">
            Shown only as counts. No cardholder identity is visible to {profile.name} at any point.
          </p>
        </Card>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[16px] font-bold text-ink">Who this actually means</h3>
        <Badge tone="neutral">Illustrative composites, mock data</Badge>
      </div>
      <p className="text-[13px] text-ink-secondary mb-4 max-w-2xl">
        Three standalone profiles, not real customers — built to make the {cellText(segment.reach)} legible in five
        seconds instead of trusted as an abstract count.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PersonaCard persona={alvin} />
        <PersonaCard persona={bernice} emphasis />
        <PersonaCard persona={charles} />
      </div>
      <p className="text-[12px] text-ink-light mt-3 max-w-2xl">
        Charles converts on price alone and would have bought anyway — he's deliberately excluded from
        targeting. Why that matters for the reward math is on the next screen.
      </p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-white border border-border px-4 py-3 shadow-card min-w-[132px]">
      <div className="font-num text-[22px] font-bold text-ink leading-none">{value}</div>
      <div className="text-[11px] text-ink-secondary mt-1">{label}</div>
    </div>
  );
}
