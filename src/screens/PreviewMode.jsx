import React, { useMemo, useState } from "react";
import { Lock, Sparkles, CalendarClock } from "lucide-react";
import { useDemoData, merchantById, categoryFor, merchantName } from "../data/DataProvider";
import { COLD_START_MERCHANT_ID, PROSPECT_MERCHANT_ID, screenNum } from "../data/constants";
import { sgd, num, pctOf, cellText } from "../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../components/ui";

export default function PreviewMode() {
  const [tab, setTab] = useState("prospect");
  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow={`Screen ${screenNum("preview")} · Preview mode`}
        title="What the flywheel looks like from a standing stop"
        subtitle="Two merchants OCBC's own transaction detail can't help yet — one it doesn't acquire, one that just switched its terminals on."
      />

      <div className="inline-flex rounded-lg border border-border bg-white p-1 mb-6">
        <TabButton active={tab === "prospect"} onClick={() => setTab("prospect")}>Prospect — not OCBC-acquired</TabButton>
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

// The reduced state: OCBC issues cards to this merchant's customers but does not acquire it, so
// only OCBC-issued card spend is visible. This is the cross-sell surface, not an empty screen.
function ProspectView() {
  const { data } = useDemoData();
  const profile = merchantById(data.merchantProfiles, PROSPECT_MERCHANT_ID);
  const category = categoryFor(data.taxonomy, profile.category);
  const benchmark = useMemo(
    () => data.benchmarks.find((b) => b.category === profile.category && b.district === profile.district),
    [data, profile]
  );
  const mix = profile.card_mix;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone="neutral">Not OCBC-acquired</Badge>
            <Badge tone="info">Preview mode</Badge>
          </div>
          <h3 className="text-[18px] font-bold text-ink mt-2">
            {profile.name} — {category?.label ?? profile.category}, District {profile.district}
          </h3>
          <p className="text-[13px] text-ink-secondary mt-2 max-w-xl">{profile.data_source.note}</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
            <BenchStat label="OCBC cardholders seen here" value={cellText(profile.trading_summary.core_customer_base)} />
            <BenchStat label="Average ticket, OCBC cards" value={sgd(profile.trading_summary.avg_ticket_sgd, 2)} />
            <BenchStat label="Top payment method" value={profile.trading_summary.top_payment_method ?? "—"} />
          </div>
          <BasisNote>
            {profile.data_source.label} — {profile.trading_summary.core_customer_base_basis}. About a quarter of card
            volume at a typical merchant runs on OCBC-issued cards, so this is a corner of the picture, not the
            picture.
          </BasisNote>
        </Card>

        <Card className="p-6">
          <h3 className="text-[14px] font-bold text-ink mb-1">Card mix — the reduced state</h3>
          <div className="font-num text-[28px] font-bold text-ink">
            {mix.all_suppressed ? "—" : `${pctOf(mix.shares.OCBC)} OCBC`}
          </div>
          <p className="text-[12.5px] text-ink-secondary mt-1">{mix.cross_sell_note ?? mix.label}</p>
          <BasisNote>{mix.note}</BasisNote>
        </Card>

        {benchmark ? (
          <Card className="p-6">
            <h3 className="text-[14px] font-bold text-ink mb-1">
              What every {(category?.label ?? profile.category).toLowerCase()} in District {profile.district} looks
              like
            </h3>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <BenchStat label="Merchants in cohort" value={num(benchmark.n_merchants)} />
              <BenchStat label="Avg ticket" value={sgd(benchmark.avg_ticket_sgd, 2)} />
              <BenchStat label="Cardholders seen nearby" value={num(benchmark.unique_cardholders)} />
            </div>
            <BasisNote>
              District × category aggregate over {num(benchmark.txn_count)} transactions (benchmarks.json) — never a
              single merchant's own data.
            </BasisNote>
          </Card>
        ) : (
          <Card className="p-6">
            <p className="text-[12.5px] text-ink-light">No comparable benchmark cohort in this district yet.</p>
          </Card>
        )}

        <LockedPanel title="All cards and PayNow at your terminals" reason="Requires an OCBC acquiring relationship." />
        <LockedPanel title="Every customer, not only the OCBC ones" reason="Acquiring data resolves customers you can't see today." />
      </div>

      <Card className="p-6 bg-navy text-white flex flex-col">
        <Sparkles size={20} className="text-brand mb-3" />
        <h3 className="text-[15px] font-bold mb-2">This is the acquisition pitch</h3>
        <p className="text-[13px] text-white/75 leading-relaxed flex-1">
          Everything on screens 1–5 gets sharper the moment {profile.name} moves its acquiring to OCBC. What's on
          screen now is real, computed, and already better than a cold start — it's just a quarter of the picture.
        </p>
        <button className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover transition-colors">
          Discuss moving your acquiring to OCBC
        </button>
      </Card>
    </div>
  );
}

function ColdStartView() {
  const { data } = useDemoData();
  const profile = merchantById(data.merchantProfiles, COLD_START_MERCHANT_ID);
  const category = categoryFor(data.taxonomy, profile.category);
  const affinity = data.affinity[COLD_START_MERCHANT_ID];
  const segment = data.segments[COLD_START_MERCHANT_ID][0];
  const gap = data.demandGaps.find((g) => g.merchant_id === COLD_START_MERCHANT_ID);
  const peers = affinity.based_on_category_peers ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone="success">OCBC-acquired</Badge>
            <Badge tone="warning">Cold start</Badge>
          </div>
          <h3 className="text-[18px] font-bold text-ink mt-2">
            {profile.name} — {category?.label ?? profile.category}
          </h3>
          <p className="text-[13px] text-ink-secondary mt-2 max-w-xl">
            Just onboarded. This is what day one actually looks like, not a mocked-up empty state.
          </p>

          <div className="mt-4 rounded-lg border border-border bg-canvas/60 px-4 py-3 flex items-start gap-3">
            <CalendarClock size={16} className="text-ink-light shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] text-ink">
                Acquiring began {profile.data_source.acquiring_start_date} —{" "}
                <span className="font-semibold">{profile.data_source.history_weeks} weeks</span> of its own history at
                the demo clock, and {profile.trading_summary.all_customers_seen?.note?.toLowerCase() ?? "no customers yet"}
              </p>
              <p className="text-[12px] text-ink-secondary mt-1">
                There is nothing to plot yet, so nothing is plotted. The eligibility gate says so out loud rather than
                drawing an empty chart.
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-warning/40 bg-warning-bg/40 px-4 py-3">
            <p className="text-[12.5px] text-ink-secondary">
              <span className="font-semibold text-ink">Gate: </span>
              {profile.gate.ocbc_txn_count} OCBC-card transactions against a {profile.gate.threshold} threshold.{" "}
              {profile.gate.message}
            </p>
          </div>
          <BasisNote>merchant_profiles.json gate + data_source — the failing state is a real branch, not a mock.</BasisNote>
        </Card>

        <Card className="p-6 border-info/30 bg-info-bg/30">
          <h3 className="text-[14px] font-bold text-ink mb-1">The system falls back — it doesn't fail</h3>
          <p className="text-[12.5px] text-ink-secondary mb-3">
            With no reliable lift of its own ({gap?.type === "cold_start" ? "cold-start branch" : gap?.type}), the
            segment is built from comparable merchants in the same category and catchment instead.
          </p>
          <div className="font-num text-[28px] font-bold text-ink">{cellText(segment.reach)}</div>
          <p className="text-[12.5px] text-ink-secondary">{segment.description}</p>
          <BasisNote>
            affinity.json: cold_start_fallback = {String(affinity.cold_start_fallback)}, built from {peers.length}{" "}
            category peers ({peers.map((p) => merchantName(data, p)).slice(0, 3).join(", ")}
            {peers.length > 3 ? ", …" : ""}) · segments.json source: {segment.source}.
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
