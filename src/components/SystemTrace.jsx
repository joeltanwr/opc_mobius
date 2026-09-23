import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Workflow, ChevronRight } from "lucide-react";
import { useMobiusState } from "../state/StateProvider";
import { useDemoData } from "../data/DataProvider";
import { traceOf } from "../state/trace.js";
import { DEMO_LAYER, TRACE } from "../data/constants";
import { InfoTip } from "./ui";

// ----------------------------------------------------------------------------------------------
// DEMO LAYER — the System Trace drawer. RM view and cardholder view only; never the merchant's.
//
// The recommender's stages as a strip of nodes that light up in order, so a judge can watch the
// parts hand off to each other rather than be told they do. It is deliberately not the OCBC design
// language — dark, monospace, badged — because it is scaffolding around the product, like the
// prototype bar, and must never be mistaken for a screen a banker or a cardholder would see.
//
// It holds no figures. state/trace.js reads every one from the shared state and the loaded
// dataset, through the helpers the screens beside it use, so the two cannot drift. Everything
// kept here — open or collapsed, which node a chip highlighted, the chatbot's last answer — is
// React memory, so "Reset demo data" (which reloads the page) clears it with the event log.
// ----------------------------------------------------------------------------------------------

const STEP_MS = 400;

const TraceContext = createContext(null);
const INERT = { open: false, setOpen: () => {}, highlight: null, setHighlight: () => {}, pull: null, publishPull: () => {}, seen: { current: {} } };
export const useTrace = () => useContext(TraceContext) ?? INERT;

// Above the router, so collapsing it in the RM view keeps it collapsed in the cardholder view, and
// a fire in the RM view is still news when the presenter switches across.
export function TraceProvider({ children }) {
  // Expanded by default, on a screen wide enough to dock it beside the page. On a phone it would
  // cover the thing it is explaining, so it starts collapsed there.
  const [open, setOpen] = useState(() =>
    typeof window === "undefined" || !window.matchMedia ? true : window.matchMedia("(min-width: 1024px)").matches
  );
  const [highlight, setHighlight] = useState(null);
  const [pull, setPull] = useState(null);
  const counter = useRef(0);
  // The last run each view has shown, so a view that was not on screen for a fire still plays it
  // the first time it is opened afterwards — and only then.
  const seen = useRef({});
  const publishPull = useCallback((payload) => {
    if (!payload) { setPull(null); return; }
    counter.current += 1;
    setPull({ ...payload, id: counter.current });
  }, []);
  const value = useMemo(() => ({ open, setOpen, highlight, setHighlight, pull, publishPull, seen }), [open, highlight, pull, publishPull]);
  return <TraceContext.Provider value={value}>{children}</TraceContext.Provider>;
}

// ---------------------------------------------------------------------------------------- toggle
// Sits immediately left of the persona switcher in the RM and cardholder chromes. Styled as the
// drawer is, so it reads as part of the demo layer rather than a control of the product.
export function TraceToggle() {
  const t = useTrace();
  if (!DEMO_LAYER) return null;
  return (
    <button
      type="button"
      aria-pressed={t.open}
      aria-controls="system-trace"
      onClick={() => t.setOpen((v) => !v)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-[#0B1120] px-2.5 py-1.5 font-mono text-[11.5px] font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300/50 ${
        t.open ? "border-amber-300/70 text-amber-300" : "border-slate-500/60 text-slate-300 hover:text-amber-300"
      }`}
    >
      <Workflow size={13} className="shrink-0" />
      Trace
    </button>
  );
}

// ------------------------------------------------------------------------------------ verdict chip
// One per consolidated tile. The mark comes from state (trace.js verdictFor); tapping it lights the
// stage that decided it. Only drawn while the drawer is open — collapsing the trace takes the whole
// demo layer off the slide, chips included.
export function TraceChip({ chip }) {
  const t = useTrace();
  if (!DEMO_LAYER || !t.open || !chip?.mark) return null;
  const on = t.highlight === chip.node;
  const mark = chip.mark === "yes" ? "✓" : chip.mark === "no" ? "✗" : "…";
  const markTone = chip.mark === "yes" ? "text-emerald-300" : chip.mark === "no" ? "text-red-300" : "text-amber-300";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => t.setHighlight(on ? null : chip.node)}
      className={`mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border bg-[#0B1120] px-2 py-1 font-mono text-[11px] text-slate-200 transition-colors ${
        on ? "border-amber-300 ring-1 ring-amber-300/60" : "border-slate-600 hover:border-slate-400"
      }`}
    >
      <span className={`font-bold ${markTone}`}>{mark}</span>
      <span className="text-slate-400">#{chip.n}</span>
      <span className="truncate">{chip.label}</span>
    </button>
  );
}

// ------------------------------------------------------------------------------------- the drawer
// `stickyRef` is the chrome's sticky header: the drawer docks directly under it, at whatever height
// it has wrapped to, and scrolls on its own if the strip is taller than the space left.
//
// 400px is set by the longest one-line output (the gap window and the pick, ~46 characters of
// monospace) — measured in the browser, not estimated. The push dialog's overlay stops at the same
// width (PushTrigger.jsx lg:right-[400px]); change the two together.
export default function SystemTrace({ view, cardholderId = null, stickyRef }) {
  const t = useTrace();
  const m = useMobiusState();
  const { data } = useDemoData();
  const top = useElementHeight(stickyRef);
  const trace = useMemo(
    () => (m ? traceOf({ state: m.state, data, view, cardholderId, pull: t.pull }) : null),
    [m, data, view, cardholderId, t.pull]
  );
  const step = useRun(trace, `${view}:${cardholderId ?? ""}`, t.seen);
  const highlight = view === "consolidated" ? t.highlight : null;

  if (!DEMO_LAYER || !t.open || !trace) return null;

  const visual = (key, n) => {
    if (n.control) return "control";
    if (n.greyed) return "greyed";
    if (step !== null) {
      const i = trace.sequence.indexOf(key);
      if (i === step) return "active";
      return i >= 0 && i < step ? "lit" : "dim";
    }
    if (n.pending) return "pending";
    if (n.status === "fail") return "fail";
    return "lit";
  };

  return (
    <aside
      id="system-trace"
      aria-label={TRACE.title}
      style={{ top, height: `calc(100dvh - ${top}px)` }}
      className="fixed right-0 z-30 flex w-[min(400px,92vw)] shrink-0 flex-col self-start border-l border-slate-700 bg-[#0B1120] font-mono text-slate-200 lg:sticky lg:z-auto lg:w-[400px]"
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-700/80 px-4 py-3">
        <div className="min-w-0">
          <span className="inline-flex items-center rounded border border-amber-300/50 bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            {TRACE.badge}
          </span>
          <div className="mt-1.5 text-[13px] font-semibold text-slate-100">
            {TRACE.title} <span className="font-normal text-slate-500">· {trace.campaignId} · {trace.mode}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => t.setOpen(false)}
          aria-label="Collapse the System Trace"
          className="shrink-0 rounded p-0.5 text-slate-500 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-300/50"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <ol className="flex-1 overflow-y-auto px-3 py-4">
        {trace.nodes.map((n, i) => (
          <TraceNode
            key={n.key}
            node={n}
            look={visual(n.key, n)}
            lookOf={(s) => visual(s.key, s)}
            highlight={highlight}
            last={i === trace.nodes.length - 1}
          />
        ))}
      </ol>
    </aside>
  );
}

const DOT = {
  lit: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]",
  active: "bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.9)] animate-pulse",
  dim: "border border-slate-600 bg-[#0B1120]",
  pending: "border border-slate-500 bg-[#0B1120]",
  greyed: "bg-slate-700",
  control: "border border-dashed border-slate-500 bg-[#0B1120]",
  fail: "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.75)]",
};

const BOX = {
  lit: "border-slate-600 bg-slate-800/40 text-slate-100",
  active: "border-amber-300/80 bg-amber-300/10 text-slate-100",
  dim: "border-slate-800 bg-transparent text-slate-500",
  pending: "border-slate-700 bg-transparent text-slate-400",
  greyed: "border-slate-800 bg-transparent text-slate-500 opacity-60",
  control: "border-dashed border-slate-600 bg-transparent text-slate-400",
  fail: "border-red-400/60 bg-red-400/10 text-slate-100",
};

const CHANNEL_ON = "border-emerald-400/70 bg-emerald-400/10 text-emerald-300";

function TraceNode({ node, look, lookOf, highlight, last }) {
  const ring = highlight === node.key ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-[#0B1120]" : "";
  return (
    <li className="relative pl-5 pb-3">
      {!last && <span aria-hidden className={`absolute left-[5px] top-4 bottom-0 w-px ${look === "lit" || look === "fail" ? "bg-emerald-400/40" : "bg-slate-700"}`} />}
      <span aria-hidden className={`absolute left-0 top-3 h-[11px] w-[11px] rounded-full transition-all duration-300 ${DOT[look]}`} />
      <div className={`rounded-md border px-2.5 py-2 transition-colors duration-300 ${BOX[look]} ${ring}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{node.label}</span>
          <InfoTip tone="dark" align="right" width="w-64" title={`About ${node.label}`}>{node.info}</InfoTip>
        </div>
        {node.line && (
          <div data-trace-line className={`mt-0.5 text-[12px] leading-snug ${look === "greyed" || look === "control" ? "italic" : ""}`}>{node.line}</div>
        )}
        {node.sub && <SubNodes node={node} lookOf={lookOf} highlight={highlight} />}
      </div>
    </li>
  );
}

// Allocator is Consent → Freq Cap, in the order they are applied. Delivery is Push | Pull, and
// only one of the two is lit: the channel this view is actually showing.
function SubNodes({ node, lookOf, highlight }) {
  const channel = node.key === "delivery";
  const parent = lookOf(node);
  return (
    <div className="mt-2 flex flex-wrap items-stretch gap-1.5">
      {node.sub.map((s, i) => {
        // A channel takes its parent's state when it is the one in use, and stays dark otherwise —
        // lit in green once it has run, so which of the two carried this answer reads at a glance.
        const look = channel ? (s.active ? parent : "dim") : lookOf(s);
        const on = channel && s.active && look === "lit";
        const ring = highlight === s.key ? "ring-2 ring-amber-300" : "";
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span aria-hidden className="self-center text-[11px] text-slate-500">{channel ? "|" : "→"}</span>}
            <div className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors duration-300 ${on ? CHANNEL_ON : BOX[look]} ${ring}`}>
              <span className={`uppercase tracking-wide ${on ? "font-semibold" : "text-slate-400"}`}>{s.label}</span>
              {s.line && <span className={look === "greyed" ? "" : "text-slate-100"}>{s.line}</span>}
              {s.info && <InfoTip tone="dark" align="right" width="w-60" title={`About ${s.label}`}>{s.info}</InfoTip>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------- hooks

function useElementHeight(ref) {
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref?.current;
    if (!el) return undefined;
    const update = () => setH(el.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return h;
}

// A run is a new send of the demo campaign or a new question to the chatbot. The lights travel
// the sequence one stage every STEP_MS; `null` means no run in progress, so the strip shows the
// state as it stands. A reset (the send count going back down) is not a run and plays nothing.
function isNewRun(prev, next) {
  if (prev === undefined || prev === null || next === null) return false;
  const [pk, pv] = prev.split(":");
  const [nk, nv] = next.split(":");
  if (nk === "pull") return prev !== next;
  return pk === nk && Number(nv) > Number(pv);
}

function useRun(trace, viewKey, seen) {
  const [step, setStep] = useState(null);
  const key = trace?.runKey ?? null;
  const length = trace?.sequence.length ?? 0;

  useEffect(() => {
    if (key === null) return;
    const prev = seen.current[viewKey];
    seen.current[viewKey] = key;
    if (!isNewRun(prev, key)) return;
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setStep(still ? null : 0);
  }, [key, viewKey, seen]);

  useEffect(() => {
    if (step === null) return undefined;
    const id = setTimeout(() => setStep(step >= length ? null : step + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [step, length]);

  return step;
}
