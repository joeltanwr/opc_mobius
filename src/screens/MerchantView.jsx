import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Info } from "lucide-react";
import { useDemoData, categoryFor, merchantById } from "../data/DataProvider";
import { HERO_MERCHANT_ID } from "../data/constants";
import { sgd, num, pctOf, monthLabel, completeMonths, sumBy, cellText } from "../data/format";
import { Card, SectionTitle, StatTile, Badge, BasisNote } from "../components/ui";

const DAYPART_LABELS = { morning: "Morning", lunch: "Lunch", afternoon: "Afternoon", evening: "Evening", late: "Late" };
const DAYPART_ORDER = ["morning", "lunch", "afternoon", "evening", "late"];

export default function MerchantView() {
  const { data } = useDemoData();
  const profile = merchantById(data.merchantProfiles, HERO_MERCHANT_ID);
  const category = categoryFor(data.taxonomy, profile.category);
  const trading = profile.trading_summary;
  const rationale = data.rationales[HERO_MERCHANT_ID];

  const months = useMemo(() => completeMonths(profile.series), [profile]);
  const totals = useMemo(
    () => ({ txn_count: sumBy(months, "txn_count"), sales: sumBy(months, "sales_sgd") }),
    [months]
  );

  // Daypart mix from the merchant's own trailing-12-week slots (merchant_profiles.json
  // trading_pattern.slots), summed across weekdays.
  const daypartData = useMemo(() => {
    const slots = profile.trading_pattern?.slots ?? [];
    const byDaypart = new Map(DAYPART_ORDER.map((d) => [d, 0]));
    for (const slot of slots) {
      if (byDaypart.has(slot.daypart)) byDaypart.set(slot.daypart, byDaypart.get(slot.daypart) + slot.count_12w);
    }
    const total = Array.from(byDaypart.values()).reduce((a, b) => a + b, 0);
    return DAYPART_ORDER.map((d) => ({
      daypart: DAYPART_LABELS[d],
      share: total ? byDaypart.get(d) / total : 0,
    }));
  }, [profile]);

  const alsoSeenAt = (profile.customer_profile?.all_customers?.top_categories ?? [])
    .filter((c) => c.category !== profile.category)
    .slice(0, 2);
  const ocbcCardShare = profile.card_mix?.all_suppressed ? null : profile.card_mix?.shares?.OCBC;

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-1">
        <Badge tone="neutral">Logged in as merchant</Badge>
        <Badge tone="info">{profile.data_source.label}</Badge>
      </div>
      <SectionTitle
        eyebrow="Screen 1 · Your view"
        title={`${profile.name} — ${category?.label ?? profile.category}, District ${profile.district}`}
        subtitle="This is everything your own point-of-sale already tells you: your transactions, your repeat customers, your ticket sizes, your trading pattern over the year."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatTile label="Transactions, complete months" value={num(totals.txn_count)} />
        <StatTile label="Total sales, same months" value={sgd(totals.sales)} />
        <StatTile label="Average ticket" value={sgd(trading.avg_ticket_sgd, 2)} />
        <StatTile
          label="Repeat-customer rate"
          value={pctOf(profile.rfv.one_time_vs_repeat.repeat_customer_share_pct)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h3 className="text-[14px] font-semibold text-ink mb-3">Monthly sales</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={months} margin={{ left: -10, right: 10 }}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `S$${Math.round(v / 1000)}k`}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                formatter={(v) => sgd(v)}
                labelFormatter={monthLabel}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
              />
              <Bar dataKey="sales_sgd" fill="#1E293B" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
          <BasisNote>
            {profile.data_source.label} — complete months only ({months.length} of{" "}
            {profile.series.monthly.length}), so the part-month to the demo clock never reads as a
            collapse in trade. Volume trend: {profile.trading_summary.volume_trend.direction} (
            {profile.trading_summary.volume_trend.basis}).
          </BasisNote>
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-ink mb-3">When customers come in</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daypartData} layout="vertical" margin={{ left: 0, right: 20 }}>
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis
                type="category"
                dataKey="daypart"
                tick={{ fontSize: 12, fill: "#334155" }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip
                formatter={(v) => `${(v * 100).toFixed(1)}% of visits`}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
              />
              <Bar dataKey="share" fill="#1E293B" radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
          <BasisNote>
            Own daypart mix across the trailing 12 weeks — a routine café pattern, nothing unusual
            here yet. Peak hour: {profile.trading_pattern.hourly.peak_hour}:00.
          </BasisNote>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile
          label="Customers at your terminals"
          value={num(trading.all_customers_seen?.count)}
          sub="Your own count — exact, no floor"
        />
        <StatTile
          label="OCBC cardholders among them"
          value={cellText(trading.core_customer_base)}
          sub="Rounded to 50 — the reachable ones"
        />
        <StatTile
          label="Median days since last visit"
          value={num(profile.rfv.days_since_last.median)}
        />
        <StatTile
          label="Top 10% share of revenue"
          value={pctOf(profile.rfv.revenue_by_percentile.top_10_pct)}
        />
      </div>

      {alsoSeenAt.length > 0 && (
        <Card className="p-5 mt-4">
          <h3 className="text-[14px] font-semibold text-ink mb-1">
            Where your customers also spend
          </h3>
          <p className="text-[13px] text-ink-secondary">
            {alsoSeenAt.map((c) => `${c.label} (${c.share_pct}% of their spend)`).join(" · ")}
          </p>
          <BasisNote>{profile.customer_profile.basis}</BasisNote>
        </Card>
      )}

      <Card className="p-5 mt-4 flex items-start gap-3">
        <Info size={15} className="mt-0.5 shrink-0 text-brand" />
        <div>
          <p className="text-[13px] text-ink-secondary">{rationale.customer_profile}</p>
          <BasisNote>
            Generated from the figures above (rationales.json) — every sentence sits next to the
            number that produced it.
          </BasisNote>
        </div>
      </Card>

      <p className="text-[13px] text-ink-light mt-8 max-w-2xl">
        This is the full picture your own systems can show you. It's accurate — and it's the same
        view every café on the street has of itself.{" "}
        {ocbcCardShare !== null && ocbcCardShare !== undefined && (
          <span className="text-ink-secondary font-medium">
            Only {pctOf(ocbcCardShare)} of the cards at your terminals are OCBC-issued — those are
            the customers we can reach for you, and there are more of them out there than you can
            see.
          </span>
        )}{" "}
        Next screen.
      </p>
    </div>
  );
}
