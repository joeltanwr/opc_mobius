import React, { useState } from "react";
import { Gauge, Layers, OctagonX, ShieldCheck, Undo2 } from "lucide-react";
import { useMobiusState } from "../../state/StateProvider";
import { portfolioView } from "../../state/store.js";
import { num, pctOf } from "../../data/format";
import { Card, BasisNote, InfoTip } from "../../components/ui";
import { Provisional } from "./rmCommon";

// ---------------------------------------------------------------------------------------------
// RM §3.2 — portfolio exposure. The panel that exists nowhere else in the system.
//
// A reviewer approving campaigns one at a time cannot see the other campaigns targeting the same
// cardholder this week. This panel is the answer to that, and it is the one screen in the build
// that no merchant and no cardholder can reach.
//
// Everything here is live: the contacted figure moves the moment a push fires anywhere in the
// book, because the counter lives on the shared state's portfolio slice rather than on any one
// campaign. The two controls write to that same slice — see store.js for why the ceiling warns
// and the throttle binds.
// ---------------------------------------------------------------------------------------------

const HALT_WORD = "HALT";

export default function ExposurePanel() {
  const { state, dispatch } = useMobiusState();
  const p = state.portfolio;
  const v = portfolioView(p);
  const bound = v.throttle ? v.throttle.limit : v.ceiling;
  const usedPct = bound ? Math.min(100, (v.contacted / bound) * 100) : 0;
  const over = v.ceiling != null && v.contacted > v.ceiling;

  return (
    <Card className="p-6 mb-6 border-navy/20">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-navy" />
            <h2 className="text-[16px] font-bold text-ink">Portfolio exposure — this week</h2>
          </div>
          <p className="text-[12.5px] text-ink-secondary mt-1 max-w-2xl">
            Every live campaign in the book · week of {p.week}
            <InfoTip title="Why this panel exists" className="ml-1">
              No merchant sees this panel. Approving campaigns one at a time can't see cumulative exposure; this is where it shows.
            </InfoTip>
          </p>
        </div>
        <div className="text-right">
          <div className="font-num text-[36px] font-extrabold leading-none tabular-nums text-ink">{num(v.contacted)}</div>
          <div className="text-[11px] text-ink-light mt-1">cardholders contacted</div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ the arithmetic, stated */}
      <div className="rounded-xl border border-border bg-canvas/60 px-4 py-3">
        <div className="h-3 w-full rounded-full bg-white border border-border overflow-hidden">
          <div
            className={`h-full ${over ? "bg-warning" : "bg-navy"}`}
            style={{ width: `${usedPct}%` }}
            role="progressbar"
            aria-valuenow={v.contacted}
            aria-valuemin={0}
            aria-valuemax={bound ?? undefined}
            aria-label="Cardholders contacted this week against the weekly ceiling"
          />
        </div>
        <p className="mt-2.5 font-num text-[13px] text-ink tabular-nums">
          {num(v.contacted)} contacted of a {num(v.ceiling)} weekly ceiling
          {/* One ⓘ for the ceiling: the provisional tag's own, carrying the arithmetic. */}
          <Provisional
            title={`Ceiling = ${pctOf((p.ceiling_share_of_consented_base ?? 0) * 100, 2)} of the ${num(p.consented_base)} cardholders with offers on. The share is fixed; the headcount follows the base on screen.`}
          />
          <span className="text-ink-secondary"> — {num(Math.max(0, v.ceiling_headroom))} left{v.ceiling_headroom < 0 ? ` (${num(-v.ceiling_headroom)} over)` : ""}.</span>
        </p>
        <BasisNote>{p.note} {p.ceiling_basis}</BasisNote>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <Figure
          label="Share of the consented base reached"
          value={pctOf(p.share_of_consented_base_reached_pct, 2)}
          sub={`${num(p.seeded_contacted_this_week)} of ${num(p.consented_base)} consented cardholders`}
        />
        <Figure
          label="Eligible for two or more campaigns at once"
          value={num(p.concurrent_2plus)}
          info="Concentration is the risk the per-campaign gate cannot see: each of those campaigns passed its own review."
          tone="warning"
        />
        <Figure
          label="Campaigns live in the book"
          value={num(Object.values(state.campaigns).filter((c) => c.status === "active").length)}
          sub={`${num(p.campaigns_live)} at the start of the week`}
        />
      </div>
      <BasisNote>{p.concurrent_basis}</BasisNote>

      {/* ------------------------------------------------------------------ the two controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5 pt-5 border-t border-border">
        <Throttle view={v} portfolio={p} dispatch={dispatch} />
        <KillSwitch view={v} dispatch={dispatch} />
      </div>

      {p.log.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-[12px] font-semibold text-ink mb-2">Control log — who moved the portfolio controls, and when</div>
          <ul className="space-y-1">
            {p.log.map((l, i) => (
              <li key={i} className="font-num text-[12px] text-ink-secondary tabular-nums">
                <span className="text-ink-light">{fmtAt(l.at)}</span> · <span className="font-semibold text-ink">{l.action}</span>
                {l.from !== null && l.from !== undefined && <> — from {num(l.from)}</>}
                {l.to !== null && l.to !== undefined && <> to {num(l.to)}</>}
                {" "}· {l.by}
                {l.note && <span className="text-ink-light"> · {l.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Figure({ label, value, sub, info, tone = "default" }) {
  const toneClass = { default: "text-ink", warning: "text-warning" }[tone];
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <div className={`font-num text-[24px] font-bold leading-none tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[12px] font-medium text-ink mt-1.5">
        {label}
        {info && <InfoTip title={`About ${label.toLowerCase()}`} className="ml-1">{info}</InfoTip>}
      </div>
      {sub && <div className="text-[11.5px] text-ink-light mt-1 leading-snug">{sub}</div>}
    </div>
  );
}

// The throttle. Red, per the design system, because it and the kill switch are the only controls
// that stop the bank doing something — and it tightens only, never raises.
function Throttle({ view, portfolio, dispatch }) {
  const [draft, setDraft] = useState("");
  const engaged = Boolean(view.throttle);
  const proposed = Number(draft);
  const valid = draft !== "" && Number.isFinite(proposed) && proposed >= 0 && proposed <= (view.ceiling ?? Infinity);

  return (
    <div className={`rounded-xl border px-4 py-3.5 ${engaged ? "border-brand/50 bg-[#FDECEC]/40" : "border-border"}`}>
      <div className="flex items-center gap-2 mb-1">
        <Gauge size={15} className={engaged ? "text-brand" : "text-ink-secondary"} />
        <h3 className="text-[13.5px] font-bold text-ink">Throttle</h3>
        {engaged && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-bold text-white">ENGAGED</span>}
      </div>
      <p className="text-[12px] text-ink-secondary leading-snug">
        The control that binds.
        <InfoTip title="How the throttle works" className="ml-1">
          A send that won't fit is refused whole — this layer holds aggregates, so it never picks who to drop. It can tighten the
          ceiling, never raise it.
        </InfoTip>
      </p>

      {engaged ? (
        <div className="mt-3">
          <p className="font-num text-[13px] text-ink tabular-nums">
            Capped at <span className="font-bold">{num(view.throttle.limit)}</span> contacts this week ·{" "}
            <span className="text-ink-secondary">{num(view.throttle_headroom)} left</span>
          </p>
          {view.throttle.note && <p className="text-[11.5px] text-ink-light mt-0.5">{view.throttle.note}</p>}
          <button
            onClick={() => dispatch({ type: "THROTTLE_CLEAR", by: "rm" })}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink"
          >
            <Undo2 size={13} /> Release the throttle
          </button>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) { dispatch({ type: "THROTTLE_SET", limit: proposed, by: "rm", note: "set from the portfolio panel" }); setDraft(""); }
          }}
        >
          <label className="flex-1 min-w-[9rem]">
            <span className="block text-[11.5px] font-medium text-ink-secondary mb-1">Cap contacts this week at</span>
            <input
              type="number" min="0" max={view.ceiling ?? undefined} step="50" value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={String(view.ceiling ?? "")}
              className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 font-num text-[13px] tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </label>
          <button type="submit" disabled={!valid}
                  className="rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-40">
            Engage
          </button>
        </form>
      )}
    </div>
  );
}

// The kill switch. Deliberately hard to hit: it is two steps and a typed word, and it does not sit
// next to routine actions (RM §3.2). Halting is portfolio-wide — every campaign, not this one.
function KillSwitch({ view, dispatch }) {
  const [arming, setArming] = useState(false);
  const [word, setWord] = useState("");
  const halted = view.halted;

  if (halted) {
    return (
      <div className="rounded-xl border-2 border-brand bg-[#FDECEC]/60 px-4 py-3.5">
        <div className="flex items-center gap-2 mb-1">
          <OctagonX size={16} className="text-brand" />
          <h3 className="text-[13.5px] font-bold text-brand">Sending halted across the portfolio</h3>
        </div>
        <p className="text-[12px] text-ink-secondary leading-snug">
          Every send in the book is refused until this is released — not just this campaign's. Cards already delivered are
          untouched: a reward a cardholder is holding is never revoked. Halted by {halted.by} at {fmtAt(halted.at)}
          {halted.reason ? ` — ${halted.reason}` : ""}.
        </p>
        <button
          onClick={() => dispatch({ type: "RESUME_SENDING", by: "rm" })}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-canvas"
        >
          <Undo2 size={13} /> Release the halt
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border px-4 py-3.5">
      <div className="flex items-center gap-2 mb-1">
        <OctagonX size={15} className="text-ink-secondary" />
        <h3 className="text-[13.5px] font-bold text-ink">Kill switch</h3>
      </div>
      <p className="text-[12px] text-ink-secondary leading-snug">
        Stops every send across the whole portfolio.
        <InfoTip title="Why two steps" className="ml-1">
          Two steps and a typed word, on purpose — it should never be reachable by accident.
        </InfoTip>
      </p>
      {!arming ? (
        <button
          onClick={() => setArming(true)}
          className="mt-3 rounded-lg border border-brand/40 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-brand hover:bg-[#FDECEC]"
        >
          Arm the kill switch
        </button>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (word.trim().toUpperCase() === HALT_WORD) {
              dispatch({ type: "HALT_SENDING", by: "rm", reason: "halted from the portfolio panel" });
              setArming(false); setWord("");
            }
          }}
        >
          <label className="flex-1 min-w-[10rem]">
            <span className="block text-[11.5px] font-medium text-ink-secondary mb-1">Type {HALT_WORD} to confirm</span>
            <input
              value={word} onChange={(e) => setWord(e.target.value)} autoFocus
              className="w-full rounded-lg border border-brand/40 bg-white px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </label>
          <button type="submit" disabled={word.trim().toUpperCase() !== HALT_WORD}
                  className="rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-40">
            Halt all sending
          </button>
          <button type="button" onClick={() => { setArming(false); setWord(""); }}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] font-medium text-ink-secondary">
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

// A small concentration reader used by the dashboard strip as well.
export function ConcentrationNote({ portfolio }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
      <Layers size={12} className="text-ink-light" />
      {num(portfolio.concurrent_2plus)} cardholders are eligible for two or more live campaigns at once
    </span>
  );
}

const fmtAt = (at) => (at ? new Date(at).toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
