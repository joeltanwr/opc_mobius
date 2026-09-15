import React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, ShieldCheck, ShieldX, Ban, Sparkles, Clock3, AlertTriangle } from "lucide-react";
import { useDemoData, merchantById, categoryFor } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { sgd, num, pct, pctOf, cellText, cellCount } from "../../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../../components/ui";
import { PriorityCell, priorityReading, daysBetween, daysWaiting, isOverdue, CONTACT_PROMISE_DAYS, Th, Td } from "./rmCommon";

// ---------------------------------------------------------------------------------------------
// RM screen 2 — the pending programme (RM §4).
//
// The brief the RM reads before picking up the phone, in the order they will talk through it with
// the owner. A reading screen, not a working one: everything is read-only except the single
// action at the end, and that action is labelled as something done with the owner rather than to
// them.
//
// A merchant that fails the eligibility gate shows the failing state and no recommendation at
// all. The gate is only credible if it can be seen to bite, so that branch is built rather than
// described.
// ---------------------------------------------------------------------------------------------

export default function PendingProgramme() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { data } = useDemoData();
  const m = useMobiusState();
  if (!m) return null;
  const { state, dispatch, display } = m;
  const c = state.campaigns[campaignId];
  if (!c) return <NotFound id={campaignId} />;

  const profile = merchantById(data.merchantProfiles, c.merchant_id);
  const priority = data.merchantPriority?.[c.merchant_id] ?? null;
  const recs = data.rewardRecommendations?.[c.merchant_id] ?? null;
  const elig = c.eligibility ?? recs?.eligibility ?? null;
  const gap = (data.demandGaps ?? []).find((g) => g.merchant_id === c.merchant_id) ?? null;
  const rationale = data.rationales?.[c.merchant_id] ?? null;
  const waiting = daysWaiting(c.applied_at, state.clock);
  const eligible = elig?.passed === true;
  const rel = profile?.relationship ?? null;
  const category = categoryFor(data.taxonomy, profile?.category);

  return (
    <div className="max-w-container mx-auto px-6 py-8">
      <Link to="/rm" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink mb-3">
        <ArrowLeft size={13} /> Back to the portfolio
      </Link>

      <SectionTitle
        eyebrow="Screen 2 · Pending programme"
        title={c.merchant_name}
        subtitle="Your brief before the call. Read top to bottom — it is the order you will talk through it with the owner."
        right={
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone="warning">{display(c.status)}</Badge>
            <span className={`inline-flex items-center gap-1 font-num text-[12.5px] tabular-nums ${isOverdue(waiting) ? "font-bold text-warning" : "text-ink-secondary"}`}>
              {isOverdue(waiting) ? <AlertTriangle size={12} /> : <Clock3 size={12} />}
              waiting {waiting === null ? "—" : `${waiting} days`}
            </span>
          </div>
        }
      />

      {isOverdue(waiting) && (
        <div className="rounded-xl border border-warning/50 bg-warning-bg/50 px-4 py-2.5 mb-5 text-[12.5px] text-ink-secondary">
          <span className="font-semibold text-ink">Past the week promised.</span> {c.rm_message ?? "A relationship manager will be in touch within the week."}{" "}
          That was {waiting} days ago, and {CONTACT_PROMISE_DAYS} days is the promise the merchant was given when they applied.
        </div>
      )}

      {/* ------------------------------------------------------------------ 4.1 the business */}
      <Card className="p-6 mb-5">
        <h2 className="text-[15px] font-bold text-ink mb-3">The business</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Fact label="Sector" value={category?.label ?? profile?.sector ?? c.results?.sector ?? "—"} />
          <Fact label="Outlets" value={num(profile?.outlets?.length)} sub={(profile?.outlets ?? []).map((o) => o.name).join(", ")} />
          <Fact label="Years with OCBC" value={rel?.years_with_ocbc == null ? "—" : `${rel.years_with_ocbc}`} sub={rel?.relationship_start_date ? `since ${rel.relationship_start_date}` : null} />
          <Fact label="Last contact" value={rel?.last_contact_date ?? "—"} sub={rel?.last_contact_date ? `${daysBetween(rel.last_contact_date, state.clock)} days ago` : null} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <Fact label="Who you are calling" value={rel?.owner_name ?? "—"} sub={rel?.owner_role ?? null} />
          <Fact label="Products held" value={num(rel?.products_held?.length)} sub={(rel?.products_held ?? []).join(" · ")} />
        </div>

        <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold text-ink mb-1.5">Relationship-value score — why this one is where it is in your list</div>
            <PriorityCell priority={priority} />
          </div>
          <p className="text-[12px] text-ink-secondary max-w-md leading-snug">{priorityReading(priority) ?? priority?.rm_text}</p>
        </div>
        <BasisNote>
          merchant_profiles.json relationship block; merchant_priority.json score and components. The score ranks your caseload and is never shown to the
          merchant. Flags on it: {(priority?.flags ?? []).join(", ") || "none"}.
        </BasisNote>
      </Card>

      {/* ------------------------------------------------------------------ 4.2 eligibility */}
      <Card className={`p-6 mb-5 ${eligible ? "" : "border-warning/50"}`}>
        <div className="flex items-start gap-3">
          {eligible ? <ShieldCheck size={20} className="text-success shrink-0 mt-0.5" /> : <ShieldX size={20} className="text-warning shrink-0 mt-0.5" />}
          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-ink">
              {eligible ? "Eligible for the reward programme" : "Not eligible for the reward programme"}
            </h2>
            <p className="text-[12.5px] text-ink-secondary mt-0.5">
              Both conditions are checked before any recommendation is generated: average balance above {sgd(elig?.balance_threshold_sgd)} over the trailing{" "}
              {elig?.balance_months} months, and the internal <span className="italic">or</span> external transaction score at band {elig?.max_band} or better.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <GateCell
            label={`Average balance, ${elig?.balance_months} months`}
            value={sgd(elig?.avg_balance_6m_sgd)}
            passed={elig ? elig.avg_balance_6m_sgd > elig.balance_threshold_sgd : null}
            detail={`threshold ${sgd(elig?.balance_threshold_sgd)}, strictly above`}
          />
          <GateCell
            label="Internal transaction score"
            value={elig?.internal_score_band == null ? "not held" : `Band ${elig.internal_score_band}`}
            passed={elig?.internal_score_band == null ? null : elig.internal_score_band <= elig.max_band}
            detail={(elig?.cleared_by ?? []).includes("internal") ? "cleared the gate" : "did not clear on its own"}
          />
          <GateCell
            label="External transaction score"
            value={elig?.external_score_band == null ? "not held" : `Band ${elig.external_score_band}`}
            passed={elig?.external_score_band == null ? null : elig.external_score_band <= elig.max_band}
            detail={(elig?.cleared_by ?? []).includes("external") ? "cleared the gate" : "did not clear on its own"}
          />
        </div>

        {!eligible && (
          <div className="mt-4 rounded-lg border border-warning/50 bg-warning-bg/50 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink">{elig?.message ?? "You are not eligible for the reward programme."}</p>
            <ul className="mt-1.5 ml-4 list-disc space-y-1 text-[12.5px] text-ink-secondary marker:text-warning">
              {(elig?.reasons ?? []).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <p className="text-[12.5px] text-ink-secondary mt-2">
              No recommendation is generated for this merchant, and nothing below this line is shown — the gate runs before the analysis, not after it.
              The conversation to have is about the condition that failed, not about a reward.
            </p>
          </div>
        )}
        <BasisNote>
          Lower band is better (PD-band convention), which is assumed and not independently confirmed for this scoring convention — flagged on the record as{" "}
          {(elig?.flags ?? []).join(", ") || "no flags"}. Only one of the two scores needs to clear.
        </BasisNote>
      </Card>

      {!eligible ? (
        <Card className="p-6 border-dashed">
          <div className="flex items-center gap-2 text-ink-light">
            <Ban size={16} />
            <p className="text-[13px]">
              Transaction background, customer analysis and reward options are not shown for a merchant that fails the gate. Generating them would imply an
              offer that cannot be made.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* ------------------------------------------------------------------ 4.3 transaction background */}
          <Card className="p-6 mb-5">
            <h2 className="text-[15px] font-bold text-ink mb-1">Transaction background</h2>
            <p className="text-[12.5px] text-ink-secondary mb-3">Enough to speak to it on the phone — the full profile is the merchant's own page.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Fact label="Monthly transactions" value={num(profile?.trading_summary?.avg_monthly_txns_6m)} sub={`trailing 6 months, ${profile?.trading_summary?.trailing_window}`} />
              <Fact label="Volume trend" value={trendLabel(profile?.trading_summary?.volume_trend)} sub={profile?.trading_summary?.volume_trend?.basis} />
              <Fact label="Average ticket" value={sgd(profile?.trading_summary?.avg_ticket_sgd, 2)} />
              <Fact label="Repeat customers" value={pctOf(profile?.rfv?.one_time_vs_repeat?.repeat_customer_share_pct, 1)} sub={`${pctOf(profile?.rfv?.one_time_vs_repeat?.repeat_txn_share_pct, 1)} of transactions`} />
            </div>
            <div className="mt-3 rounded-lg border border-border bg-canvas/50 px-4 py-3">
              <div className="text-[12px] font-semibold text-ink mb-1">Hourly pattern</div>
              {profile?.trading_pattern?.trough?.window ? (
                <p className="text-[12.5px] text-ink-secondary">
                  The trough is <span className="font-semibold text-ink">{profile.trading_pattern.trough.window}</span> — running{" "}
                  <span className="font-num font-semibold text-ink">{pctOf(Math.abs(profile.trading_pattern.trough.magnitude_vs_own_baseline_pct), 1)}</span> below
                  this merchant's own baseline for that time of day, {profile.trading_pattern.trough.confidence} confidence. That window is what a campaign fills.
                </p>
              ) : (
                <p className="text-[12.5px] text-ink-secondary">
                  No trough of its own was detected: {gap?.message ?? "the detector found no slot below this merchant's own baseline."} A campaign here has no
                  obvious hole to fill, which is worth saying on the call rather than working around.
                </p>
              )}
              {rationale?.demand_gap && (
                <p className="text-[12.5px] text-ink mt-2 pt-2 border-t border-border">
                  <Sparkles size={11} className="inline text-analytics mr-1" />
                  {rationale.demand_gap}
                </p>
              )}
            </div>
            <BasisNote>merchant_profiles.json trading_summary, rfv and trading_pattern; demand_gaps.json for the detector's own verdict ({gap?.type}, {gap?.confidence} confidence).</BasisNote>
          </Card>

          {/* ------------------------------------------------------------------ 4.4 sme-business-customer-analysis */}
          <Card className="p-6 mb-5">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-[15px] font-bold text-ink">Customer analysis</h2>
              <Badge tone="analytics">/sme-business-customer-analysis</Badge>
            </div>
            <p className="text-[12.5px] text-ink-secondary mb-3">
              {profile?.gate?.passed
                ? `Full output: ${num(profile.gate.ocbc_txn_count)} OCBC-card transactions against a ${num(profile.gate.threshold)} threshold.`
                : `Gated output: ${num(profile?.gate?.ocbc_txn_count)} OCBC-card transactions against a ${num(profile?.gate?.threshold)} threshold, so the demand-gap detector runs and the customer profile does not.`}
            </p>

            {!profile?.gate?.passed ? (
              <div className="rounded-lg border border-warning/40 bg-warning-bg/40 px-4 py-3">
                <p className="text-[12.5px] text-ink-secondary">
                  <span className="font-semibold text-ink">Too thin for a customer profile. </span>
                  {profile?.gate?.message} The gap detector's own output still stands: {gap?.message}
                </p>
                <p className="text-[12.5px] text-ink-secondary mt-2">
                  <span className="font-semibold text-ink">What would lift it: </span>
                  {num((profile?.gate?.threshold ?? 0) - (profile?.gate?.ocbc_txn_count ?? 0))} more OCBC-card transactions at this merchant. Moving acquiring to
                  OCBC gets there fastest, which is a conversation worth having on this call.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <AnalysisBlock title="Customer profile">
                  {profile.customer_profile ? (
                    <>
                      <ul className="space-y-1">
                        {profile.customer_profile.all_customers.top_categories.slice(0, 4).map((t) => (
                          <li key={t.category} className="flex justify-between text-[12.5px]">
                            <span className="text-ink-secondary">{t.label}</span>
                            <span className="font-num font-semibold text-ink tabular-nums">{pctOf(t.share_pct, 1)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11.5px] text-ink-light mt-2">
                        Top 20% by spend visit every {num(profile.customer_profile.differences?.visit_interval_days_top20, 1)} days against{" "}
                        {num(profile.customer_profile.differences?.visit_interval_days_all, 1)} for everyone, and bring{" "}
                        {pctOf(profile.customer_profile.differences?.top20_revenue_share_pct, 1)} of revenue.
                      </p>
                    </>
                  ) : (
                    <p className="text-[12.5px] text-ink-light">
                      Not computed for this merchant in the demo dataset — the category breakdown needs resolvable OCBC card spend elsewhere, which this
                      merchant's sample does not carry.
                    </p>
                  )}
                </AnalysisBlock>

                <AnalysisBlock title="Demand gap">
                  <p className="text-[12.5px] text-ink-secondary">{gap?.message}</p>
                  <p className="text-[11.5px] text-ink-light mt-1.5">
                    Type {gap?.type?.replace(/_/g, " ")} · {gap?.confidence} confidence · {gap?.peers_used ? `${gap.peers_used} peers, ${gap.peer_basis}` : "own baseline only"}.
                    A negative finding is a finding and is reported as one.
                  </p>
                </AnalysisBlock>

                <AnalysisBlock title="RFM segmentation">
                  <ul className="space-y-1">
                    {Object.entries(profile.rfm?.segments ?? {}).map(([name, cell]) => (
                      <li key={name} className="flex justify-between text-[12.5px]">
                        <span className="text-ink-secondary">{name}</span>
                        <span className={`font-num tabular-nums ${cellCount(cell) === null ? "text-ink-light italic text-[11.5px]" : "font-semibold text-ink"}`}>{cellText(cell)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11.5px] text-ink-light mt-2">
                    Lapsed total {cellText(profile.rfm?.lapsed_total)} — {profile.rfm?.lapsed_definition}. That is the pool a win-back reward draws from.
                  </p>
                </AnalysisBlock>
              </div>
            )}
            {rationale?.rfm && (
              <p className="text-[12.5px] text-ink mt-3 pt-3 border-t border-border">
                <Sparkles size={11} className="inline text-analytics mr-1" />
                {rationale.rfm}
              </p>
            )}
            <BasisNote>
              Every figure here is the deterministic output in merchant_profiles.json. The single generated sentence sits beside the numbers that produced it;
              where no narrative has been generated for a merchant, the numbers stand alone rather than being described by an invented one.
            </BasisNote>
          </Card>

          {/* ------------------------------------------------------------------ 4.5 reward-programme-recommendation */}
          <Card className="p-6 mb-5">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-[15px] font-bold text-ink">Reward options, ranked</h2>
              <Badge tone="analytics">/reward-programme-recommendation</Badge>
            </div>
            <p className="text-[12.5px] text-ink-secondary mb-3">
              All six types, always ranked, rejected ones shown with the reason rather than filtered out — so the runner-up can be seen and overridden on the
              call. Ranked by expected incremental value, never by size of discount.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-border">
                  <Th>Rank</Th><Th>Reward</Th><Th>Target segment</Th><Th align="right">Score</Th><Th align="right">Incremental share</Th><Th>Reasoning</Th>
                </tr></thead>
                <tbody>
                  {(recs?.ranked ?? []).map((r) => (
                    <tr key={r.type} className={`border-b border-border/60 ${r.disabled ? "bg-canvas/60" : ""}`}>
                      <Td className="font-num tabular-nums text-ink-light">{r.rank}</Td>
                      <Td>
                        <span className={`font-semibold ${r.disabled ? "text-ink-light" : "text-ink"}`}>{r.label}</span>
                        {r.disabled && <Badge tone="neutral" className="ml-2"><Ban size={10} /> ranked and rejected</Badge>}
                        {!r.disabled && <Badge tone={r.new_or_returning === "New customer" ? "success" : "info"} className="ml-2">{r.new_or_returning}</Badge>}
                      </Td>
                      <Td className="text-ink-secondary">
                        {r.target_pool === "non_customers"
                          ? `Non-customers — ${cellText(r.non_customer_reach)} from the lookalike pool`
                          : (r.target_segments ?? []).map((t) => `${t.segment} ${cellText(t.reach)}`).join(", ") || "—"}
                      </Td>
                      <Td align="right">{num(r.score)}</Td>
                      <Td align="right">
                        {r.disabled ? "—" : <>{pct(r.expected_incremental_share, 0)}{r.incremental_share_provisional && <span className="ml-1 text-[10.5px] text-ink-secondary">prov.</span>}</>}
                      </Td>
                      <Td className="text-ink-secondary max-w-sm">{r.disabled ? r.rejected_reason : r.reason}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rationale?.reward_options && (
              <p className="text-[12.5px] text-ink mt-3">
                <Sparkles size={11} className="inline text-analytics mr-1" />
                {rationale.reward_options}
              </p>
            )}
            <BasisNote>reward_recommendations.json for {c.merchant_id}, gap type {recs?.gap_type?.replace(/_/g, " ")}. Reach figures carry the floor and the rounding.</BasisNote>
          </Card>

          {/* ------------------------------------------------------------------ 4.6 the one action */}
          <Card className="p-6 border-ink/20">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-xl">
                <h2 className="text-[15px] font-bold text-ink flex items-center gap-2"><Phone size={15} className="text-brand" /> Configure this together with {rel?.owner_name ?? "the owner"}</h2>
                <p className="text-[12.5px] text-ink-secondary mt-1">
                  Configuration is a joint conversation, not a form you fill in afterwards. Opening it moves the programme to{" "}
                  <span className="font-medium text-ink">{display("draft")}</span> and the merchant can see it from their side from that moment. Nothing is sent
                  to any cardholder by this, or by anything on the next screen.
                </p>
              </div>
              <button
                onClick={() => { dispatch({ type: "ADVANCE", campaign_id: c.id, to: "draft", by: "rm", note: "RM opened configuration with the owner" }); navigate(`/rm/configure/${c.id}`); }}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover"
              >
                <Phone size={15} /> Start configuring with the owner
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// "falling +%" is what a null change_pct renders as if the sign is glued on unconditionally. A
// direction with no measured change is reported as the direction alone.
function trendLabel(trend) {
  if (!trend?.direction) return "—";
  const p = trend.change_pct;
  if (p === null || p === undefined || Number.isNaN(p)) return `${trend.direction} · change not measured`;
  return `${trend.direction} ${p >= 0 ? "+" : ""}${p}%`;
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

function GateCell({ label, value, passed, detail }) {
  const tone = passed === null ? "border-border bg-canvas/50" : passed ? "border-success/40 bg-success-bg/40" : "border-warning/50 bg-warning-bg/40";
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tone}`}>
      <div className="text-[11px] text-ink-secondary">{label}</div>
      <div className="font-num text-[17px] font-bold text-ink tabular-nums leading-tight mt-0.5">{value}</div>
      <div className="text-[11px] text-ink-secondary mt-0.5">
        {passed === null ? "not held" : passed ? "clears" : "does not clear"} · {detail}
      </div>
    </div>
  );
}

function AnalysisBlock({ title, children }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3.5">
      <div className="text-[12.5px] font-bold text-ink mb-2">{title}</div>
      {children}
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
