import React, { useEffect, useRef, useState } from "react";
import { Lock, AlertTriangle, Info } from "lucide-react";
import { CONSTANTS, SHOW_BASIS_NOTES } from "../data/constants";
import { usePrivacyRules, useDemoData } from "../data/DataProvider";

// The default background is applied only when the caller has not asked for one.
//
// Tailwind emits `.bg-white` after `.bg-navy`, so `<Card className="bg-navy text-white">` used to
// render a white card with white text — invisible, silently, with both classes present and neither
// obviously at fault. Two utilities of equal specificity are decided by stylesheet order, which no
// call site can see. So the conflict is resolved here instead of being lost to it: a caller that
// names its own bg- gets it, and everyone else gets white as before.
const HAS_BG = /(^|\s)bg-/;

export function Card({ children, className = "", interactive = false, ...props }) {
  return (
    <div
      className={`rounded-xl border border-border ${HAS_BG.test(className) ? "" : "bg-white"} shadow-card ${
        interactive ? "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-ink-light" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, subtitle, right }) {
  return (
    // Wraps at phone width: `right` holds a status ladder on some screens, which is wider than a
    // narrow viewport and would otherwise push the whole page into a horizontal scroll.
    <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[12px] font-semibold uppercase tracking-wide text-brand mb-1">{eyebrow}</div>
        )}
        <h2 className="text-[22px] font-bold text-ink leading-tight">{title}</h2>
        {subtitle && <p className="text-[13px] text-ink-secondary mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0 max-w-full">{right}</div>}
    </div>
  );
}

export function StatTile({ label, value, sub, tone = "default" }) {
  const toneClass = {
    default: "text-ink",
    success: "text-success",
    warning: "text-warning",
    brand: "text-brand",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-card">
      <div className="text-[12px] text-ink-secondary mb-1">{label}</div>
      <div className={`font-num text-[28px] font-bold leading-none ${toneClass}`}>{value}</div>
      {sub && <div className="text-[12px] text-ink-light mt-1.5">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = "neutral", className = "" }) {
  const toneClass = {
    neutral: "bg-canvas text-ink-secondary border-border",
    brand: "bg-[#FDECEC] text-brand border-[#F8C9CB]",
    success: "bg-success-bg text-success border-[#A7F3D0]",
    warning: "bg-warning-bg text-warning border-[#FDE68A]",
    info: "bg-info-bg text-info border-[#BFDBFE]",
    analytics: "bg-[#EEF2FF] text-analytics border-[#C7D2FE]",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass} ${className}`}>
      {children}
    </span>
  );
}

// The marker every screen carries. Label and tooltip both come from CONSTANTS.MOCK_DATA_LABEL, so
// the one string the brief requires on every screen has a single source and a basis — it used to
// be typed here while the constant sat unread beside it, which is exactly the drift the
// no-number-without-a-basis rule exists to stop.
export function MockDataBadge({ className = "" }) {
  return (
    <span
      title={CONSTANTS.MOCK_DATA_LABEL.basis}
      className={`inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning ${className}`}
    >
      <AlertTriangle size={11} strokeWidth={2.5} />
      {CONSTANTS.MOCK_DATA_LABEL.value}
    </span>
  );
}

// `reason` has no default string: the fallback sentence quotes the floor, and a default argument
// is evaluated outside any data context, so it used to hardcode the number. The sentence is built
// inside the component instead, from the manifest.
export function SuppressedCard({ reason, label }) {
  const { floor } = usePrivacyRules();
  const text = reason ?? `Segment too small to display — minimum ${floor} cardholders`;
  return (
    <Card className="p-5 border-dashed bg-canvas/60">
      <div className="flex items-center gap-2 text-ink-light mb-1.5">
        <Lock size={14} />
        <span className="text-[12px] font-semibold uppercase tracking-wide">Suppressed</span>
      </div>
      {label && <div className="text-[13px] font-medium text-ink-secondary mb-1">{label}</div>}
      <p className="text-[13px] text-ink-light">{text}</p>
    </Card>
  );
}

// The one sentence about the whole dataset's scale, read from the pipeline manifest. Both chromes
// — the merchant/RM shell and the cardholder app's prototype bar — render this component, so the
// sentence has one source and one rendering however many interfaces the build grows.
export function ScaleDisclosure({ className = "" }) {
  const { data } = useDemoData();
  const line = data?.constants?.scale_disclosure;
  if (!line) return null;
  return <p className={`text-[12px] text-ink-light max-w-xl leading-snug ${className}`}>{line}</p>;
}

// ----------------------------------------------------------------------------------------------
// The one ⓘ in the build.
//
// Grown out of the RFM segment glossary on Customer Profile — same Info icon, same click to open,
// same click again (or Escape, or a click elsewhere) to close — so every explanation that comes
// off a screen lands behind a control that already looks like this everywhere else. Two shapes,
// one component: bare icon beside the thing it explains, or icon with a short label where the
// label is the affordance (the glossary's "What the segments mean"). `tone="dark"` is for the
// System Trace drawer and nothing else.
//
// Click, not hover: a projector has no hover, and a presenter needs the panel to stay put while
// they talk to it.
// ----------------------------------------------------------------------------------------------
const INFO_TONES = {
  light: {
    icon: "inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-light hover:text-ink hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-brand/30",
    labelled: "inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1 text-[12px] font-medium text-ink-secondary hover:text-ink hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-brand/30",
    panel: "rounded-lg border border-border bg-white p-3 text-[12.5px] font-normal normal-case tracking-normal leading-snug text-ink-secondary shadow-card-hover",
  },
  dark: {
    icon: "inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-300/50",
    labelled: "inline-flex items-center gap-1.5 rounded border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-300/50",
    panel: "rounded-md border border-slate-600 bg-[#111A2E] p-2.5 font-mono text-[11.5px] font-normal normal-case tracking-normal leading-snug text-slate-300 shadow-lg",
  },
};

export function InfoTip({ children, label = null, title = "What this means", tone = "light", align = "left", width = "w-72", className = "" }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const t = INFO_TONES[tone] ?? INFO_TONES.light;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={wrap} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={label ? undefined : title}
        onClick={() => setOpen((v) => !v)}
        className={label ? t.labelled : t.icon}
      >
        <Info size={label ? 13 : 14} />
        {label}
      </button>
      {open && (
        <span
          role="note"
          className={`absolute top-full mt-1.5 z-50 block ${align === "right" ? "right-0" : "left-0"} ${width} max-w-[min(90vw,40rem)] ${t.panel}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

// The provenance line under a figure. Hidden by default (SHOW_BASIS_NOTES in constants.js) — the
// call sites and their strings are untouched, so turning the flag on restores every one of them.
export function BasisNote({ children }) {
  if (!SHOW_BASIS_NOTES) return null;
  return <p className="text-[11px] text-ink-light mt-1 leading-snug">{children}</p>;
}
