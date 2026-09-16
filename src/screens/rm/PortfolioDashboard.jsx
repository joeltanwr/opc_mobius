import React from "react";
import { Link } from "react-router-dom";
import { Clock3, ArrowRight, AlertTriangle, Info } from "lucide-react";
import { useDemoData, merchantById } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { sgd, num } from "../../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../../components/ui";
import ExposurePanel from "./ExposurePanel";
import PushTrigger, { PushTriggerProvider } from "./PushTrigger";
import { PriorityCell, StatusPill, Th, Td, daysBetween, daysWaiting, isOverdue, CONTACT_PROMISE_DAYS, CONTACT_PROMISE_BASIS } from "./rmCommon";

// ---------------------------------------------------------------------------------------------
// RM screen 1 — the portfolio dashboard (RM §3).
//
// Three things, in the prompt's order: the caseload strip, the portfolio exposure panel, and the
// programme lists by status. Everything reads the shared state module, so a campaign the merchant
// applied for on Tab 3 is already sitting in the pending list here, and a push fired from an
// Ongoing row moves the customer's feed and this page's counters at the same time.
// ---------------------------------------------------------------------------------------------

export default function PortfolioDashboard() {
  const { data } = useDemoData();
  const m = useMobiusState();
  if (!m) return null;
  const { state, display } = m;
  const clock = state.clock;
  const priorityOf = (merchantId) => data.merchantPriority?.[merchantId] ?? null;

  const campaigns = Object.values(state.campaigns);
  // `applied` covers two different situations and the difference matters: a campaign the merchant
  // has actually applied for (applied_at stamped by the APPLY event) is work in the RM's queue; a
  // campaign Mobius has merely computed a recommendation for is not an application at all, and
  // counting it as one would inflate the queue with work nobody asked for.
  const applications = campaigns.filter((c) => c.status === "applied" && c.applied_at);
  const unapplied = campaigns.filter((c) => c.status === "applied" && !c.applied_at);
  const inFlight = campaigns.filter((c) => ["draft", "pending"].includes(c.status));
  const ongoing = campaigns.filter((c) => c.status === "active");
  const finished = campaigns.filter((c) => ["completed", "capped", "stopped"].includes(c.status));

  const ranked = applications.filter((c) => priorityOf(c.merchant_id)?.tier !== "insufficient_data")
    .sort((a, b) => (priorityOf(b.merchant_id)?.score ?? -1) - (priorityOf(a.merchant_id)?.score ?? -1));
  const unranked = applications.filter((c) => priorityOf(c.merchant_id)?.tier === "insufficient_data");

  return (
    <PushTriggerProvider>
    <div className="max-w-container mx-auto px-6 py-8">
      <SectionTitle
        eyebrow="Screen 1 · Portfolio"
        title="Your caseload this week"
        subtitle="Emerging Business and Middle Market merchants on the Mobius programme. The exposure panel below is the part no merchant can see — and the reason per-campaign approval alone is not enough."
      />

      {/* ------------------------------------------------------------------ 3.1 caseload strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Merchants in portfolio" value={num(Object.keys(data.merchantPriority ?? {}).length)}
              sub="Scored on the programme (merchant_priority.json)" />
        <Stat label="Applications awaiting contact" value={num(applications.length)}
              sub={`${num(applications.filter((c) => isOverdue(daysWaiting(c.applied_at, clock))).length)} past the week they were promised`}
              tone={applications.some((c) => isOverdue(daysWaiting(c.applied_at, clock))) ? "warning" : "default"} />
        <Stat label="Campaigns live" value={num(ongoing.length)} sub={`${num(inFlight.length)} in setup or awaiting approval`} />
        <Stat label="Finished this quarter" value={num(finished.length)}
              sub={`${num(finished.filter((c) => c.results?.cost?.net_sign === "negative").length)} did not clear their reward cost`} />
      </div>

      {/* ------------------------------------------------------------------ 3.2 portfolio exposure */}
      <ExposurePanel />

      {/* ------------------------------------------------------------------ 3.3 pending */}
      <Card className="p-6 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="text-[16px] font-bold text-ink">Pending — applications awaiting your call</h2>
            <p className="text-[12.5px] text-ink-secondary mt-0.5 max-w-3xl">
              No statistics here: nothing has run, so there is nothing to report. Ordered by relationship-value score, with the three
              components that produced it on the row, so you can answer "why is this one first" without opening anything.
            </p>
          </div>
          <Badge tone="warning">{num(applications.length)} waiting</Badge>
        </div>

        <div className="overflow-x-auto mt-3">
          <table className="w-full">
            <thead><tr className="border-b border-border">
              <Th>Merchant</Th><Th>Sector</Th><Th>Applied</Th><Th>Waiting</Th><Th>Priority — score and its parts</Th><Th>Mobius recommends</Th><Th>Eligibility</Th><Th />
            </tr></thead>
            <tbody>
              {ranked.map((c) => <PendingRow key={c.id} campaign={c} priority={priorityOf(c.merchant_id)} clock={clock} data={data} />)}
            </tbody>
          </table>
        </div>

        {unranked.length > 0 && (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-canvas/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Info size={14} className="text-ink-secondary" />
              <h3 className="text-[13px] font-bold text-ink">Unranked — not enough relationship history to score</h3>
            </div>
            <p className="text-[12.5px] text-ink-secondary max-w-3xl">
              Unranked is not the bottom of the list. A merchant in the low tier has been assessed and found to have modest headroom;
              these have not been assessed at all, and you may well call one first for a reason the model cannot see. They sit apart
              rather than below for exactly that reason.
            </p>
            <div className="overflow-x-auto mt-3">
              <table className="w-full">
                <thead><tr className="border-b border-border">
                  <Th>Merchant</Th><Th>Sector</Th><Th>Applied</Th><Th>Waiting</Th><Th>Why unranked</Th><Th>Mobius recommends</Th><Th>Eligibility</Th><Th />
                </tr></thead>
                <tbody>
                  {unranked.map((c) => <PendingRow key={c.id} campaign={c} priority={priorityOf(c.merchant_id)} clock={clock} data={data} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {unapplied.map((c) => (
          <div key={c.id} className="mt-4 rounded-xl border border-dashed border-info/50 bg-info-bg/40 px-4 py-3 flex flex-wrap items-center gap-3">
            <Info size={15} className="text-info shrink-0" />
            <p className="text-[12.5px] text-ink-secondary flex-1 min-w-[18rem]">
              <span className="font-semibold text-ink">{c.merchant_name}</span> has a Mobius recommendation ready, but has not applied yet — a
              recommendation is not an application, so it is not in the queue above and not in the count. The merchant applies on{" "}
              <Link to="/target-customer" className="font-medium text-brand hover:underline">the merchant view</Link>; this row becomes an
              application the moment they do.
            </p>
          </div>
        ))}

        <BasisNote>
          Rows from the shared state module (campaign_results.json applications plus anything applied for live). Score, tier and components from
          merchant_priority.json — RM-only, never shown to a merchant. A row ages once it passes {CONTACT_PROMISE_DAYS} days: {CONTACT_PROMISE_BASIS}
        </BasisNote>
      </Card>

      {/* ------------------------------------------------------------------ in setup / awaiting approval */}
      {inFlight.length > 0 && (
        <Card className="p-6 mb-5">
          <h2 className="text-[16px] font-bold text-ink mb-1">In setup and awaiting approval</h2>
          <p className="text-[12.5px] text-ink-secondary mb-3">
            Configuration and approval are two steps with two owners. Nothing here has sent anything to anybody.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-border"><Th>Merchant</Th><Th>Campaign</Th><Th>Status</Th><Th align="right">Reach</Th><Th /></tr></thead>
              <tbody>
                {inFlight.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <Td className="font-semibold text-ink">{c.merchant_name}</Td>
                    <Td className="text-ink-secondary">{c.name}</Td>
                    <Td><StatusPill campaign={c} display={display} /></Td>
                    <Td align="right">{c.segment ? num(c.segment.reach) : num(m.reachOf(c))}</Td>
                    <Td align="right">
                      <Link to={`/rm/configure/${c.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline">
                        {c.status === "pending" ? "Review and approve" : "Continue configuring"} <ArrowRight size={12} />
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------ 3.3 ongoing */}
      <Card className="p-6 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="text-[16px] font-bold text-ink">Ongoing</h2>
            <p className="text-[12.5px] text-ink-secondary mt-0.5 max-w-3xl">
              Live campaigns with running statistics. The demonstration trigger on each row is what fires a push into a cardholder's app —
              marked as a demo control because in production this is a scheduled send, not a button.
            </p>
          </div>
          <Badge tone="success">{num(ongoing.length)} live</Badge>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full">
            <thead><tr className="border-b border-border">
              <Th>Merchant</Th><Th>Campaign</Th><Th align="right">Reach</Th><Th align="right">Redemptions</Th>
              <Th align="right">Incremental sales</Th><Th align="right">Reward cost to date</Th><Th align="right">Days left</Th><Th />
            </tr></thead>
            <tbody>
              {ongoing.map((c) => <OngoingRow key={c.id} campaign={c} clock={clock} reachOf={m.reachOf} />)}
              {ongoing.length === 0 && (
                <tr><Td className="text-ink-light" colSpan={8}>No campaign is live yet. Approve one from the queue above and it appears here.</Td></tr>
              )}
            </tbody>
          </table>
        </div>
        <BasisNote>
          Reward cost to date is the ceiling on what the merchant has spent so far — redemptions × the maximum value of one reward — and it is the
          merchant's whole cost. Incremental sales are not shown for a running campaign: they need the control comparison that only exists once the
          window closes, and a before-and-after figure is not incrementality.
        </BasisNote>
      </Card>

      {/* ------------------------------------------------------------------ 3.3 completed */}
      <Card className="p-6">
        <h2 className="text-[16px] font-bold text-ink mb-1">Completed</h2>
        <p className="text-[12.5px] text-ink-secondary mb-3">Final results, signed. One of these lost money, and it stays on the list.</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border">
              <Th>Merchant</Th><Th>Campaign</Th><Th>Status</Th><Th align="right">Redemptions</Th>
              <Th align="right">Incremental sales</Th><Th align="right">Reward cost</Th><Th align="right">Net contribution</Th><Th />
            </tr></thead>
            <tbody>
              {finished.sort((a, b) => Number(Boolean(b.measured)) - Number(Boolean(a.measured))).map((c) => (
                <CompletedRow key={c.id} campaign={c} display={display} />
              ))}
            </tbody>
          </table>
        </div>
        <BasisNote>
          Net contribution = incremental sales × assumed gross margin − reward cost, signed. Campaigns with no transaction-level acquiring data in the
          demo show dashes rather than an estimate.
        </BasisNote>
      </Card>
    </div>
    </PushTriggerProvider>
  );
}

function Stat({ label, value, sub, tone = "default" }) {
  const toneClass = { default: "text-ink", warning: "text-warning" }[tone];
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-card">
      <div className="text-[12px] text-ink-secondary mb-1">{label}</div>
      <div className={`font-num text-[28px] font-bold leading-none tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[11.5px] text-ink-light mt-1.5 leading-snug">{sub}</div>
    </div>
  );
}

function PendingRow({ campaign, priority, clock, data }) {
  const waiting = daysWaiting(campaign.applied_at, clock);
  const overdue = isOverdue(waiting);
  const profile = merchantById(data.merchantProfiles, campaign.merchant_id);
  const elig = campaign.eligibility ?? data.rewardRecommendations?.[campaign.merchant_id]?.eligibility ?? null;
  const rec = campaign.recommended;

  return (
    <tr className={`border-b border-border/60 ${overdue ? "bg-warning-bg/40" : ""}`}>
      <Td className="font-semibold text-ink whitespace-nowrap">{campaign.merchant_name}</Td>
      <Td className="text-ink-secondary whitespace-nowrap">{campaign.results?.sector ?? profile?.sector ?? "—"}</Td>
      <Td className="font-num text-ink-secondary tabular-nums whitespace-nowrap">{String(campaign.applied_at).slice(0, 10)}</Td>
      <Td className="whitespace-nowrap">
        <span className={`inline-flex items-center gap-1 font-num text-[13px] tabular-nums ${overdue ? "font-bold text-warning" : "text-ink"}`}>
          {overdue && <AlertTriangle size={12} />}
          <Clock3 size={12} className={overdue ? "hidden" : "text-ink-light"} />
          {waiting === null ? "—" : `${waiting} days`}
        </span>
        {overdue && <div className="text-[11px] text-warning">past the week promised</div>}
      </Td>
      <Td><PriorityCell priority={priority} /></Td>
      <Td className="text-ink">
        {rec?.label ?? (elig?.passed === false ? <span className="text-ink-light">none — not eligible</span> : "—")}
      </Td>
      <Td>
        {elig ? (
          elig.passed
            ? <Badge tone="success">Eligible</Badge>
            : <div className="flex flex-col gap-1">
                <Badge tone="warning">Not eligible</Badge>
                <span className="text-[11px] text-ink-secondary leading-snug max-w-[12rem]">{elig.reasons?.[0]}</span>
              </div>
        ) : <span className="text-ink-light text-[12px]">—</span>}
      </Td>
      <Td align="right">
        <Link to={`/rm/pending/${campaign.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline whitespace-nowrap">
          Open brief <ArrowRight size={12} />
        </Link>
      </Td>
    </tr>
  );
}

function OngoingRow({ campaign, clock, reachOf }) {
  const c = campaign;
  const cfg = c.configuration ?? {};
  const redemptions = c.counters.redemptions;
  // The merchant's whole cost so far, as a ceiling rather than a measurement: the app knows how
  // many rewards were redeemed and what one is worth at most, not what each ticket came to.
  const maxValue = cfg.max_reward_value_sgd ?? cfg.cap_per_txn_sgd ?? null;
  const costToDate = maxValue == null ? null : redemptions * maxValue;
  const daysLeft = c.results?.days_remaining ?? (c.window?.end ? Math.max(0, Math.ceil((Date.parse(`${c.window.end}T23:59:59+08:00`) - Date.parse(clock)) / 86_400_000)) : null);

  return (
    <tr className="border-b border-border/60">
      <Td className="font-semibold text-ink whitespace-nowrap">{c.merchant_name}</Td>
      <Td className="text-ink-secondary">{c.name}</Td>
      <Td align="right">{num(reachOf(c) ?? c.counters.feed_delivered)}</Td>
      <Td align="right">{num(redemptions)}</Td>
      <Td align="right" className="text-ink-light">not yet measured</Td>
      <Td align="right">{costToDate === null ? "—" : `≤ ${sgd(costToDate)}`}</Td>
      <Td align="right">{daysLeft === null ? "—" : num(daysLeft)}</Td>
      <Td align="right">
        <div className="flex flex-col items-end gap-1.5">
          <PushTrigger campaign={c} compact />
          <Link to={`/rm/campaign/${c.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline whitespace-nowrap">
            Open detail <ArrowRight size={12} />
          </Link>
        </div>
      </Td>
    </tr>
  );
}

function CompletedRow({ campaign, display }) {
  const r = campaign.results ?? {};
  const cost = r.cost ?? null;
  const negative = cost?.net_sign === "negative";
  return (
    <tr className="border-b border-border/60">
      <Td className="font-semibold text-ink whitespace-nowrap">{campaign.merchant_name}</Td>
      <Td className="text-ink-secondary">{campaign.name}</Td>
      <Td><StatusPill campaign={campaign} display={display} note={campaign.stopped?.reason} /></Td>
      <Td align="right">{num(r.redemption?.redeemers ?? r.redemptions ?? campaign.counters.redemptions)}</Td>
      <Td align="right">{r.incremental ? sgd(r.incremental.incremental_sales_sgd) : <span className="text-ink-light">—</span>}</Td>
      <Td align="right">{cost ? sgd(cost.reward_cost_sgd) : <span className="text-ink-light">—</span>}</Td>
      <Td align="right" className={cost ? (negative ? "text-brand font-bold" : "text-success font-bold") : ""}>
        {cost ? sgd(cost.net_contribution_sgd) : <span className="text-ink-light">not measured</span>}
      </Td>
      <Td align="right">
        <Link to={`/rm/campaign/${campaign.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline whitespace-nowrap">
          Open detail <ArrowRight size={12} />
        </Link>
      </Td>
    </tr>
  );
}
