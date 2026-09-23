import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useDemoData } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { sgd, num } from "../../data/format";
import { Card, SectionTitle, Badge, BasisNote, InfoTip } from "../../components/ui";
import ExposurePanel from "./ExposurePanel";
import PushTrigger, { PushTriggerProvider } from "./PushTrigger";
import { StatusPill, Th, Td } from "./rmCommon";

// ---------------------------------------------------------------------------------------------
// RM screen 1 — the portfolio dashboard (RM §3).
//
// Three things: the caseload strip, the portfolio exposure panel, and the programme lists.
// Everything reads the shared state module, so firing the allocator from an Ongoing row moves the
// customer's feed and this page's counters at the same time.
//
// Two lists, not four. Approval came out of the workflow, and with it the RM's Pending queue and
// the "in setup / awaiting approval" table — a merchant configures and submits their own
// programme now, so there is no state in which the RM is the one holding it up. What is left is
// what the RM actually watches: programmes that are running, and programmes that have finished.
//
// "Ongoing" is everything submitted and not yet finished — Live, and In queue for a start date
// still ahead. They belong on one list because they are one thing to an RM (a committed
// programme), and the row labels which it is. The allocator can only be fired against a Live one:
// sending an offer for a window that has not opened would put a card in a cardholder's hand that
// they cannot redeem, which is worse than not sending it.
//
// The applications queue was the only place the eligibility gate's refusal was visible from this
// screen. It still has a home — the merchant view's Customer Profile tab refuses the merchant to
// their face, which is the more honest place for it — and the exposure panel below is unchanged.
// ---------------------------------------------------------------------------------------------

export default function PortfolioDashboard() {
  const { data } = useDemoData();
  const m = useMobiusState();
  if (!m) return null;
  const { state, display, displayOf, isQueued } = m;
  const clock = state.clock;

  const campaigns = Object.values(state.campaigns);
  // Ongoing is one list with two readings. Live first, then queued: a programme that has started
  // is the one an RM may need to act on, and a start date in the future is the definition of
  // nothing to do yet.
  const ongoing = campaigns.filter((c) => c.status === "active")
    .sort((a, b) => Number(isQueued(a)) - Number(isQueued(b)));
  const live = ongoing.filter((c) => !isQueued(c));
  const queued = ongoing.filter((c) => isQueued(c));
  const finished = campaigns.filter((c) => ["completed", "capped", "stopped"].includes(c.status));

  return (
    <PushTriggerProvider>
    <div className="max-w-container mx-auto px-6 py-8">
      <SectionTitle
        eyebrow="Screen 1 · Portfolio"
        title="Your caseload this week"
        subtitle="Emerging Business and Middle Market merchants on the Mobius programme."
      />

      {/* ------------------------------------------------------------------ 3.1 caseload strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Merchants in portfolio" value={num(Object.keys(data.merchantPriority ?? {}).length)}
              sub="Scored on the programme" />
        <Stat label="Programmes live" value={num(live.length)} sub="Window open, redeemable today" />
        <Stat label="In queue" value={num(queued.length)} sub="Submitted, start date still ahead" />
        <Stat label="Finished this quarter" value={num(finished.length)}
              sub={`${num(finished.filter((c) => c.results?.cost?.net_sign === "negative").length)} did not clear their reward cost`} />
      </div>

      {/* ------------------------------------------------------------------ 3.2 portfolio exposure */}
      <ExposurePanel />

      {/* ------------------------------------------------------------------ 3.3 ongoing */}
      <Card className="p-6 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="text-[16px] font-bold text-ink">Ongoing</h2>
            <p className="text-[12.5px] text-ink-secondary mt-0.5 max-w-3xl">
              Submitted and not yet finished.
              <InfoTip title="About the trigger" className="ml-1">
                The trigger on a row runs the allocator and puts the offer in cardholders' apps. It's a demo control; in production
                this is a scheduled send.
              </InfoTip>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge tone="success">{num(live.length)} live</Badge>
            {queued.length > 0 && <Badge tone="neutral">{num(queued.length)} in queue</Badge>}
          </div>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full">
            <thead><tr className="border-b border-border">
              <Th>Merchant</Th><Th>Campaign</Th><Th>Status</Th><Th align="right">Reach</Th><Th align="right">Redemptions</Th>
              <Th align="right">Incremental sales</Th><Th align="right">Reward cost to date</Th><Th align="right">Days left</Th><Th />
            </tr></thead>
            <tbody>
              {ongoing.map((c) => (
                <OngoingRow key={c.id} campaign={c} clock={clock} reachOf={m.reachOf} queued={isQueued(c)} label={displayOf(c)} />
              ))}
              {ongoing.length === 0 && (
                <tr><Td className="text-ink-light" colSpan={9}>Nothing is running. A programme appears here as soon as a merchant submits one.</Td></tr>
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
        <p className="text-[12.5px] text-ink-secondary mb-3">Final results, signed.</p>
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

function OngoingRow({ campaign, clock, reachOf, queued, label }) {
  const c = campaign;
  const cfg = c.configuration ?? {};
  const redemptions = c.counters.redemptions;
  const startsOn = c.window?.start ?? cfg.window_start ?? null;
  // The merchant's whole cost so far, as a ceiling rather than a measurement: the app knows how
  // many rewards were redeemed and what one is worth at most, not what each ticket came to.
  const maxValue = cfg.max_reward_value_sgd ?? cfg.cap_per_txn_sgd ?? null;
  const costToDate = maxValue == null ? null : redemptions * maxValue;
  const daysLeft = c.results?.days_remaining ?? (c.window?.end ? Math.max(0, Math.ceil((Date.parse(`${c.window.end}T23:59:59+08:00`) - Date.parse(clock)) / 86_400_000)) : null);

  return (
    <tr className={`border-b border-border/60 ${queued ? "bg-canvas/40" : ""}`}>
      <Td className="font-semibold text-ink whitespace-nowrap">{c.merchant_name}</Td>
      <Td className="text-ink-secondary">{c.name}</Td>
      <Td className="whitespace-nowrap">
        <Badge tone={queued ? "neutral" : "success"}>{label}</Badge>
        {queued && startsOn && <div className="text-[11px] text-ink-light mt-0.5">starts {startsOn}</div>}
      </Td>
      <Td align="right">{num(reachOf(c) ?? c.counters.feed_delivered)}</Td>
      {/* A queued programme has no running statistics, and dashes say so. Zeros would read as
          "nobody redeemed" rather than "it has not started", which is a different and worse claim. */}
      <Td align="right">{queued ? <span className="text-ink-light">—</span> : num(redemptions)}</Td>
      <Td align="right" className="text-ink-light">not yet measured</Td>
      <Td align="right">{queued || costToDate === null ? <span className="text-ink-light">—</span> : `≤ ${sgd(costToDate)}`}</Td>
      <Td align="right">{queued || daysLeft === null ? <span className="text-ink-light">—</span> : num(daysLeft)}</Td>
      <Td align="right">
        <div className="flex flex-col items-end gap-1.5">
          <PushTrigger campaign={c} compact queued={queued} />
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
