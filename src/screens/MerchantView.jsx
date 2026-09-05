import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useDemoData, categoryFor, merchantById } from "../data/DataProvider";
import { HERO_MERCHANT_ID } from "../data/constants";
import { sgd, num, pct, monthLabel, aggregateMonthly } from "../data/format";
import { Card, SectionTitle, StatTile, Badge, BasisNote } from "../components/ui";

const DAYPART_LABELS = { morning: "Morning", lunch: "Lunch", afternoon: "Afternoon", evening: "Evening", late: "Late" };

export default function MerchantView() {
  const { data } = useDemoData();
  const profile = data.merchantProfiles[HERO_MERCHANT_ID];
  const merchant = merchantById(data.merchantDirectory, HERO_MERCHANT_ID);
  const category = categoryFor(data.taxonomy, profile.category);

  const monthly = useMemo(() => aggregateMonthly(profile.series), [profile]);
  const totals = useMemo(() => {
    const txn_count = profile.series.reduce((s, r) => s + r.txn_count, 0);
    const sales = profile.series.reduce((s, r) => s + r.total_sales_sgd, 0);
    return { txn_count, sales, avg_ticket: sales / txn_count };
  }, [profile]);

  const daypartData = Object.entries(profile.daypart_profile).map(([k, v]) => ({
    daypart: DAYPART_LABELS[k],
    share: v,
  }));

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-1">
        <Badge tone="neutral">Logged in as merchant</Badge>
        <Badge tone="info">OCBC-acquired</Badge>
      </div>
      <SectionTitle
        eyebrow="Screen 1 · Your view"
        title={`${merchant.canonical_name} — ${category.label}, District ${merchant.postal_district}`}
        subtitle="This is everything your own point-of-sale already tells you: your transactions, your repeat customers, your ticket sizes, your trading pattern over the year."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatTile label="Transactions, 12 months" value={num(totals.txn_count)} />
        <StatTile label="Total sales" value={sgd(totals.sales)} />
        <StatTile label="Average ticket" value={sgd(totals.avg_ticket, 2)} />
        <StatTile label="Repeat-customer rate" value={pct(profile.repeat_rate)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h3 className="text-[14px] font-semibold text-ink mb-3">Monthly sales</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ left: -10, right: 10 }}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                formatter={(v) => sgd(v)}
                labelFormatter={monthLabel}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
              />
              <Bar dataKey="total_sales_sgd" fill="#1E293B" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
          <BasisNote>Aggregated from card_transactions.parquet, own-merchant rows only (merchant_profiles.json).</BasisNote>
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
              <Tooltip formatter={(v) => pct(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }} />
              <Bar dataKey="share" fill="#1E293B" radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
          <BasisNote>Own daypart mix — a routine café pattern, nothing unusual here yet.</BasisNote>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Median ticket" value={sgd(profile.ticket_p50_sgd, 2)} />
        <StatTile label="90th-percentile ticket" value={sgd(profile.ticket_p90_sgd, 2)} />
        <StatTile label="Foreign-card share" value={pct(profile.foreign_card_share)} />
        <StatTile
          label="Also seen at"
          value={<span className="text-[15px] font-semibold">{profile.top_adjacent_categories.slice(0, 2).map((c) => categoryFor(data.taxonomy, c)?.label).join(", ")}</span>}
        />
      </div>

      <p className="text-[13px] text-ink-light mt-8 max-w-2xl">
        This is the full picture your own systems can show you. It's accurate — and it's the
        same view every café on the street has of itself.{" "}
        <span className="text-ink-secondary font-medium">There's a quarter of your addressable customers missing from it.</span>{" "}
        Next screen.
      </p>
    </div>
  );
}
