import React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Lock, ShieldCheck, Sparkles, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { useDemoData, merchantById } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { sgd, num, pct, pctOf, cellText, cellCount } from "../../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../../components/ui";
import { PER_CUSTOMER_LIMITS } from "../../state/store.js";
import PushTrigger, { PushTriggerProvider } from "./PushTrigger";
import { StatusPill, Th, Td, daysBetween } from "./rmCommon";

// ---------------------------------------------------------------------------------------------
// RM screen 4 — ongoing and completed programme detail (RM §6).
//
// The merchant's own drill-down plus the context only the RM has: who the business is, what the
// configuration was as set, and which fields were moved away from the Mobius draft. When a
// campaign underperforms that last part is where the explanation lives, so the edits are flagged
// inline rather than filed in an appendix.
//
// The written verdict makes the distinction the RM has to be able to repeat to a pleased
// merchant: redemption rate measures popularity, not incremental trade.
// ---------------------------------------------------------------------------------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function RMCampaignDetail() {
  const { campaignId } = useParams();
  const { data } = useDemoData();
  const m = useMobiusState();
  if (!m) return null;
  const { state, display, reachOf } = m;
  const c = state.campaigns[campaignId];
  if (!c) return <NotFound id={campaignId} />;

  const profile = merchantById(data.merchantProfiles, c.merchant_id);
  const rel = profile?.relationship ?? null;
  const r = c.results ?? {};
  const measured = Boolean(c.measured && r.cost);
  const rationale = data.rationales?.[c.campaign_id ?? c.id] ?? null;
  const live = c.status === "active";
  // A campaign configured and sent in this session has counters of its own whatever the ladder
  // says. Capping it — the reach cap or the redemption limit firing — freezes the results but does
  // not make them disappear, and a redemption honoured after the freeze is counted apart rather
  // than dropped. Both have to be on this screen or the freeze reads as data loss.
  const hasLiveCounters = c.source === "live" || c.pushes.length > 0;
  const cfg = c.configuration ?? {};
  // Edits away from the Mobius draft: a campaign configured here carries them on the change log;
  // one the pipeline shipped carries them on the configuration. Both are the same claim.
  const liveEdits = (c.changes ?? []).filter((ch) => ch.by !== "mobius");
  const shippedEdits = cfg.changes_from_recommendation ?? [];

  return (
    <PushTriggerProvider>
    <div className="max-w-container mx-auto px-6 py-8">
      <Link to="/rm" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink mb-3">
        <ArrowLeft size={13} /> Back to the portfolio
      </Link>

      <SectionTitle
        eyebrow={`Screen 4 · ${live ? "Ongoing" : "Completed"} programme`}
        title={c.name}
        subtitle={`${c.merchant_name}${c.window ? ` · ${c.window.start} to ${c.window.end}` : ""}`}
        right={
          <div className="flex items-center gap-2">
            <StatusPill statusKey={c.status} display={display} note={c.capped?.why} />
            {live && <PushTrigger campaign={c} compact />}
          </div>
        }
      />

      {/* ------------------------------------------------------------------ 6.1 company + background */}
      <Card className="p-6 mb-5">
        <h2 className="text-[15px] font-bold text-ink mb-3">The business, and where the relationship stands</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Fact label="Sector" value={profile?.sector ?? "—"} />
          <Fact label="Owner" value={rel?.owner_name ?? "—"} sub={rel?.owner_role} />
          <Fact label="Years with OCBC" value={rel?.years_with_ocbc ?? "—"} />
          <Fact label="Last contact" value={rel?.last_contact_date ?? "—"} sub={rel?.last_contact_date ? `${daysBetween(rel.last_contact_date, state.clock)} days ago` : null} />
          <Fact label="Average ticket" value={sgd(profile?.trading_summary?.avg_ticket_sgd, 2)} sub={`trough ${profile?.trading_pattern?.trough?.window ?? "none detected"}`} />
        </div>
        <BasisNote>merchant_profiles.json relationship and trading_summary — the context the merchant's own dashboard does not carry.</BasisNote>
      </Card>

      {/* ------------------------------------------------------------------ 6.2 statistics */}
      <Card className="p-6 mb-5">
        <h2 className="text-[15px] font-bold text-ink mb-1">Campaign statistics</h2>
        <p className="text-[12.5px] text-ink-secondary mb-4">
          The same figures the merchant sees on its own dashboard, measured against a held-out control group from the same segment — never against the
          merchant's own pre-campaign trade.
        </p>

        {live || hasLiveCounters ? (
          <>
            {c.frozen && (
              <div className="mb-3 rounded-lg border border-border bg-canvas/60 px-4 py-3">
                <p className="text-[12.5px] text-ink-secondary">
                  <span className="font-semibold text-ink">Results frozen — {c.frozen.why}, {fmtAt(c.frozen.at)}. </span>
                  The figures below are the ones at the freeze. Cards already in a cardholder's feed stay valid until they expire: a reward somebody is
                  holding is never revoked, so redemptions can still arrive, and they are counted here rather than folded into frozen results.
                  {c.post_freeze.redemptions > 0 && (
                    <> <span className="font-num font-semibold text-ink tabular-nums">{num(c.post_freeze.redemptions)}</span> redemption
                    {c.post_freeze.redemptions === 1 ? " has" : "s have"} arrived since the freeze.</>
                  )}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Figure label="Cardholders reached" value={num(reachOf(c) ?? c.counters.feed_delivered)} />
              <Figure label="Pushes sent" value={num(c.counters.pushes_sent)} />
              <Figure label="Pushes suppressed by the cap" value={num(c.counters.pushes_suppressed)} tone="warning" />
              <Figure label="Redemptions" value={num(c.counters.redemptions + c.post_freeze.redemptions)} />
            </div>
            <p className="text-[12.5px] text-ink-secondary mt-3">
              Incremental sales, net contribution and the redeemer profile are not shown {c.frozen ? "for this campaign" : "while the campaign is running"}:
              they need the control comparison, which is measured once the window has closed and the control arm has been observed over the same period
              {c.frozen ? ` — this one froze on ${String(c.frozen.at).slice(0, 10)}, before its window ended` : ""}. A redemption count on its own is
              popularity, not incremental trade, and showing it as a result would teach exactly the wrong lesson.
            </p>
            {c.pushes.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-border"><Th>Send</Th><Th>By</Th><Th align="right">Delivered</Th><Th align="right">Pushed</Th><Th align="right">Suppressed</Th><Th>Reconciles</Th></tr></thead>
                  <tbody>
                    {c.pushes.map((p, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <Td className="font-num tabular-nums text-ink-secondary">{fmtAt(p.at)}</Td>
                        <Td>{p.by}</Td>
                        <Td align="right">{num(p.delivered)}</Td>
                        <Td align="right">{num(p.sent)}</Td>
                        <Td align="right" className="font-bold text-warning">{num(p.suppressed)}</Td>
                        <Td>{p.reconciles ? <Badge tone="success">delivered = sent + suppressed</Badge> : <Badge tone="warning">does not reconcile</Badge>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : measured ? (
          <MeasuredResults campaign={c} results={r} />
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-canvas/50 px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              <Figure label="Cardholders reached" value={num(r.reach ?? c.counters.feed_delivered)} />
              <Figure label="Redemptions" value={num(r.redemptions ?? c.counters.redemptions)} />
              <Figure label="Pushed" value={num(r.pushed ?? c.counters.pushes_sent)} />
            </div>
            <p className="text-[12.5px] text-ink-secondary">
              <span className="font-semibold text-ink">Not measured. </span>{r.note ?? "No transaction-level acquiring data is loaded for this merchant in the demo, so incremental sales and net contribution are not computed."}
              {" "}Dashes, not estimates: a net contribution figure with no control arm behind it is a guess wearing a decimal point.
            </p>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------------ 6.3 configuration as set */}
      <Card className="p-6 mb-5">
        <h2 className="text-[15px] font-bold text-ink mb-1">The configuration as set</h2>
        <p className="text-[12.5px] text-ink-secondary mb-3">
          What was agreed, and where it moved away from the Mobius draft. When a campaign underperforms, the explanation is usually on this list.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ConfigItem label="Reward" value={cfg.offer_headline ?? cfg.reward_type ?? "—"} />
          <ConfigItem label="Window" value={cfg.days_of_week ? `${cfg.days_of_week.map((d) => WEEKDAYS[d]).join("/")} ${fmtHours(cfg.hours)}` : "—"} />
          <ConfigItem label="Outlets" value={`${(cfg.outlets ?? []).length} included`} />
          <ConfigItem label="Channel" value={`Feed${cfg.channel?.push_granted || cfg.push_granted ? " + push" : ", no push"}`} />
          <ConfigItem label="Target" value={cfg.new_or_returning ?? (cfg.target_segments ?? []).join(", ") ?? "—"} />
          <ConfigItem label="Redemption limit" value={cfg.redemption_limit == null ? "none" : num(cfg.redemption_limit)} />
          <ConfigItem label="Per customer" value={PER_CUSTOMER_LIMITS[cfg.per_customer_limit]?.label ?? String(cfg.per_customer_limit ?? "—").replace(/_/g, " ")} />
          <ConfigItem label="Maximum cost — the merchant's whole cost" value={cfg.max_cost_sgd != null ? sgd(cfg.max_cost_sgd) : (cfg.redemption_limit && cfg.max_reward_value_sgd ? sgd(cfg.redemption_limit * cfg.max_reward_value_sgd) : "—")} />
        </div>

        {(liveEdits.length > 0 || shippedEdits.length > 0) ? (
          <div className="mt-4 rounded-lg border border-warning/40 bg-warning-bg/40 px-4 py-3">
            <div className="text-[12.5px] font-semibold text-ink mb-2">Changed from the Mobius draft — attributed and timestamped</div>
            <ul className="space-y-1.5">
              {shippedEdits.map((ch, i) => (
                <li key={`s${i}`} className="text-[12.5px] text-ink-secondary">
                  <span className="font-medium text-ink">{String(ch.field).replace(/_/g, " ")}: </span>{String(ch.from)} <span className="text-ink-light">→</span> {String(ch.to)}
                  <span className="text-ink-light"> · by {ch.by}{ch.at ? ` · ${String(ch.at).slice(0, 10)}` : ""}</span>
                  {ch.note && <div className="text-[11.5px] text-ink-light">{ch.note}</div>}
                </li>
              ))}
              {liveEdits.map((ch, i) => (
                <li key={`l${i}`} className="text-[12.5px] text-ink-secondary">
                  <span className="font-medium text-ink">{String(ch.field).replace(/_/g, " ")}: </span>{fmtVal(ch.from)} <span className="text-ink-light">→</span> {fmtVal(ch.to)}
                  <span className="text-ink-light"> · by {ch.by} · {fmtAt(ch.at)}</span>
                  {ch.note && <div className="text-[11.5px] text-ink-light">{ch.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-secondary mt-3">
            Nothing was changed from the Mobius draft — so if this campaign underperformed, the recommendation owns the result, not the RM.
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------------------ 6.4 the verdict */}
      {(r.verdict || rationale?.verdict) && (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            {r.cost?.net_sign === "negative" ? <XCircle size={20} className="text-warning shrink-0 mt-0.5" /> : <CheckCircle2 size={20} className="text-success shrink-0 mt-0.5" />}
            <div>
              <h2 className="text-[15px] font-bold text-ink mb-1">The verdict, in words you can repeat to the owner</h2>
              <p className="text-[13px] text-ink-secondary">{r.verdict}</p>
              {rationale?.verdict && rationale.verdict !== r.verdict && (
                <p className="text-[12.5px] text-ink-light mt-1"><Sparkles size={11} className="inline text-analytics mr-1" />{rationale.verdict}</p>
              )}
              {r.cost?.net_sign === "negative" && (
                <div className="mt-3 rounded-lg border border-border bg-canvas/50 px-3 py-2.5">
                  <p className="text-[12.5px] text-ink-secondary">
                    <span className="font-semibold text-ink">The distinction to make on the call: </span>
                    a merchant pleased with a {pctOf(r.redemption?.redemption_rate_pct, 1)} redemption rate is reading popularity, not incremental trade. The
                    control group — who never saw the offer — converted at {pctOf(r.conversion?.control_rate_pct, 1)} against the treated group's{" "}
                    {pctOf(r.conversion?.treated_rate_pct, 1)}. The reward was claimed enthusiastically by people who were coming anyway.
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
    </PushTriggerProvider>
  );
}

function MeasuredResults({ campaign, results: c }) {
  const cleared = c.cost.net_sign === "positive";
  const chart = [
    { group: "Treated (got the offer)", rate: c.conversion.treated_rate_pct },
    { group: "Control (held out)", rate: c.conversion.control_rate_pct },
  ];
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chart} margin={{ left: -10 }}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="group" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={46} />
              <Tooltip formatter={(v) => pctOf(v, 1)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }} />
              <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={64}>
                <Cell fill="#ED1C24" /><Cell fill="#94A3B8" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <BasisNote>
            {num(c.cohort.treated)} treated vs. {num(c.cohort.control)} held-out control ({c.cohort.basis}). {c.conversion.definition}. Lift{" "}
            {c.conversion.lift_points} points.
          </BasisNote>
        </div>
        <div className="space-y-2.5">
          <Line label="Redemptions" value={`${num(c.redemption.redeemers)} cardholders, ${num(c.redemption.redeemed_transactions)} transactions (${pctOf(c.redemption.redemption_rate_pct, 1)} of treated)`} />
          <Line label="Average redeemed ticket" value={sgd(c.redemption.avg_ticket_sgd, 2)} />
          <Line label="Incremental sales vs. scaled control" value={sgd(c.incremental.incremental_sales_sgd)} tone={cleared ? "success" : "warning"} />
          <Line label={`Reward cost — the merchant's whole cost`} value={sgd(c.cost.reward_cost_sgd)} />
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Net contribution</span>
            <span className={`font-num text-[20px] font-bold tabular-nums ${cleared ? "text-success" : "text-brand"}`}>{sgd(c.cost.net_contribution_sgd)}</span>
          </div>
          <BasisNote>
            Net = incremental sales × {pctOf(c.cost.gross_margin_assumed * 100)} assumed gross margin − reward cost.
            {c.cost.gross_margin_provisional && <span className="ml-1 rounded bg-canvas border border-border px-1 py-0.5 text-ink-secondary">margin provisional</span>} {c.cost.basis}
          </BasisNote>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t border-border">
        <div>
          <h3 className="text-[14px] font-bold text-ink mb-2">Who redeemed</h3>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <Figure label="New to the business" value={num(c.redeemer_profile.new_to_business)} />
            <Figure label="Already returning" value={num(c.redeemer_profile.returning)} />
          </div>
          <p className="text-[11.5px] text-ink-light mb-3">{c.redeemer_profile.new_vs_returning_basis}</p>
          <Composition title="Age bands" composition={c.redeemer_profile.age_bands} />
          <Composition title="RFM segment at redemption" composition={c.redeemer_profile.rfm_at_redemption} />
        </div>
        <div>
          <h3 className="text-[14px] font-bold text-ink mb-2">Did they come back</h3>
          <div className="space-y-2.5">
            <Line label="Returned within 30 days" value={`${num(c.repeat.returned_within_30d)} of ${num(c.redemption.redeemers)} (${pctOf(c.repeat.return_rate_pct, 1)})`} />
            <Line label="Control group, same measure" value={c.repeat.control_return_rate_pct === null ? "—" : `${num(c.repeat.control_returned)} (${pctOf(c.repeat.control_return_rate_pct, 1)})`} />
            <Line label="Further visits: 1 / 2 / 3+" value={`${num(c.repeat.further_visits_distribution["1"])} / ${num(c.repeat.further_visits_distribution["2"])} / ${num(c.repeat.further_visits_distribution["3+"])}`} />
          </div>
          <BasisNote>{c.repeat.basis}</BasisNote>
          <div className="mt-4 rounded-lg border border-border bg-canvas/50 px-3 py-2.5 flex items-start gap-2">
            <ShieldCheck size={14} className="text-ink-light shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-ink-secondary">{c.floor_policy.note}</p>
          </div>
        </div>
      </div>
    </>
  );
}

function Composition({ title, composition }) {
  if (!composition) return null;
  const entries = Object.entries(composition.cells);
  return (
    <div className="mb-3 rounded-lg border border-border bg-white p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12.5px] font-semibold text-ink">{title}</span>
        {composition.all_suppressed && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-light"><Lock size={11} /> Withheld</span>
        )}
      </div>
      <ul className="space-y-1 mb-2">
        {entries.map(([label, cell]) => (
          <li key={label} className="flex items-center justify-between text-[12.5px]">
            <span className="text-ink-secondary">{label}</span>
            <span className={`font-num tabular-nums ${cellCount(cell) === null ? "text-ink-light italic text-[11.5px]" : "text-ink font-semibold"}`}>{cellText(cell)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] text-ink-light leading-snug">{composition.note}</p>
    </div>
  );
}

function Fact({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-border bg-canvas/50 px-3 py-2.5">
      <div className="text-[11px] text-ink-secondary">{label}</div>
      <div className="font-num text-[15px] font-bold text-ink tabular-nums leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-ink-light mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

function Figure({ label, value, tone = "default" }) {
  const toneClass = { default: "text-ink", warning: "text-warning" }[tone];
  return (
    <div className="rounded-lg border border-border bg-canvas/50 px-3 py-2.5">
      <div className={`font-num text-[22px] font-bold leading-none tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[11.5px] text-ink-secondary mt-1.5 leading-snug">{label}</div>
    </div>
  );
}

function ConfigItem({ label, value }) {
  return (
    <div className="rounded-lg bg-canvas border border-border px-3 py-2">
      <div className="text-[11px] text-ink-secondary">{label}</div>
      <div className="text-[12.5px] font-medium text-ink leading-snug">{value}</div>
    </div>
  );
}

function Line({ label, value, tone = "default" }) {
  const toneClass = { success: "text-success", warning: "text-warning", default: "text-ink" }[tone];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-ink-secondary">{label}</span>
      <span className={`font-num text-[13px] font-semibold text-right tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

function NotFound({ id }) {
  return (
    <div className="max-w-container mx-auto px-6 py-16 text-center">
      <p className="text-[14px] font-semibold text-ink">No campaign with the id {id}.</p>
      <Link to="/rm" className="text-[13px] font-medium text-brand hover:underline">Back to the portfolio</Link>
    </div>
  );
}

const fmtHours = (h) => (h && h.length === 2 ? `${String(h[0]).padStart(2, "0")}:00–${String(h[1]).padStart(2, "0")}:00` : "—");
const fmtAt = (at) => (at ? new Date(at).toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtVal = (v) => (v === null || v === undefined ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
