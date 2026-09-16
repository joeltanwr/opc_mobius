import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import { ShieldCheck, ShieldX, Lock, Ban, Check, Clock, Sparkles, Info } from "lucide-react";
import { useDemoData, merchantById, categoryFor, constantOf, usePrivacyRules } from "../data/DataProvider";
import { useMobiusState } from "../state/StateProvider";
import { rewardConfigUnlocked } from "../state/store.js";
import { TAB3_ACCOUNTS, screenNum, RFM_SEGMENT_GLOSSARY } from "../data/constants";
import { sgd, num, pct, pctOf, cellText, cellCount, isSuppressed, monthLabel, completeMonths } from "../data/format";
import { Card, SectionTitle, StatTile, Badge, BasisNote, SuppressedCard } from "../components/ui";

// Merchant view Tab 3 — "Target customer" (merchant prompt §6). The merchant understands its
// customer base and is persuaded to apply.
//
// Reconciled rather than built fresh: the trading summary comes from screen 1, the gap card and
// its confidence from screen 2, and the eligibility strip and the six ranked reward types from
// screen 4. What is new here is the recency/frequency/value ladder §6 asks to build toward the
// RFM segmentation, the floored composition panels, and an application action that actually moves
// the campaign — which is how the set-up page is reached from the flow rather than from the nav.
//
// Stateful figures come from the shared state module, not from JSON: the campaign's status, the
// live post-consent reach, and the application itself. Everything else on the page is a pipeline
// aggregate that no event can move, and is read straight from public/data.

const AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const RFM_ORDER = [
  "Champions", "Loyal Customers", "Potential Loyalists", "New Customers", "Promising",
  "Need Attention", "Can't Lose Them", "At Risk", "Hibernating", "Lost",
];
const CARD_ORDER = ["OCBC", "DBS", "UOB", "other", "PayNow"];

// Bucket labels are derived from the pipeline's own distribution keys rather than typed into a
// parallel list here. A hand-kept list is a second source for something the pipeline already
// knows: it drifts silently when a bucket boundary moves, and the chart keeps rendering a label
// that no longer describes the number beside it.
function bandLabel(key, unit) {
  const [lo, hi] = String(key).split("-");
  if (String(key).endsWith("+")) return `${String(key).slice(0, -1)} or more ${unit}`;
  if (hi === undefined) return `${lo} ${unit}`;
  return `${lo}–${hi} ${unit}`;
}

// Distribution objects ship as {bucket: share}; render them in the order the pipeline wrote them.
function bandRows(distribution, unit) {
  return Object.entries(distribution ?? {}).map(([key, share]) => ({ label: bandLabel(key, unit), share }));
}

export default function TargetCustomer() {
  const { data } = useDemoData();
  const m = useMobiusState();
  const [merchantId, setMerchantId] = useState(TAB3_ACCOUNTS[0].id);
  if (!m) return null;

  const { state, dispatch, display, reachOf, rewind } = m;
  const profile = merchantById(data.merchantProfiles, merchantId);
  const category = categoryFor(data.taxonomy, profile.category);
  const recs = data.rewardRecommendations[merchantId] ?? null;
  const gap = (data.demandGaps ?? []).find((g) => g.merchant_id === merchantId) ?? null;
  const rationale = data.rationales[merchantId] ?? null;
  const eligibility = recs?.eligibility ?? null;
  const eligible = Boolean(eligibility?.passed);
  // The merchant's own data gate is separate from the credit gate: a merchant can be perfectly
  // eligible and still have too little history for a profile.
  const hasProfile = profile.gate.passed && Boolean(profile.rfv);
  // Window lengths the pipeline computed against, not window lengths retyped in a component: if
  // the detector's trailing window ever moves, the prose moves with it.
  const trailingMonths = constantOf(data, "TRAILING_MONTHS")?.value ?? null;
  const trailingWeeks = constantOf(data, "GAP_TRAILING_WEEKS")?.value ?? null;
  const { floor, rounding } = usePrivacyRules();

  // The campaign this merchant would apply for — the live demo campaign for the hero merchant, an
  // existing application for anyone who already has one. Read from state, not from JSON, because
  // applying moves it.
  const campaign = useMemo(
    () => Object.values(state.campaigns).find((c) => c.merchant_id === merchantId && c.status === "applied") ?? null,
    [state.campaigns, merchantId]
  );
  // The same merchant's campaign once it has left the application stage. Configuration now lives
  // on a tab of this view rather than on the RM's desk, so a merchant whose programme is already
  // in draft has somewhere to be sent — and this screen used to tell it there was no application
  // at all, which is true of the ladder and useless as a next step.
  const inFlight = useMemo(
    () =>
      Object.values(state.campaigns).find(
        (c) => c.merchant_id === merchantId && c.source === "live" && c.status !== "applied"
      ) ?? null,
    [state.campaigns, merchantId]
  );

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Badge tone="neutral">Tab 3 · Target customer</Badge>
        <Badge tone="info">{profile.data_source.label}</Badge>
        <AccountSwitch value={merchantId} onChange={setMerchantId} profiles={data.merchantProfiles} />
      </div>

      <SectionTitle
        eyebrow={`Screen ${screenNum("target-customer")} · Customer profile`}
        title={`${profile.name} — ${category?.label ?? profile.category}, District ${profile.district}`}
        subtitle="Who your customers are, where the gap is, and which reward fits it. Every figure here is an aggregate of your own transactions; no cardholder identity reaches this screen at any point."
      />

      {/* The eligibility panel is deliberately not rendered. The gate still decides — it runs in
          the APPLY reducer when the merchant signs up, and it is what keeps the Set-up tab shut —
          but a merchant does not need its balance and its score bands read back to it before it
          has asked for anything. The <Eligibility> component below is kept for the RM-facing and
          diagnostic use it was written for; only this screen stops showing it. */}

      {!hasProfile ? (
        <ThinHistory profile={profile} data={data} gap={gap} rounding={rounding} />
      ) : (
        <>
          <TradingSummary profile={profile} trailingMonths={trailingMonths} />
          <RecencyFrequencyValue profile={profile} />
          <TradingPattern profile={profile} gap={gap} trailingWeeks={trailingWeeks} floor={floor} />
          <CustomerAnalysis
            profile={profile}
            gap={gap}
            rationale={rationale}
            hasRecommendation={eligible && Boolean(recs)}
            trailingWeeks={trailingWeeks}
          />
        </>
      )}

      {eligible && hasProfile && recs && (
        <RewardOptions
          recs={recs}
          rationale={rationale}
          campaign={campaign}
          reachOf={reachOf}
          rounding={rounding}
          data={data}
        />
      )}

      {/* The sign-up action is reachable whatever the gate will decide, because the decision is
          the outcome of asking and not a precondition for being allowed to ask. A merchant that
          clears it is routed into Set-up; one that does not gets the refusal, and the tab stays
          shut. Without a trading profile there is nothing to apply about at all. */}
      {hasProfile && (
        <Apply
          campaign={campaign}
          inFlight={inFlight}
          profile={profile}
          eligibility={eligibility}
          state={state}
          dispatch={dispatch}
          display={display}
          rewind={rewind}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------------------- chrome

function AccountSwitch({ value, onChange, profiles }) {
  return (
    <div className="ml-auto inline-flex flex-wrap rounded-lg border border-border bg-white p-0.5 text-[12px]">
      {TAB3_ACCOUNTS.map((a) => (
        <button
          key={a.id}
          onClick={() => onChange(a.id)}
          title={a.note}
          className={`rounded-md px-3 py-1 font-medium whitespace-nowrap ${
            value === a.id ? "bg-ink text-white" : "text-ink-secondary hover:text-ink"
          }`}
        >
          {profiles[a.id]?.name ?? a.id}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------- §6 eligibility strip

function Eligibility({ eligibility, name }) {
  if (!eligibility) {
    return (
      <Card className="p-5 mb-6 border-dashed">
        <p className="text-[13px] text-ink-secondary">No eligibility decision on file for {name}.</p>
      </Card>
    );
  }
  const ok = eligibility.passed;
  return (
    <Card className={`p-5 mb-6 flex items-start gap-3 ${ok ? "border-success/40 bg-success-bg/30" : "border-brand/30 bg-[#FFF8F8]"}`}>
      {ok ? <ShieldCheck size={18} className="text-success shrink-0 mt-0.5" /> : <ShieldX size={18} className="text-brand shrink-0 mt-0.5" />}
      <div className="flex-1">
        <p className="text-[14px] font-semibold text-ink">
          Eligibility for the reward programme: {ok ? "cleared" : "not cleared"}
        </p>
        <p className="text-[13px] text-ink-secondary mt-1 max-w-3xl">
          Average balance {sgd(eligibility.avg_balance_6m_sgd)} over {eligibility.balance_months} months against a{" "}
          {sgd(eligibility.balance_threshold_sgd)} threshold. Transaction score: internal band{" "}
          {eligibility.internal_score_band ?? "none on file"}, external band{" "}
          {eligibility.external_score_band ?? "none on file"}, against a maximum of band {eligibility.max_band}. Either
          score clearing the band is enough.
        </p>
        {!ok && (
          <p className="text-[13px] font-medium text-ink mt-2">
            {eligibility.message}{" "}
            {eligibility.reasons.length > 0 && `Reason: ${eligibility.reasons.join("; ")}.`}
          </p>
        )}
        {ok && (
          <p className="text-[12.5px] text-ink-secondary mt-1">
            Cleared by {eligibility.cleared_by.join(" and ")}. The gate runs before any recommendation is generated.
          </p>
        )}
        <BasisNote>reward_recommendations.json eligibility (pipeline/reward.py).</BasisNote>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------- §3 thin-history degrade

// A benchmark row for a single merchant IS that merchant, so it is never a benchmark: the row for
// this merchant's own category and district would be its own 21 transactions handed back to it as
// a peer comparison. Roll the category up across districts instead, dropping any single-merchant
// row in this merchant's own district, and refuse to show anything under two merchants.
function categoryBenchmark(benchmarks, profile) {
  const rows = (benchmarks ?? []).filter(
    (b) => b.category === profile.category && !(b.district === profile.district && b.n_merchants <= 1)
  );
  const merchants = rows.reduce((a, r) => a + r.n_merchants, 0);
  if (merchants < 2) return null;
  const txns = rows.reduce((a, r) => a + r.txn_count, 0);
  return {
    merchants,
    districts: rows.length,
    txns,
    cardholders: rows.reduce((a, r) => a + r.unique_cardholders, 0),
    ticket: txns ? rows.reduce((a, r) => a + r.avg_ticket_sgd * r.txn_count, 0) / txns : null,
  };
}

function ThinHistory({ profile, data, gap, rounding }) {
  const peer = categoryBenchmark(data.benchmarks, profile);
  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Clock size={15} className="text-warning" />
        <h3 className="text-[15px] font-bold text-ink">Not enough history yet for a customer profile</h3>
      </div>
      <p className="text-[13px] text-ink-secondary max-w-3xl">{profile.gate.message}</p>
      <p className="text-[12.5px] text-ink-secondary mt-2 max-w-3xl">
        {num(profile.gate.ocbc_txn_count)} OCBC-card transactions against a {num(profile.gate.threshold)} threshold, over{" "}
        {profile.data_source.history_weeks} weeks of acquiring. Rather than draw a trend line through that, the profile
        degrades to what is actually known — the benchmark for your category.
      </p>
      {peer ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <StatTile label="Merchants in the benchmark" value={num(peer.merchants)} sub={`${profile.category.replace(/_/g, " ")}, across ${peer.districts} districts`} />
            <StatTile label="Their average ticket" value={sgd(peer.ticket, 2)} sub="Weighted by transaction count" />
            <StatTile label="Their transactions, period" value={num(peer.txns)} />
            <StatTile label="Their unique cardholders" value={num(peer.cardholders)} sub={`Rounded to ${rounding}`} />
          </div>
          <p className="text-[12px] text-ink-light mt-3 max-w-3xl">
            Rolled up across districts on purpose. A district row covering one merchant is that merchant, so it is never
            shown as a benchmark — including your own.
          </p>
        </>
      ) : (
        <p className="text-[13px] text-ink-light mt-4">
          There are not yet two merchants in this category to benchmark against, so no benchmark is shown at all.
        </p>
      )}
      {gap && (
        <p className="text-[12.5px] text-ink-secondary mt-4 max-w-3xl">
          Gap detection returns <span className="font-medium text-ink">{gap.type.replace(/_/g, " ")}</span> at confidence{" "}
          <span className="font-medium text-ink">{gap.confidence}</span>. A negative finding is a finding: there is no
          off-peak trough to target here yet, because there is not yet a pattern to compare against.
        </p>
      )}
      <BasisNote>merchant_profiles.json gate · benchmarks.json (category × district).</BasisNote>
    </Card>
  );
}

// ---------------------------------------------------------------------------- §6 trading summary

function TradingSummary({ profile, trailingMonths }) {
  const t = profile.trading_summary;
  const months = useMemo(() => completeMonths(profile.series), [profile]);
  // The baseline is the merchant's own mean over the complete months on this chart — dashed slate,
  // per the design system, because a baseline is never a growth series.
  const baseline = useMemo(
    () => (months.length ? Math.round(months.reduce((a, x) => a + x.txn_count, 0) / months.length) : null),
    [months]
  );

  return (
    <>
      <h3 className="text-[17px] font-bold text-ink mt-8 mb-3">Trading summary</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <StatTile label="Average monthly transactions" value={num(t.avg_monthly_txns_6m)} sub={`Trailing ${trailingMonths} months, ${t.trailing_window}`} />
        <StatTile label="Average monthly sales" value={sgd(t.avg_monthly_sales_6m_sgd)} sub={`The same ${trailingMonths} months`} />
        <StatTile label="Average spend per ticket" value={sgd(t.avg_ticket_sgd, 2)} sub={`Ticket trend ${t.ticket_trend.direction}`} />
        <StatTile label="Top payment method" value={t.top_payment_method ?? "—"} sub="By transaction count" />
        <StatTile label="Core customer base" value={cellText(t.core_customer_base)} />
      </div>

      <Card className="p-5 mb-4">
        <h4 className="text-[14px] font-semibold text-ink mb-1">Transaction volume, month on month</h4>
        <p className="text-[12px] text-ink-secondary mb-3">
          Volume trend: <span className="font-medium text-ink">{t.volume_trend.direction}</span> ({pctOf(t.volume_trend.change_pct, 1)}).
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={months} margin={{ left: -8, right: 12, top: 6 }}>
            <CartesianGrid vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
            {/* A merchant doing 500 transactions a month must not read "0k" on every tick. */}
            <YAxis tickFormatter={(v) => (v >= 10_000 ? `${Math.round(v / 1000)}k` : num(v))} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip formatter={(v) => `${num(v)} transactions`} labelFormatter={monthLabel} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }} />
            {baseline !== null && (
              <ReferenceLine
                y={baseline}
                stroke="#94A3B8"
                strokeDasharray="6 6"
                strokeWidth={1.5}
                label={{ value: `average ${num(baseline)}`, position: "insideTopRight", fontSize: 11, fill: "#64748B" }}
              />
            )}
            <Line type="monotone" dataKey="txn_count" stroke="#1E293B" strokeWidth={2} dot={{ r: 2.5, fill: "#1E293B" }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
        <BasisNote>
          merchant_profiles.json series.monthly — complete months only ({months.length} of {profile.series.monthly.length}),
          so the part-month running to the demo clock never reads as a collapse in trade.
        </BasisNote>
      </Card>
    </>
  );
}

// Two counts of the same crowd, deliberately treated differently. Absorbed from the retired
// screen 1, which was the only place the app made this point — and it is the sharpest privacy
// statement in the build, because it shows the floor being applied selectively and for a reason
// rather than as a blanket.
function ExactVersusFloored({ trading, rounding }) {
  const own = trading.all_customers_seen;
  const ocbc = trading.core_customer_base;
  if (!own?.count || isSuppressed(ocbc)) return null;
  return (
    <Card className="p-5 mb-4">
      <h4 className="text-[14px] font-semibold text-ink mb-3">Two counts of the same crowd, and only one of them is rounded</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-canvas/40 p-4">
          <div className="font-num text-[30px] font-extrabold text-ink leading-none">{num(own.count)}</div>
          <div className="text-[13px] font-medium text-ink mt-1">customers at your terminals</div>
          <div className="text-[12px] text-ink-secondary mt-1.5">
            <span className="font-semibold text-ink">Exact. No floor, no rounding.</span> These are your own records —
            you already have every one of these transactions in your own till. Mobius withholding a number you already
            hold would be theatre, not privacy.
          </div>
        </div>
        <div className="rounded-lg border border-brand/30 bg-[#FFF8F8] p-4">
          <div className="font-num text-[30px] font-extrabold text-brand leading-none">{cellText(ocbc)}</div>
          <div className="text-[13px] font-medium text-ink mt-1">OCBC cardholders among them</div>
          <div className="text-[12px] text-ink-secondary mt-1.5">
            <span className="font-semibold text-ink">Rounded to the nearest {rounding}.</span>{" "}
            This one is ours, not yours: it is a count of identifiable cardholders, so it is floored and rounded like
            every other OCBC-derived figure on this page. These are also the only ones we can reach for you.
          </div>
        </div>
      </div>
      <p className="text-[12.5px] text-ink-secondary mt-3 max-w-3xl">
        The difference between the two is the part of your trade OCBC can neither see nor reach — other issuers, and
        cash. It is also the honest limit of what a campaign here can move.
      </p>
      <BasisNote>
        merchant_profiles.json trading_summary — all_customers_seen is counted exactly from your own acquiring records;
        core_customer_base is {trading.core_customer_base_basis}.
      </BasisNote>
    </Card>
  );
}

// ------------------------------------------------- §6 recency, frequency and value → toward the RFM

function RecencyFrequencyValue({ profile }) {
  const r = profile.rfv;
  const recency = bandRows(r.days_since_last.distribution, "days");
  const freq = bandRows(r.purchase_frequency_repeat_only, "visits");
  const pctiles = [
    { label: "Top 10%", share: r.revenue_by_percentile.top_10_pct },
    { label: "Next 15%", share: r.revenue_by_percentile.next_15_pct },
    { label: "Next 25%", share: r.revenue_by_percentile.next_25_pct },
    { label: "Bottom 50%", share: r.revenue_by_percentile.bottom_50_pct },
  ];
  const repeatShare = r.one_time_vs_repeat.repeat_customer_share_pct;
  const repeatTxnShare = r.one_time_vs_repeat.repeat_txn_share_pct;

  return (
    <>
      <h3 className="text-[17px] font-bold text-ink mt-8 mb-1">Recency, frequency and value</h3>
      <p className="text-[13px] text-ink-secondary mb-3 max-w-3xl">
        These three are the inputs to the RFM segmentation further down this page, in that order — how recently a
        customer bought, how often they come back, and how much of your revenue they carry.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h4 className="text-[14px] font-semibold text-ink mb-1">Recency — days since last purchase</h4>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-num text-[32px] font-extrabold text-ink leading-none">{num(r.days_since_last.median)}</span>
            <span className="text-[13px] text-ink-secondary">days, median</span>
          </div>
          <ShareBars rows={recency} />
          <p className="text-[13px] text-ink mt-3">
            <span className="font-semibold">{pctOf(r.days_since_last.lapsed_share_pct, 1)} of your customers are lapsed</span> —{" "}
            {r.days_since_last.lapsed_definition}. That share is the pool a win-back reward draws from.
          </p>
          <BasisNote>merchant_profiles.json rfv.days_since_last, across every customer at your terminals.</BasisNote>
        </Card>

        <Card className="p-5">
          <h4 className="text-[14px] font-semibold text-ink mb-1">Frequency — how often they come back</h4>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-num text-[32px] font-extrabold text-ink leading-none">{num(r.avg_days_between_purchases.value, 1)}</span>
            <span className="text-[13px] text-ink-secondary">days between purchases</span>
          </div>
          <p className="text-[12px] text-ink-secondary mb-3">
            {r.avg_days_between_purchases.qualifier}. Averaging one-time customers into this number would make it
            meaningless, so they are excluded.
          </p>
          <div className="mb-1 text-[12px] font-medium text-ink-secondary">One-time versus repeat</div>
          <SplitBar
            leftLabel={`Repeat ${pctOf(repeatShare, 1)}`}
            rightLabel={`One-time ${pctOf(r.one_time_vs_repeat.one_time_customer_share_pct, 1)}`}
            leftShare={repeatShare}
          />
          <p className="text-[12.5px] text-ink-secondary mt-2">
            By customer, repeat buyers are {pctOf(repeatShare, 1)} of the base; by transaction they are{" "}
            {pctOf(repeatTxnShare, 1)}. The gap between those two figures is the point — your trade is carried by the
            people who come back.
          </p>
          <div className="mt-3 mb-1 text-[12px] font-medium text-ink-secondary">Visits, repeat customers only</div>
          <ShareBars rows={freq} />
          <BasisNote>merchant_profiles.json rfv — a repeat customer is one with two or more purchases in the period.</BasisNote>
        </Card>
      </div>

      <Card className="p-5 mt-4">
        <h4 className="text-[14px] font-semibold text-ink mb-1">Value — total revenue by customer percentile</h4>
        <ShareBars rows={pctiles} tone="ink" />
        <p className="text-[13px] text-ink mt-3 max-w-3xl">{r.revenue_by_percentile.interpretation}</p>
        <BasisNote>
          merchant_profiles.json rfv.revenue_by_percentile — your own sales, split by customer rank. Read the prose
          before the bars: concentration is normal, and its level is what a reward mechanic gets chosen against.
        </BasisNote>
      </Card>
    </>
  );
}

// --------------------------------------------------------------------------- §6 trading pattern

function TradingPattern({ profile, gap, trailingWeeks, floor }) {
  const hourly = profile.trading_pattern.hourly;
  const trough = profile.trading_pattern.trough ?? null;
  const troughHours = trough ? gap?.hours ?? null : null;
  const rows = hourly.hours.map((h, i) => ({
    hour: h,
    label: `${String(h).padStart(2, "0")}`,
    share: hourly.share[i],
    isPeak: h === hourly.peak_hour,
    inTrough: Boolean(troughHours && h >= troughHours[0] && h < troughHours[1]),
  }));
  const cardMix = profile.card_mix;
  const ageTotal = AGE_BANDS.reduce((a, b) => a + (cellCount(profile.age_bands[b]) ?? 0), 0);

  return (
    <>
      <h3 className="text-[17px] font-bold text-ink mt-8 mb-3">Trading pattern</h3>

      <Card className="p-5 mb-4">
        <h4 className="text-[14px] font-semibold text-ink mb-1">Hourly transaction intensity</h4>
        {trough ? (
          <p className="text-[13px] text-ink-secondary mb-3 max-w-3xl">
            Peak is <span className="font-semibold text-ink">{String(hourly.peak_hour).padStart(2, "0")}:00</span>. The trough a
            campaign would target is <span className="font-semibold text-brand">{trough.window}</span> —{" "}
            {pctOf(Math.abs(trough.magnitude_vs_own_baseline_pct), 1)} below your own baseline for that weekday and
            daypart, at {trough.confidence} confidence. It is measured against your own pattern for that slot, not
            against your quietest hour of the day: late evening is quieter still, and it is quiet for a reason a reward
            will not fix.
          </p>
        ) : (
          <p className="text-[13px] text-ink-secondary mb-3">
            Peak is {String(hourly.peak_hour).padStart(2, "0")}:00. No recurring trough was detected for this merchant —
            a negative finding, and the reason no off-peak window is proposed below.
          </p>
        )}
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ left: -10, right: 10 }}>
            <CartesianGrid vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
            <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}% of transactions`} labelFormatter={(l) => `${l}:00`} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }} />
            <Bar dataKey="share" radius={[4, 4, 0, 0]} maxBarSize={30}>
              {rows.map((row, i) => (
                <Cell key={i} fill={row.inTrough ? "#ED1C24" : row.isPeak ? "#1E293B" : "#CBD5E1"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap items-center gap-4 mt-2 text-[11.5px] text-ink-secondary">
          <LegendSwatch color="#1E293B" label="Peak hour" />
          {troughHours && <LegendSwatch color="#ED1C24" label={`Trough — ${trough.window}`} />}
          <LegendSwatch color="#CBD5E1" label="Other hours" />
        </div>
        <BasisNote>
          merchant_profiles.json trading_pattern.hourly, trailing {trailingWeeks} weeks · demand_gaps.json for the trough
          window.
        </BasisNote>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h4 className="text-[14px] font-semibold text-ink mb-1">Age bands</h4>
          <p className="text-[12px] text-ink-secondary mb-3">{profile.age_bands_basis}</p>
          <div className="space-y-1.5">
            {AGE_BANDS.map((band) => {
              const count = cellCount(profile.age_bands[band]);
              return (
                <div key={band} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-[13px] text-ink-secondary">{band}</span>
                  {count === null ? (
                    <span className="flex items-center gap-1.5 text-[12.5px] text-ink-light italic">
                      <Lock size={12} /> Below reporting threshold
                    </span>
                  ) : (
                    <>
                      <div className="flex-1 h-4 rounded bg-canvas overflow-hidden">
                        <div className="h-full bg-ink" style={{ width: `${ageTotal ? (count / ageTotal) * 100 : 0}%` }} />
                      </div>
                      <span className="font-num text-[13px] text-ink w-16 text-right">{num(count)}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <BasisNote>
            Bands under {floor} are suppressed in the pipeline, which ships no count for
            them at all — so there is nothing on this screen to recover by subtraction, and the bands that do show are
            rounded.
          </BasisNote>
        </Card>

        <Card className={`p-5 ${cardMix.reduced ? "border-warning/40" : ""}`}>
          <h4 className="text-[14px] font-semibold text-ink mb-1">Card mix</h4>
          <p className="text-[12px] text-ink-secondary mb-3">{cardMix.label}</p>
          {cardMix.all_suppressed ? (
            <SuppressedCard label="Card mix" reason={cardMix.note} />
          ) : (
            <div className="space-y-1.5">
              {CARD_ORDER.filter((k) => cardMix.shares?.[k] != null).map((k) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-[13px] text-ink-secondary capitalize">{k}</span>
                  <div className="flex-1 h-4 rounded bg-canvas overflow-hidden">
                    <div className={`h-full ${k === "OCBC" ? "bg-brand" : "bg-ink-light"}`} style={{ width: `${cardMix.shares[k]}%` }} />
                  </div>
                  <span className="font-num text-[13px] text-ink w-14 text-right">{pctOf(cardMix.shares[k], 1)}</span>
                </div>
              ))}
            </div>
          )}
          {cardMix.reduced && (
            <p className="text-[12.5px] text-ink mt-3 rounded-lg bg-warning-bg/50 border border-warning/30 px-3 py-2">
              OCBC does not acquire your terminals, so this panel shows OCBC-issued cards only — every other tender is
              invisible to us here. Moving acquiring to OCBC completes the picture. It is not needed to run a campaign.
            </p>
          )}
          <p className="text-[12px] text-ink-light mt-3">{cardMix.cash_note}</p>
          <BasisNote>
            {cardMix.note} This is acquiring data, not issuing data: it says what tapped at your terminals, and nothing
            about where those cardholders spend elsewhere.
          </BasisNote>
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------- §6 customer analysis — /sme-business-customer-analysis

function CustomerAnalysis({ profile, gap, rationale, hasRecommendation, trailingWeeks }) {
  const rfm = profile.rfm;
  return (
    <Card className="p-6 mt-8">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Sparkles size={15} className="text-analytics" />
        <h3 className="text-[16px] font-bold text-ink">Customer analysis</h3>
      </div>

      {/* The per-customer category profile that used to open this panel is gone from the screen.
          A breakdown that granular reads as the merchant being handed customer data even when
          every row is synthetic, and there is no version of it a merchant needs. The analysis
          itself is unchanged: sme-business-customer-analysis still produces it, the pipeline
          still writes it to merchant_profiles.json, and reward.py still consumes it as an input
          to the recommendation below. It is an internal computation now, not a panel. */}

      <div className="mb-6">
        <BlockHeading n={1} title="Demand gap" />
        {gap ? (
          <>
            {/* Only off-peak gaps carry a window, a magnitude and a structural finding. A peer-only
                or cold-start result has none of those, and inventing them would be the worst kind of
                decoration — so each fact renders only where the detector actually produced one. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniFact label="Type" value={gap.type.replace(/_/g, " ")} />
              <MiniFact label="Window" value={gap.window ?? "none detected"} tone={gap.window ? "brand" : "default"} />
              <MiniFact label="Confidence" value={gap.confidence} tone={gap.confidence === "high" ? "success" : "warning"} />
              <MiniFact
                label="Structural or seasonal"
                value={gap.structural === undefined ? "not determined" : gap.structural ? "structural" : "seasonal"}
              />
            </div>
            <p className="text-[13px] text-ink mt-3 max-w-3xl">{gap.message}</p>
            {(gap.other_flagged_slots ?? []).length > 0 && (
              <p className="text-[12.5px] text-ink-secondary mt-2 max-w-3xl">
                <span className="font-medium text-ink">{gap.other_flagged_slots.length} other slots</span> were flagged and
                none reached usable confidence, so {gap.window ? "none is proposed as a second window" : "no window is proposed"}.
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-ink-light">No demand gap of any type was detected for this merchant.</p>
        )}
      </div>

      <div>
        <BlockHeading n={2} title="RFM segmentation" />
        {rfm ? <RfmDistribution rfm={rfm} hasRecommendation={hasRecommendation} /> : (
          <p className="text-[13px] text-ink-light">Not enough history to score customers into RFM segments.</p>
        )}
      </div>
    </Card>
  );
}

// The segmentation as a share of the merchant's own scored customers, which is the shape a
// merchant reads — "a quarter of my people are Champions" rather than ten separate headcounts to
// hold in mind at once.
//
// Suppressed segments keep a bar position and a lock rather than dropping out of the axis. A
// segment silently missing from a distribution is the one failure mode worse than an empty bar:
// the chart would read as complete while the shares no longer account for everyone.
//
// The denominator is every customer scored, so the visible bars deliberately do not sum to 100%
// when a segment is suppressed. That is the honest total, and the residual is the suppression.
function RfmDistribution({ rfm, hasRecommendation }) {
  const [openGlossary, setOpenGlossary] = useState(false);
  const scored = rfm.customers_scored || 0;
  const rows = useMemo(
    () =>
      RFM_ORDER.filter((k) => rfm.segments[k]).map((k) => {
        const count = cellCount(rfm.segments[k]);
        return {
          segment: k,
          short: k.replace("Customers", "Cust.").replace("Potential Loyalists", "Potential"),
          suppressed: count === null,
          share: count === null || !scored ? 0 : Math.round((count / scored) * 1000) / 10,
        };
      }),
    [rfm, scored]
  );
  const suppressed = rows.filter((r) => r.suppressed);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="text-[12.5px] text-ink-secondary">Share of your scored customers, by segment</p>
        <button
          type="button"
          onClick={() => setOpenGlossary((v) => !v)}
          aria-expanded={openGlossary}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1 text-[12px] font-medium text-ink-secondary hover:text-ink hover:bg-canvas"
        >
          <Info size={13} />
          What the segments mean
        </button>
      </div>

      {openGlossary && (
        <div className="mb-3 rounded-lg border border-border bg-canvas/60 p-4">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
            {rows.map((r) => (
              <div key={r.segment} className="flex gap-2 text-[12.5px]">
                <dt className="font-semibold text-ink shrink-0 min-w-[9.5rem]">{r.segment}</dt>
                <dd className="text-ink-secondary">{RFM_SEGMENT_GLOSSARY[r.segment] ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ left: -12, right: 12, top: 8, bottom: 28 }}>
          <CartesianGrid vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="short" interval={0} angle={-30} textAnchor="end" height={54}
                 tick={{ fontSize: 11, fill: "#64748B" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            formatter={(v, _n, p) => (p?.payload?.suppressed ? ["Below threshold", p.payload.segment] : [`${v}%`, p.payload.segment])}
            labelFormatter={() => ""}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
          />
          <Bar dataKey="share" radius={[4, 4, 0, 0]}>
            {rows.map((r) => (
              <Cell key={r.segment} fill={r.suppressed ? "#E2E8F0" : "#C8102E"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {suppressed.length > 0 && (
        <p className="flex items-center gap-1.5 text-[12px] text-ink-light mt-1">
          <Lock size={11} />
          {suppressed.map((r) => r.segment).join(", ")} {suppressed.length === 1 ? "is" : "are"} below the reporting
          threshold and {suppressed.length === 1 ? "carries" : "carry"} no share.
        </p>
      )}

      <p className="text-[13px] text-ink mt-3 max-w-3xl">
        <span className="font-semibold">Lapsed total: {cellText(rfm.lapsed_total)}</span>
        {hasRecommendation
          ? " — the number the reward recommendation below acts on."
          : " — the number a win-back reward would act on."}
      </p>
    </>
  );
}

// ------------------------------------------- §6 reward options — /reward-programme-recommendation

function RewardOptions({ recs, rationale, campaign, reachOf, rounding, data }) {
  // Post-consent, post-frequency-cap reach lives in the state module, because a cardholder turning
  // offers off in the customer view moves it while this page is open.
  const liveReach = campaign ? reachOf(campaign) : null;
  const acquisition = recs.acquisition ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mt-10 mb-4">
        <h3 className="text-[17px] font-bold text-ink">Reward options</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {recs.ranked.map((r) => (
          <Card key={r.type} className={`p-5 ${r.disabled ? "border-dashed bg-canvas/60" : r.rank === 1 ? "border-brand/30 ring-1 ring-brand/10" : ""}`}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className={`text-[15px] font-bold ${r.disabled ? "text-ink-light" : "text-ink"}`}>
                {r.rank}. {r.label}
              </h4>
              {r.disabled ? (
                <Badge tone="neutral">
                  <Ban size={10} /> Ranked and rejected
                </Badge>
              ) : r.rank === 1 ? (
                <Badge tone="brand">Recommended</Badge>
              ) : null}
            </div>
            <p className={`text-[13px] ${r.disabled ? "text-ink-light" : "text-ink-secondary"}`}>
              {r.disabled ? r.rejected_reason : r.reason}
            </p>
            {!r.disabled && (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-secondary">
                  <Badge tone={r.new_or_returning === "New customer" ? "info" : "neutral"}>{r.new_or_returning}</Badge>
                </div>
                <div className="mt-3">
                  <div className="text-[11.5px] font-medium text-ink-secondary mb-1">
                    Target segments ·{" "}
                    {r.target_pool === "non_customers"
                      ? "cardholders who have never visited you"
                      : "your own customers, by RFM segment"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.target_pool === "non_customers" && r.non_customer_reach && (
                      <Badge tone="brand">Prospect customers (pre-consent) {cellText(r.non_customer_reach)}</Badge>
                    )}
                    {(r.target_segments ?? []).map((t) => (
                      <Badge key={t.segment} tone="neutral">
                        {t.segment}{" "}
                        {isSuppressed(t.reach) ? (
                          <span className="italic text-ink-light">below threshold</span>
                        ) : (
                          <span className="font-num font-semibold text-ink">{num(cellCount(t.reach))}</span>
                        )}
                      </Badge>
                    ))}
                    {(r.target_segments ?? []).length === 0 && (
                      <span className="text-[12px] text-ink-light">No segment clears the floor for this type.</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </Card>
        ))}
      </div>
      <BasisNote>Score: {recs.score_basis}</BasisNote>

      {acquisition && (
        <Card className="p-6 mt-4">
          <h4 className="text-[15px] font-bold text-ink mb-2">Prospect customers (post-consent)</h4>
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <div className="font-num text-[44px] font-extrabold text-brand leading-none">
                {liveReach != null ? num(liveReach) : cellText(acquisition.reach)}
              </div>
              <div className="text-[13px] text-ink-secondary mt-1 max-w-sm">
                OCBC cardholders who spend at comparable merchants and have never transacted with you, reachable after
                consent and the portfolio frequency cap.
              </div>
            </div>
            <div className="text-[12.5px] text-ink-secondary max-w-md">
              A count and a plain-language description, and nothing else. There is no age split, no spend distribution
              and no map for people who have never walked in — the interface has no screen where that could appear.
            </div>
          </div>
          <BasisNote>
            {acquisition.note} Segment before consent and the cap: {cellText(acquisition.reach)} (segments.json). The
            figure shown is the live allocation from the shared state module, rounded to the nearest {rounding} — it
            moves while this page is open when a cardholder turns offers off.
          </BasisNote>
        </Card>
      )}

      {/* The generated ranking rationale is off this screen too. It quoted the expected incremental
          share and the score by name, and with both figures gone the sentence would be narrating
          numbers the merchant can no longer see — which breaks the adjacency rule from the other
          direction. rationales.json still carries it, pre-computed, for the deck and for Q&A. */}
    </>
  );
}

// What the "expected incremental share" on each reward type above actually means, measured rather
// than asserted. Absorbed from the retired screen 4, and placed here on purpose: a share of 75% is
// a claim, and the claim needs its working adjacent to it rather than two screens away.
//
// Nothing here is a before-and-after. Every figure comes off a held-out control group from a
// campaign that has already run, which is the only way an incrementality number survives a banker
// asking how it was arrived at (§2.5).
//
// The excluded cohort is described without a person attached, for the same reason CohortCard
// exists: this is a merchant-facing screen and §2.1 allows it counts and labels only.
function Incrementality({ data }) {
  const winner = (data.campaignResults?.completed ?? []).find((c) => c.measured && c.cost?.net_sign === "positive");
  if (!winner) return null;
  // The held-out arm's own conversion rate, applied to the treated arm: what this campaign would
  // have got for free. Counted, never assumed.
  const organic = Math.round(winner.cohort.treated * (winner.conversion.control_rate_pct / 100));

  return (
    <Card className="p-6 mt-4">
      <h4 className="text-[15px] font-bold text-ink mb-1">Where the incremental share comes from</h4>
      <p className="text-[12.5px] text-ink-secondary mb-4 max-w-3xl">
        Measured on {winner.name} ({winner.window}): {num(winner.cohort.treated)} cardholders treated against{" "}
        {num(winner.cohort.control)} held out and shown nothing. The held-out arm is what turns a redemption count into
        an incrementality claim — without it, every campaign looks like a success.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <IncrementalityBlock
          label="Excluded before targeting"
          value="The price-insensitive cohort"
          tone="warning"
          detail="Cardholders whose spend does not move with an incentive — high average ticket, no voucher use, buying regardless. They are filtered out before a segment is built, because crediting their visits to a campaign would overstate it."
        />
        <IncrementalityBlock
          label="Redeemed, but would have converted anyway"
          value={`${num(organic)} of ${num(winner.redemption.redeemers)} redeemers`}
          tone="neutral"
          detail={`The control group converted at ${pctOf(winner.conversion.control_rate_pct, 1)} with no offer at all. Applied to the treated arm, that is what this campaign would have got for free — and it is what the incremental share above discounts for.`}
        />
        <IncrementalityBlock
          label="Real incremental transactions"
          value={num(winner.incremental.incremental_transactions, 1)}
          tone="success"
          detail={`${sgd(winner.incremental.incremental_sales_sgd)} in incremental sales — treated-arm sales minus control-arm sales, scaled by arm size. Never before-versus-after: this is the number the campaign is judged on.`}
        />
      </div>
      <BasisNote>{winner.incremental.basis} (campaign_results.json — the full breakdown is on the results screen.)</BasisNote>
    </Card>
  );
}

function IncrementalityBlock({ label, value, detail, tone }) {
  const toneClass = { success: "text-success", warning: "text-warning", neutral: "text-ink" }[tone] ?? "text-ink";
  return (
    <div className="rounded-lg border border-border bg-canvas/50 p-4">
      <div className="text-[11.5px] font-medium text-ink-secondary mb-1">{label}</div>
      <div className={`text-[16px] font-bold mb-1.5 ${toneClass}`}>{value}</div>
      <p className="text-[12.5px] text-ink-secondary leading-snug">{detail}</p>
    </div>
  );
}

// The sign-up action, and the eligibility gate's only appearance on this screen — as an outcome,
// never as a panel of the merchant's own balance and score bands read back to it.
//
// Three states, and the middle one is the point:
//   not applied   the button. The gate has not been asked yet and nothing is claimed about it.
//   refused       the pipeline's own message. Set-up stays shut and the merchant is told why in
//                 one sentence, not shown the arithmetic behind the decision.
//   applied       the receipt, and the way into Set-up, which is now unlocked.
//
// The decision is never recomputed here: `eligibility.passed` is reward.py's verdict, shipped in
// reward_recommendations.json, and the APPLY reducer refuses on the same field. This component
// only reads which of the three states the state module is in.
function Apply({ campaign, inFlight, profile, eligibility, state, dispatch, display, rewind }) {
  const navigate = useNavigate();
  const [requested, setRequested] = useState(false);
  const unlocked = campaign ? rewardConfigUnlocked(state, campaign.id) : false;

  // Routed into Set-up by the state the reducer produced, not by the click. A refused application
  // never satisfies this, so the failing case stays on this page with its message.
  useEffect(() => {
    if (requested && unlocked) navigate("/reward-configuration");
  }, [requested, unlocked, navigate]);
  if (!campaign) {
    // Already past the application stage: the programme exists, it is just being configured or is
    // running. Send the merchant to the tab that now owns it rather than reporting an absence.
    if (inFlight) {
      return (
        <Card className="p-6 mt-6">
          <h3 className="text-[15px] font-bold text-ink mb-1">Your reward programme is already open</h3>
          <p className="text-[13px] text-ink-secondary max-w-3xl">
            {inFlight.name} is {display(inFlight.status)}. Configuration and everything that follows live on the
            Reward Configuration tab.
          </p>
          <Link
            to="/reward-configuration"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover"
          >
            Open Reward Configuration →
          </Link>
        </Card>
      );
    }
    return (
      <Card className="p-6 mt-6 border-dashed">
        <h3 className="text-[15px] font-bold text-ink mb-1">No open application for {profile.name}</h3>
        <p className="text-[13px] text-ink-secondary max-w-3xl">
          The demo dataset carries one live application per merchant at most, and this merchant has none. The profile
          and the ranked rewards above are what a merchant sees before applying; the action itself is wired on{" "}
          {profile.name === "Soujourner Coffee" ? "this merchant" : "Soujourner Coffee"}.
        </p>
      </Card>
    );
  }

  const gate = campaign.eligibility ?? eligibility ?? null;
  const gateFailed = gate?.passed === false;
  const applied = Boolean(campaign.applied_at);
  const rejection = [...state.ledger]
    .reverse()
    .find((e) => e.type === "REJECTED" && e.event === "APPLY" && e.detail?.campaign_id === campaign.id);
  // Refused once the gate has actually been asked — either the reducer turned this session's click
  // away, or the seed already carries an application that the gate did not clear.
  const refused = gateFailed && (applied || Boolean(rejection));

  if (refused) {
    return (
      <Card className="p-6 mt-6 border-brand/30 bg-[#FFF8F8]">
        <div className="flex items-start gap-3">
          <ShieldX size={18} className="text-brand shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-ink">
              {gate?.message ?? "You are not eligible for the reward programme."}
            </p>
            <p className="text-[13px] text-ink-secondary mt-1 max-w-3xl">
              Your trading summary above is your own data and stays available. Nothing has been configured and nothing
              has been sent. Your relationship manager can talk through what would change the outcome.
            </p>
            <BasisNote>
              reward_recommendations.json eligibility (pipeline/reward.py Step 1) — the same gate, applied to every
              merchant, and refused here as a logged event rather than a hidden branch.
            </BasisNote>
          </div>
        </div>
      </Card>
    );
  }

  return (
    // Light, with ink text. This card used to be navy with white text, which Tailwind's class
    // order quietly turned into white-on-white — see the Card component. It is fixed by not
    // depending on a background override to make the words visible at all: dark type on a light
    // card reads the same whatever order the stylesheet lands in.
    <Card className="p-6 mt-6 border-ink/15">
      {!applied ? (
        <>
          <h3 className="text-[18px] font-bold text-ink mb-1">Sign up for the reward programme</h3>
          <p className="text-[13px] text-ink-secondary max-w-2xl">
            This sends an application to OCBC and opens the set-up page, where you and your relationship manager
            configure the reward together. Nothing goes to any cardholder at this point, and nothing can: configuring a
            reward and sending one are separate steps, and the second belongs to OCBC. There is no one-click launch
            anywhere in this product.
          </p>
          <button
            onClick={() => {
              setRequested(true);
              dispatch({ type: "APPLY", campaign_id: campaign.id, by: "merchant" });
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-[14px] font-semibold text-white hover:bg-brand-hover active:bg-brand-active transition-colors"
          >
            Sign up for the reward programme
          </button>
          {rejection && <p className="text-[12px] text-brand mt-2">Refused: {rejection.reason}</p>}
        </>
      ) : (
        <div className="flex items-start gap-3">
          {/* The tick keeps its white glyph: it sits on a filled green disc, which is its own
              background and was the one part of this card that stayed visible throughout. */}
          <div className="h-8 w-8 rounded-full bg-success flex items-center justify-center shrink-0">
            <Check size={16} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-ink">OCBC has received your application.</p>
            <p className="text-[13px] text-ink-secondary mt-1 max-w-2xl">
              {campaign.rm_message ?? "A relationship manager will be in touch within the week."} Nothing has been
              configured and nothing has been sent. It shows on your dashboard as{" "}
              <span className="font-semibold text-ink">{display(campaign.status)}</span> — awaiting that contact, not
              awaiting review, because there is nothing to review yet.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                to="/reward-configuration"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-hover"
              >
                Open the configuration page →
              </Link>
              <span className="text-[12px] text-ink-light">
                {display(campaign.status)} · applied {String(campaign.applied_at).slice(0, 10)}
              </span>
              {/* The application is seeded so the RM's queue is populated on a cold load. This puts
                  the handoff back in front of the presenter so it can still be performed live —
                  and it is the only way to see the Set-up tab lock again mid-demo. */}
              <button
                onClick={rewind}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-ink-light px-3 py-1.5 text-[12px] font-semibold text-ink-secondary hover:text-ink"
              >
                Demo · rewind to before the application
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------- fragments

function BlockHeading({ n, title }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="h-5 w-5 rounded-full bg-analytics/10 text-analytics font-num text-[11px] font-bold flex items-center justify-center">{n}</span>
      <h4 className="text-[14px] font-bold text-ink">{title}</h4>
    </div>
  );
}

function ShareBars({ rows, tone = "slate" }) {
  const max = Math.max(...rows.map((r) => r.share), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[12.5px] text-ink-secondary">{r.label}</span>
          <div className="flex-1 h-4 rounded bg-canvas overflow-hidden">
            <div className={`h-full ${tone === "ink" ? "bg-ink" : "bg-ink-light"}`} style={{ width: `${(r.share / max) * 100}%` }} />
          </div>
          <span className="font-num text-[12.5px] text-ink w-12 text-right">{pctOf(r.share, 1)}</span>
        </div>
      ))}
    </div>
  );
}

function SplitBar({ leftLabel, rightLabel, leftShare }) {
  return (
    <>
      <div className="flex h-6 rounded overflow-hidden border border-border">
        <div className="bg-ink" style={{ width: `${leftShare}%` }} />
        <div className="bg-ink-light/40" style={{ width: `${100 - leftShare}%` }} />
      </div>
      <div className="flex justify-between text-[11.5px] text-ink-secondary mt-1">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </>
  );
}

function CategoryList({ title, rows, breadth, emphasis }) {
  return (
    <div className={`rounded-lg border p-4 ${emphasis ? "border-brand/30 bg-[#FFF8F8]" : "border-border bg-canvas/40"}`}>
      <div className="text-[12.5px] font-semibold text-ink mb-2">{title}</div>
      <div className="space-y-1">
        {rows.map((c) => (
          <div key={c.category} className="flex items-center justify-between gap-2 text-[12.5px]">
            <span className="text-ink-secondary truncate">{c.label}</span>
            <span className="font-num text-ink">{pctOf(c.share_pct, 1)}</span>
          </div>
        ))}
      </div>
      <div className="text-[11.5px] text-ink-light mt-2">Basket breadth: {breadth} categories, median</div>
    </div>
  );
}

function MiniFact({ label, value, tone = "default" }) {
  const toneClass = { default: "text-ink", brand: "text-brand", success: "text-success", warning: "text-warning" }[tone];
  return (
    <div className="rounded-lg border border-border bg-canvas/40 px-3 py-2">
      <div className="text-[11.5px] text-ink-secondary">{label}</div>
      {/* first-letter, not capitalize: "off peak" and "high" need a capital, "14.9 days" does not. */}
      <div className={`text-[15px] font-bold first-letter:uppercase ${toneClass}`}>{value}</div>
    </div>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
