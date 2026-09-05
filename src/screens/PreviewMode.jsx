import React, { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Lock, Sparkles } from "lucide-react";
import { useDemoData, merchantById, categoryFor } from "../data/DataProvider";
import { COLD_START_MERCHANT_ID, PROSPECT_MERCHANT_ID } from "../data/constants";
import { sgd, num, pct, monthLabel } from "../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../components/ui";

export default function PreviewMode() {
  const [tab, setTab] = useState("prospect");
  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow="Screen 6 · Preview mode"
        title="What the flywheel looks like from a standing stop"
        subtitle="Two merchants OCBC's own transaction detail can't help yet — one who hasn't signed up, one who just did."
      />

      <div className="inline-flex rounded-lg border border-border bg-white p-1 mb-6">
        <TabButton active={tab === "prospect"} onClick={() => setTab("prospect")}>Prospect — not yet acquired</TabButton>
        <TabButton active={tab === "coldstart"} onClick={() => setTab("coldstart")}>Just signed up — cold start</TabButton>
      </div>

      {tab === "prospect" ? <ProspectView /> : <ColdStartView />}
    </div>
  );
}

function TabButton({ active, children, ...props }) {
  return (
    <button
      {...props}
      className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
        active ? "bg-brand text-white" : "text-ink-secondary hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ProspectView() {
  const { data } = useDemoData();
  const merchant = merchantById(data.merchantDirectory, PROSPECT_MERCHANT_ID);
  const category = categoryFor(data.taxonomy, merchant.category);
  const benchmark = useMemo(
    () => data.benchmarks.find((b) => b.category === merchant.category && b.district === merchant.postal_district),
    [data, merchant]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone="neutral">Not OCBC-acquired</Badge>
            <Badge tone="info">Preview mode</Badge>
          </div>
          <h3 className="text-[18px] font-bold text-ink mt-2">{merchant.canonical_name} — {category.label}, District {merchant.postal_district}</h3>
          <p className="text-[13px] text-ink-secondary mt-2 max-w-xl">
            OCBC has never processed a payment for this merchant, so there is no transaction-level view to show — only
            what every {category.label.toLowerCase()} in District {merchant.postal_district} looks like on average.
          </p>

          {benchmark ? (
            <div className="grid grid-cols-3 gap-3 mt-5">
              <BenchStat label="Cafés in district" value={num(benchmark.n_merchants)} />
              <BenchStat label="Avg ticket" value={sgd(benchmark.avg_ticket_sgd, 2)} />
              <BenchStat label="Cardholders seen nearby" value={num(benchmark.unique_cardholders)} />
            </div>
          ) : (
            <p className="text-[12px] text-ink-light mt-4">No comparable benchmark cohort in this district yet.</p>
          )}
          <BasisNote>District × category aggregate (benchmarks.json) — never this merchant's own data, because OCBC doesn't have any.</BasisNote>
        </Card>

        <LockedPanel title="Your own transaction detail" reason="Requires an OCBC acquiring relationship." />
        <LockedPanel title="Lookalike segment targeting" reason="Requires enough of your own acquiring history to compute lift." />
        <LockedPanel title="Campaign tools & RM handoff" reason="Available once your account is OCBC-acquired." />
      </div>

      <Card className="p-6 bg-navy text-white flex flex-col">
        <Sparkles size={20} className="text-brand mb-3" />
        <h3 className="text-[15px] font-bold mb-2">This is the acquisition pitch</h3>
        <p className="text-[13px] text-white/75 leading-relaxed flex-1">
          Everything on screens 1–5 becomes available the moment {merchant.canonical_name} becomes an OCBC-acquired
          merchant. The district benchmark above is real, computed, and already better than a cold start with no
          data at all — it's just not personal yet.
        </p>
        <button className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover transition-colors">
          Discuss becoming an OCBC merchant
        </button>
      </Card>
    </div>
  );
}

function ColdStartView() {
  const { data } = useDemoData();
  const merchant = merchantById(data.merchantDirectory, COLD_START_MERCHANT_ID);
  const category = categoryFor(data.taxonomy, merchant.category);
  const profile = data.merchantProfiles[COLD_START_MERCHANT_ID];
  const affinity = data.affinity[COLD_START_MERCHANT_ID];
  const segment = data.segments[COLD_START_MERCHANT_ID][0];

  const chartData = profile.series.map((r) => ({ date: r.date, txn_count: r.txn_count }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone="success">OCBC-acquired</Badge>
            <Badge tone="warning">Cold start</Badge>
          </div>
          <h3 className="text-[18px] font-bold text-ink mt-2">{merchant.canonical_name} — {category.label}</h3>
          <p className="text-[13px] text-ink-secondary mt-2 max-w-xl">
            Just onboarded. Its own acquiring history is real but far too thin to rank lookalike merchants with any
            confidence — this is what day one actually looks like, not a mocked-up empty state.
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData} margin={{ left: -20, right: 10, top: 10 }}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="date" tickFormatter={monthLabel} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} interval={29} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={24} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }} />
              <Area type="monotone" dataKey="txn_count" stroke="#ED1C24" fill="#FDECEC" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          <BasisNote>Daily acquiring transaction count, full 12 months (merchant_profiles.json) — nearly flat until onboarding.</BasisNote>
        </Card>

        <Card className="p-6 border-info/30 bg-info-bg/30">
          <h3 className="text-[14px] font-bold text-ink mb-1">The system falls back — it doesn't fail</h3>
          <p className="text-[12.5px] text-ink-secondary mb-3">
            With no reliable lift of its own, the segment is built from the other bubble-tea merchants in the same
            category and catchment instead.
          </p>
          <div className="font-num text-[28px] font-bold text-ink">{num(segment.size)}</div>
          <p className="text-[12.5px] text-ink-secondary">
            cardholders who regularly visit comparable bubble-tea merchants, matched on price band and catchment
          </p>
          <BasisNote>
            affinity.json: cold_start_fallback=true, based on {affinity.based_on_category_peers.length} category peers
            (segments.json: category_catchment_fallback).
          </BasisNote>
        </Card>
      </div>

      <Card className="p-6 bg-navy text-white flex flex-col">
        <Sparkles size={20} className="text-brand mb-3" />
        <h3 className="text-[15px] font-bold mb-2">This is the cold-start answer</h3>
        <p className="text-[13px] text-white/75 leading-relaxed">
          No merchant ever sees an empty dashboard. The fallback is weaker than a full lift computation and the
          product says so — but it's still a real, reachable, computed segment on day one.
        </p>
      </Card>
    </div>
  );
}

function BenchStat({ label, value }) {
  return (
    <div className="rounded-lg bg-canvas border border-border px-3 py-2.5">
      <div className="font-num text-[18px] font-bold text-ink">{value}</div>
      <div className="text-[11px] text-ink-secondary">{label}</div>
    </div>
  );
}

function LockedPanel({ title, reason }) {
  return (
    <Card className="p-5 border-dashed bg-canvas/50 flex items-center gap-3">
      <div className="h-9 w-9 rounded-full bg-white border border-border flex items-center justify-center shrink-0">
        <Lock size={15} className="text-ink-light" />
      </div>
      <div>
        <div className="text-[13px] font-semibold text-ink-secondary">{title}</div>
        <div className="text-[12px] text-ink-light">{reason}</div>
      </div>
    </Card>
  );
}
