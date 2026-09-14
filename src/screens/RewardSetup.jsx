import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Lock, RotateCcw, AlertTriangle, Send, Sparkles, Ban } from "lucide-react";
import { useDemoData, merchantById } from "../data/DataProvider";
import { useMobiusState } from "../state/StateProvider";
import { FIELD_OWNERS, REQUIRED_TO_SUBMIT, PER_CUSTOMER_OPTIONS, PER_CUSTOMER_LIMITS } from "../state/store.js";
import { expectedOutcome, windowLoad } from "../state/expected.js";
import { CONSTANTS, screenNum } from "../data/constants";
import { sgd, num, pct, pctOf, cellText } from "../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../components/ui";

// Merchant view Tab 4 — the joint reward set-up page (merchant prompt §7). The merchant and
// its OCBC relationship manager configure one campaign on one page and submit it. Everything
// on the page is read from, and written to, the shared state module; the only static reads are
// the merchant's own profile and the ranked rewards, both public/data.
//
// This is the approval artifact: the segment log and the change log are on the page, not
// behind a tab, because in six months someone will open it to ask why this campaign went out.

const DEMO_CAMPAIGN = "C-SJ-03";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LADDER = ["applied", "draft", "pending", "active"];
const HOURS = Array.from({ length: 17 }, (_, i) => 7 + i);

export default function RewardSetup() {
  const { data } = useDemoData();
  const m = useMobiusState();
  const [viewAs, setViewAs] = useState("merchant");
  const [request, setRequest] = useState("");
  if (!m) return null;
  const { state, dispatch, display } = m;
  const c = state.campaigns[DEMO_CAMPAIGN];
  const profile = merchantById(data.merchantProfiles, c.merchant_id);
  const ranked = data.rewardRecommendations[c.merchant_id]?.ranked ?? [];
  const cfg = c.configuration ?? {};
  const seg = c.segment;
  const editable = c.status === "draft" || (c.status === "pending" && viewAs === "ocbc");
  const can = (field) => editable && (FIELD_OWNERS[field] ?? []).includes(viewAs);
  const set = (field, value, note) => dispatch({ type: "CONFIGURE", campaign_id: c.id, field, value, by: viewAs, note });

  const engagement = { low: CONSTANTS.BASE_ENGAGEMENT_RATE, high: CONSTANTS.UPSIDE_ENGAGEMENT_RATE };
  const outcome = useMemo(() => expectedOutcome({ segment: seg, configuration: cfg, profile, ranked, engagement }), [seg, cfg, profile, ranked]);
  const load = useMemo(() => windowLoad(profile, cfg.days_of_week, cfg.hours), [profile, cfg.days_of_week, cfg.hours]);
  const troughLoad = useMemo(() => windowLoad(profile, c.prefill?.fields?.days_of_week, c.prefill?.fields?.hours), [profile, c.prefill]);
  const failedAtPeak = Object.values(state.campaigns).find((x) => x.merchant_id === c.merchant_id && x.measured && x.results?.cost?.net_sign === "negative") ?? null;
  const missing = REQUIRED_TO_SUBMIT.filter((f) => cfg[f] == null || (Array.isArray(cfg[f]) && cfg[f].length === 0) || cfg[f] === "");
  const lastRejection = [...state.ledger].reverse().find((e) => e.type === "REJECTED" && e.detail?.campaign_id === c.id);

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <Badge tone="neutral">Tab 4 · Reward set-up</Badge>
        <Badge tone="info">Joint page — merchant and OCBC relationship manager</Badge>
        <ViewAs value={viewAs} onChange={setViewAs} />
      </div>
      <SectionTitle
        eyebrow={`Screen ${screenNum("reward-setup")} · Reward set-up`}
        title={`${c.merchant_name} — ${c.name.split(" — ")[1] ?? "next campaign"}`}
        subtitle="One shared page, one reward, one segment that can only be narrowed. Every change is attributed and logged here, because this page is the approval artifact."
        right={<Ladder status={c.status} display={display} />}
      />

      {c.status === "applied" && (
        <Card className="p-5 mb-6 flex items-start gap-3 border-warning/40 bg-warning-bg/40">
          <ShieldCheck size={18} className="text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            {!c.applied_at ? (
              <>
                <p className="text-[13px] font-semibold text-ink">No application yet — this page has nothing to open.</p>
                <p className="text-[12.5px] text-ink-secondary mt-0.5">
                  Mobius has computed a recommendation for {c.merchant_name}, but a recommendation is not an application. The merchant applies on{" "}
                  <Link to="/target-customer" className="font-medium text-brand hover:underline">Tab 3</Link>; the RM then makes contact, and this page is
                  where the two of them work. That order is the product, so the button below stays out of reach until it has been followed.
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-ink">{display(c.status)} — waiting for the relationship manager to make contact.</p>
                <p className="text-[12.5px] text-ink-secondary mt-0.5">
                  The merchant applied on Tab 3 on {String(c.applied_at).slice(0, 10)}. Nothing is configured until the RM opens this page; opening it is what
                  moves the status to <span className="font-medium text-ink">{display("draft")}</span>.
                </p>
                {viewAs === "ocbc" ? (
                  <button onClick={() => dispatch({ type: "ADVANCE", campaign_id: c.id, to: "draft", by: "rm" })}
                          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-hover">
                    Open set-up as the relationship manager
                  </button>
                ) : (
                  <p className="text-[12px] text-ink-light mt-2">Switch to "View as OCBC staff" to open the set-up — the merchant cannot start it alone.</p>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {c.status !== "applied" && (
        <>
          {/* ------------------------------------------------------------------ 7.1 segment */}
          <Card className="p-6 mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-[15px] font-bold text-ink">Target segment — set by Mobius, narrowed by you</h3>
                <p className="text-[12.5px] text-ink-secondary mt-0.5 max-w-2xl">{seg.description}</p>
              </div>
              <div className="text-right">
                <div className="font-num text-[36px] font-extrabold text-brand leading-none">{num(seg.reach)}</div>
                <div className="text-[11px] text-ink-light mt-1">cardholders · rounded to {seg.rounding} · never below {seg.floor}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[12px] text-ink-secondary">Narrowed by:</span>
              {Object.keys(seg.constraints).length === 0 && <Badge tone="neutral">nothing — the segment Mobius proposed</Badge>}
              {Object.entries(seg.constraints).map(([k, v]) => (
                <Badge key={k} tone="brand">{k.replace("_", " ")}: {k === "outlet" ? seg.narrowing.dimensions.outlet.find((o) => o.id === v)?.name ?? v : v}</Badge>
              ))}
              <span className="ml-auto text-[12px] font-medium text-ink-secondary">
                Refinements used <span className="font-num text-ink">{seg.refinements_used}</span> of {seg.max_refinements}
              </span>
            </div>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => { e.preventDefault(); if (request.trim()) { dispatch({ type: "NARROW", campaign_id: c.id, request: request.trim(), by: viewAs }); setRequest(""); } }}
            >
              <input
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                disabled={!editable}
                placeholder='Narrow in plain language — "only the Tanjong Pagar outlet", "afternoon only", "25–34 only"'
                className="flex-1 min-w-[260px] rounded-lg border border-border px-3 py-2 text-[13px] text-ink placeholder:text-ink-light focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-canvas"
              />
              <button type="submit" disabled={!editable || !request.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
                <Sparkles size={14} /> Narrow
              </button>
              <button type="button" disabled={!editable || Object.keys(seg.constraints).length === 0}
                      onClick={() => dispatch({ type: "RESET_SEGMENT", campaign_id: c.id, by: viewAs })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-[13px] font-medium text-ink-secondary hover:text-ink disabled:opacity-40">
                <RotateCcw size={14} /> Reset to the AI segment
              </button>
            </form>
            <p className="text-[11.5px] text-ink-light mt-2">
              The agent narrows and does nothing else: it never widens, never describes a person, never returns a list, and refuses
              narrowing by nationality, race, religion, gender, marital status or health. Age band and location are ordinary
              commercial targeting. Below the {seg.floor} floor it refuses without giving a count — the count is the leak.
            </p>
            {seg.log.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="text-[12px] font-semibold text-ink mb-2">Narrowing log — who asked, what they asked, what the agent did</div>
                <ul className="space-y-2">
                  {seg.log.map((e, i) => (
                    <li key={i} className={`rounded-lg border px-3 py-2 text-[12.5px] ${e.outcome === "refused" ? "border-warning/40 bg-warning-bg/30" : "border-border bg-canvas/50"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={e.outcome === "applied" ? "success" : e.outcome === "reset" ? "neutral" : "warning"}>{e.outcome}</Badge>
                        <span className="font-medium text-ink">"{e.request}"</span>
                        <span className="text-ink-light">· {e.by} · {fmtAt(e.at)}{e.consumed_refinement ? " · counted" : ""}</span>
                      </div>
                      <p className="text-ink-secondary mt-1">{e.message}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <BasisNote>segments.json {seg.segment_id}: lift pair with {seg.candidate_name}; {seg.filters.evaluated} evaluated, reach floored and rounded in the pipeline. The agent's reach table ships only cells at or above the floor.</BasisNote>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            {/* ------------------------------------------------------------------ 7.2 reward */}
            <Card className="p-6">
              <h3 className="text-[15px] font-bold text-ink mb-1">One reward for this campaign</h3>
              <p className="text-[12.5px] text-ink-secondary mb-3">Ranked for the {data.rewardRecommendations[c.merchant_id]?.gap_type?.replace(/_/g, " ")} gap. The tag drives measurement, not just the label.</p>
              <div className="space-y-2">
                {ranked.map((r) => (
                  <label key={r.type} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${r.disabled ? "border-dashed bg-canvas/60 opacity-70" : cfg.reward_type === r.type ? "border-brand/40 ring-1 ring-brand/10" : "border-border"} ${can("reward_type") && !r.disabled ? "cursor-pointer" : ""}`}>
                    <input type="radio" name="reward" className="mt-1" disabled={!can("reward_type") || r.disabled} checked={cfg.reward_type === r.type}
                           onChange={() => set("reward_type", r.type, `${r.label} chosen from the ranked list`)} />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[13px] font-semibold ${r.disabled ? "text-ink-light" : "text-ink"}`}>{r.rank}. {r.label}</span>
                        {r.disabled ? <Badge tone="neutral"><Ban size={10} /> ranked and rejected</Badge> : <Badge tone={r.new_or_returning === "New customer" ? "success" : "info"}>{r.new_or_returning}</Badge>}
                        {!r.disabled && (
                          <span className="text-[11.5px] text-ink-secondary">
                            incremental share <span className="font-num font-semibold text-ink">{pct(r.expected_incremental_share, 0)}</span>
                            {r.incremental_share_provisional && <span className="ml-1 rounded bg-warning-bg px-1 py-0.5 text-warning font-medium">provisional</span>}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-ink-secondary mt-0.5">{r.reason}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Field label="Discount" hint="% off each ticket" editable={can("discount_pct")}>
                  <NumberInput value={cfg.discount_pct} disabled={!can("discount_pct")} onCommit={(v) => set("discount_pct", v)} suffix="%" />
                </Field>
                <Field label="Maximum value per redemption" hint="the reward's cap, S$" editable={can("max_reward_value_sgd")}>
                  <NumberInput value={cfg.max_reward_value_sgd} disabled={!can("max_reward_value_sgd")} onCommit={(v) => set("max_reward_value_sgd", v)} prefix="S$" />
                </Field>
              </div>
              <BasisNote>{c.prefill?.basis?.max_reward_value_sgd}. Incremental share: {outcome.reward?.reason ?? "—"}</BasisNote>
            </Card>

            {/* ------------------------------------------------------------------ 7.3 timing */}
            <Card className="p-6">
              <h3 className="text-[15px] font-bold text-ink mb-1">Timing — prefilled from your trough</h3>
              <p className="text-[12.5px] text-ink-secondary mb-3">Editing the window is the main way this campaign can go wrong, so its value recomputes as you move it.</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {WEEKDAYS.map((d, i) => {
                  const on = (cfg.days_of_week ?? []).includes(i);
                  return (
                    <button key={d} type="button" disabled={!can("days_of_week")}
                            onClick={() => { const next = on ? cfg.days_of_week.filter((x) => x !== i) : [...(cfg.days_of_week ?? []), i].sort(); set("days_of_week", next); }}
                            className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium border ${on ? "bg-ink text-white border-ink" : "bg-white text-ink-secondary border-border"} disabled:opacity-60`}>
                      {d}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From" editable={can("hours")}>
                  <select value={cfg.hours?.[0] ?? ""} disabled={!can("hours")} onChange={(e) => set("hours", [Number(e.target.value), cfg.hours?.[1] ?? Number(e.target.value) + 1])} className={selectCls}>
                    {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                </Field>
                <Field label="To" editable={can("hours")}>
                  <select value={cfg.hours?.[1] ?? ""} disabled={!can("hours")} onChange={(e) => set("hours", [cfg.hours?.[0] ?? 7, Number(e.target.value)])} className={selectCls}>
                    {HOURS.filter((h) => h > (cfg.hours?.[0] ?? 7)).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                </Field>
                <Field label="Start date" editable={can("window_start")}>
                  <input type="date" value={cfg.window_start ?? ""} disabled={!can("window_start")} onChange={(e) => set("window_start", e.target.value)} className={selectCls} />
                </Field>
                <Field label="End date" editable={can("window_end")}>
                  <input type="date" value={cfg.window_end ?? ""} disabled={!can("window_end")} onChange={(e) => set("window_end", e.target.value)} className={selectCls} />
                </Field>
              </div>
              {load.is_peak && (
                <div className="mt-3 rounded-lg border border-warning/50 bg-warning-bg/50 px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle size={15} className="text-warning shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-ink-secondary">
                    <span className="font-semibold text-ink">This window is already busy.</span> It carries {pctOf(load.share_pct, 1)} of your weekly transactions
                    against {pctOf(load.typical_pct, 1)} for the same number of average slots (the recommended trough carries {pctOf(troughLoad.share_pct, 1)}).
                    A reward here mostly discounts trade you were going to take anyway.
                    {failedAtPeak && (
                      <> That is what happened to <span className="font-semibold text-ink">{failedAtPeak.name}</span> ({fmtWindow(failedAtPeak.configuration)}): net contribution{" "}
                        <span className="font-num font-semibold text-brand">{sgd(failedAtPeak.results.cost.net_contribution_sgd)}</span>.</>
                    )}
                  </p>
                </div>
              )}
              <BasisNote>{c.prefill?.basis?.days_of_week}. Window load: {load.basis} (merchant_profiles.json trading_pattern.slots).</BasisNote>
            </Card>

            {/* ------------------------------------------------------------------ 7.4 location + platform */}
            <Card className="p-6">
              <h3 className="text-[15px] font-bold text-ink mb-1">Outlets</h3>
              <p className="text-[12.5px] text-ink-secondary mb-3">Reach per outlet, rounded to {seg.rounding}. An outlet that does not clear the {seg.floor} floor on its own cannot be selected alone.</p>
              <div className="space-y-2">
                {seg.per_outlet.map((o) => {
                  const suppressed = o.suppressed !== false;
                  const on = (cfg.outlets ?? []).includes(o.outlet_id);
                  return (
                    <label key={o.outlet_id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${suppressed ? "border-dashed bg-canvas/60" : "border-border"}`}>
                      <input type="checkbox" checked={on} disabled={!can("outlets") || suppressed}
                             onChange={() => set("outlets", on ? cfg.outlets.filter((x) => x !== o.outlet_id) : [...(cfg.outlets ?? []), o.outlet_id])} />
                      <span className="flex-1 text-[13px] text-ink">{o.name} <span className="text-ink-light">· District {o.district}</span></span>
                      {suppressed ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-ink-light"><Lock size={12} /> {o.prompt ?? "Below reporting threshold"}</span>
                      ) : (
                        <span className="font-num text-[13px] font-semibold text-ink">{cellText(o)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
              <h3 className="text-[15px] font-bold text-ink mt-5 mb-1">Platform</h3>
              <div className="rounded-lg border border-border px-3 py-2.5 flex items-center gap-3 text-[13px] text-ink">
                <input type="checkbox" checked readOnly disabled /> In-app offer feed <span className="text-ink-light">— always included</span>
              </div>
              <label className="mt-2 rounded-lg border border-border px-3 py-2.5 flex items-start gap-3 text-[13px] text-ink">
                <input type="checkbox" className="mt-0.5" checked={Boolean(cfg.push_requested)} disabled={!can("push_requested")}
                       onChange={(e) => set("push_requested", e.target.checked, e.target.checked ? "merchant requested push" : "merchant withdrew the push request")} />
                <span>
                  Request push notification
                  <span className="block text-[12px] text-ink-secondary">
                    A request, not a setting: OCBC grants it at approval, subject to its relevance threshold and the cap of{" "}
                    <span className="font-num font-semibold text-ink">{state.caps.push_per_week} pushes per cardholder per week</span>
                    {state.caps.provisional.push_per_week && <span className="ml-1 rounded bg-warning-bg px-1 py-0.5 text-warning font-medium">provisional</span>}.
                    Cardholders already at the cap get the feed card and no push.
                    {"push_granted" in cfg && <span className="block mt-0.5 text-ink">Push {cfg.push_granted ? "granted" : "not granted"} by OCBC staff.</span>}
                  </span>
                </span>
              </label>
              <BasisNote>segments.json per_outlet · allocation_summary.json push cap. No SMS, no email — not built.</BasisNote>
            </Card>

            {/* ------------------------------------------------------------------ 7.5 limit */}
            <Card className="p-6">
              <h3 className="text-[15px] font-bold text-ink mb-1">Limit — your real cost control</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Redemption limit" hint="first N redemptions" editable={can("redemption_limit")}>
                  <NumberInput value={cfg.redemption_limit} disabled={!can("redemption_limit")} onCommit={(v) => set("redemption_limit", v)} />
                </Field>
                <Field label="Per customer" editable={can("per_customer_limit")}>
                  {/* Only the values the reducer enforces at redemption are offered. A setting that
                      does nothing is worse than no setting, so once-per-visit — a rule at the till,
                      which the platform never observes — is not on the list. */}
                  <select value={cfg.per_customer_limit ?? ""} disabled={!can("per_customer_limit")} onChange={(e) => set("per_customer_limit", e.target.value)} className={selectCls}>
                    {PER_CUSTOMER_OPTIONS.map((k) => (
                      <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-4 rounded-xl border-2 border-ink px-4 py-3">
                <div className="text-[12px] font-medium text-ink-secondary">Maximum cost — your whole cost, not a share</div>
                <div className="font-num text-[32px] font-extrabold text-ink leading-tight">{sgd(outcome.max_cost_sgd)}</div>
                <div className="text-[12px] text-ink-secondary">{num(cfg.redemption_limit)} redemptions × {sgd(cfg.max_reward_value_sgd, 2)} maximum value each</div>
              </div>
              {PER_CUSTOMER_LIMITS[cfg.per_customer_limit] && (
                <p className="text-[12px] text-ink-secondary mt-3">
                  <span className="font-medium text-ink">Per customer:</span> {PER_CUSTOMER_LIMITS[cfg.per_customer_limit].label}. Enforced when the reward is
                  redeemed, not at set-up — a redemption that breaks it is refused and the refusal is logged with the reason.
                </p>
              )}
              <p className="text-[12px] text-ink-secondary mt-3">
                This is not the {seg.floor} segment floor. A redemption limit of 100 is fine; a segment of 100 is not — the floor is about who can be
                described, the limit is about what you will spend.
              </p>
              <p className="text-[12px] text-ink-secondary mt-1">
                When the limit is reached the campaign moves to <span className="font-medium text-ink">{display("capped")}</span>: the offer closes, unredeemed
                feed cards say so, and no further pushes go out.
              </p>
              <BasisNote>{c.prefill?.basis?.redemption_limit}. Only the merchant sets the limit — it bounds the merchant's own spend.</BasisNote>
            </Card>
          </div>

          {/* ------------------------------------------------------------------ 7.7 summary + submit */}
          <Card className="p-6 mb-5 border-ink/20">
            <h3 className="text-[15px] font-bold text-ink mb-3">Summary — what you are about to spend, and what you expect back</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
              <Row k="Segment" v={`${seg.description} ${Object.keys(seg.constraints).length ? "Narrowed: " + Object.entries(seg.constraints).map(([k, v]) => `${k.replace("_", " ")} ${v}`).join(", ") + "." : ""} Reach ${num(seg.reach)}.`} />
              <Row k="Reward" v={outcome.reward ? `${outcome.reward.label} — ${outcome.reward.new_or_returning}, incremental share ${pct(outcome.incremental_share, 0)}${outcome.incremental_share_provisional ? " (provisional)" : ""}; ${cfg.discount_pct ?? "—"}% off up to ${sgd(cfg.max_reward_value_sgd, 2)}` : "not chosen"} />
              <Row k="Window" v={`${(cfg.days_of_week ?? []).map((i) => WEEKDAYS[i]).join("/") || "—"} ${fmtHours(cfg.hours)} · ${cfg.window_start ?? "—"} to ${cfg.window_end ?? "—"}`} />
              <Row k="Outlets" v={(cfg.outlets ?? []).map((id) => seg.per_outlet.find((o) => o.outlet_id === id)?.name ?? id).join(", ") || "none"} />
              <Row k="Channel" v={`In-app feed${cfg.push_requested ? " + push requested (granted at approval)" : "; push not requested"}`} />
              <Row k="Limit and maximum cost" v={`${num(cfg.redemption_limit)} redemptions, ${PER_CUSTOMER_LIMITS[cfg.per_customer_limit]?.label ?? "no per-customer limit"} → maximum ${sgd(outcome.max_cost_sgd)}, your whole cost`} />
              <Row k="Reach in this window" v={outcome.reach_in_window === null ? `fewer than ${seg.floor} of the segment are usually free in this window — it cannot be offered to them` : `${num(outcome.reach_in_window)} (${outcome.reach_basis})`} />
              <Row k="Expected redemptions" v={range(outcome, "redemptions", num)} />
              <Row k="Expected cost" v={range(outcome, "cost_sgd", sgd)} />
              <Row k="Expected incremental value" v={range(outcome, "incremental_value_sgd", sgd)} strong />
            </div>
            <BasisNote>
              Range = {pct(engagement.low.value, 0)} base engagement ({engagement.low.basis}) to {pct(engagement.high.value, 0)} ({engagement.high.basis}).
              Value = redemptions × incremental share × your average ticket {sgd(outcome.ticket_sgd, 2)} (merchant_profiles.json). Cost = redemptions × maximum value per redemption.
            </BasisNote>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {c.status === "draft" ? (
                <button disabled={missing.length > 0}
                        onClick={() => dispatch({ type: "ADVANCE", campaign_id: c.id, to: "pending", by: viewAs === "ocbc" ? "rm" : "merchant" })}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-40">
                  <Send size={15} /> Submit for OCBC approval
                </button>
              ) : (
                <Badge tone="warning">{display(c.status)}{c.submitted_at ? ` · ${fmtAt(c.submitted_at)}` : ""}</Badge>
              )}
              {missing.length > 0 && c.status === "draft" && <span className="text-[12px] text-ink-secondary">Missing: {missing.map((f) => f.replace(/_/g, " ")).join(", ")}</span>}
              {c.status === "pending" && <span className="text-[12px] text-ink-secondary">In the OCBC staff queue. Approval flips it to {display("active")}; nothing sends until then. Staff edits made now are logged below and visible to the merchant.</span>}
              {lastRejection && <span className="text-[12px] text-brand">Refused: {lastRejection.reason}</span>}
            </div>
          </Card>

          {/* ------------------------------------------------------------------ 7.6 change log */}
          <Card className="p-6">
            <h3 className="text-[15px] font-bold text-ink mb-1">Change log — every edit, attributed and timestamped</h3>
            <p className="text-[12.5px] text-ink-secondary mb-3">
              Merchant proposes reward, timing, outlets and sets the limit. OCBC staff adjust reward, timing and outlets and decide push. Neither authors the segment.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead><tr className="text-left text-ink-light"><th className="py-1 pr-3 font-medium">When</th><th className="py-1 pr-3 font-medium">By</th><th className="py-1 pr-3 font-medium">Field</th><th className="py-1 pr-3 font-medium">Change</th><th className="py-1 font-medium">Basis / note</th></tr></thead>
                <tbody>
                  {c.changes.map((ch, i) => (
                    <tr key={i} className="border-t border-border align-top">
                      <td className="py-1.5 pr-3 font-num text-ink-secondary whitespace-nowrap">{fmtAt(ch.at)}</td>
                      <td className="py-1.5 pr-3"><Badge tone={ch.by === "mobius" ? "analytics" : ch.by === "ocbc" ? "info" : "neutral"}>{ch.by}</Badge></td>
                      <td className="py-1.5 pr-3 text-ink">{ch.field.replace(/_/g, " ")}</td>
                      <td className="py-1.5 pr-3 font-num text-ink">{fmtVal(ch.from)} <span className="text-ink-light">→</span> {fmtVal(ch.to)}</td>
                      <td className="py-1.5 text-ink-secondary">{ch.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <BasisNote>Shared state module ledger; the same log the RM view and the results page read.</BasisNote>
          </Card>
        </>
      )}
    </div>
  );
}

const selectCls = "w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-[13px] text-ink disabled:bg-canvas disabled:text-ink-secondary";

function ViewAs({ value, onChange }) {
  return (
    <div className="ml-auto inline-flex rounded-lg border border-border bg-white p-0.5 text-[12px]">
      {[["merchant", "View as merchant"], ["ocbc", "View as OCBC staff"]].map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)} className={`rounded-md px-3 py-1 font-medium ${value === k ? "bg-ink text-white" : "text-ink-secondary hover:text-ink"}`}>{label}</button>
      ))}
    </div>
  );
}

function Ladder({ status, display }) {
  const idx = LADDER.indexOf(status);
  return (
    <div className="flex items-center gap-1.5">
      {LADDER.map((s, i) => (
        <React.Fragment key={s}>
          <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${i === idx ? "bg-brand text-white" : i < idx ? "bg-ink text-white/90" : "bg-canvas text-ink-light border border-border"}`}>{display(s)}</span>
          {i < LADDER.length - 1 && <span className="text-ink-light text-[11px]">→</span>}
        </React.Fragment>
      ))}
      {idx === -1 && <span className="rounded-full bg-warning-bg px-2.5 py-1 text-[11.5px] font-semibold text-warning">{display(status)}</span>}
    </div>
  );
}

function Field({ label, hint, editable, children }) {
  return (
    <label className="block">
      <span className="text-[11.5px] font-medium text-ink-secondary">{label}{hint ? <span className="text-ink-light"> · {hint}</span> : null}{!editable && <Lock size={10} className="inline ml-1 text-ink-light" />}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NumberInput({ value, disabled, onCommit, prefix, suffix }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (value ?? "");
  return (
    <div className="flex items-center rounded-lg border border-border bg-white px-2.5 text-[13px] focus-within:ring-2 focus-within:ring-brand/30">
      {prefix && <span className="text-ink-light mr-1">{prefix}</span>}
      <input type="number" min="0" step="any" value={shown} disabled={disabled}
             onChange={(e) => setDraft(e.target.value)}
             onBlur={() => { if (draft !== null && draft !== "" && Number(draft) !== Number(value)) onCommit(Number(draft)); setDraft(null); }}
             onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
             className="w-full py-1.5 font-num text-ink bg-transparent focus:outline-none disabled:text-ink-secondary" />
      {suffix && <span className="text-ink-light ml-1">{suffix}</span>}
    </div>
  );
}

function Row({ k, v, strong }) {
  return (
    <div className="flex gap-3 py-1 border-b border-border/60">
      <span className="w-44 shrink-0 text-ink-secondary">{k}</span>
      <span className={`font-num ${strong ? "font-bold text-ink" : "text-ink"}`}>{v}</span>
    </div>
  );
}

function range(outcome, key, fmt) {
  const lo = outcome.low?.[key], hi = outcome.high?.[key];
  if (lo == null || hi == null) return "—";
  return lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`;
}
const fmtHours = (h) => (h && h.length === 2 ? `${String(h[0]).padStart(2, "0")}:00–${String(h[1]).padStart(2, "0")}:00` : "—");
const fmtWindow = (cfg) => cfg ? `${(cfg.days_of_week ?? []).map((i) => WEEKDAYS[i]).join("/")} ${fmtHours(cfg.hours)}` : "";
const fmtAt = (at) => (at ? new Date(at).toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtVal = (v) => (v === null || v === undefined ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
