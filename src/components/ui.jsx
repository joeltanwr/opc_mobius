import React from "react";
import { Lock, AlertTriangle } from "lucide-react";

export function Card({ children, className = "", interactive = false, ...props }) {
  return (
    <div
      className={`rounded-xl border border-border bg-white shadow-card ${
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
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        {eyebrow && (
          <div className="text-[12px] font-semibold uppercase tracking-wide text-brand mb-1">{eyebrow}</div>
        )}
        <h2 className="text-[22px] font-bold text-ink leading-tight">{title}</h2>
        {subtitle && <p className="text-[13px] text-ink-secondary mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
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

export function MockDataBadge({ className = "" }) {
  return (
    <span
      title="Every number on this screen comes from a seeded synthetic dataset. No real cardholder or merchant records."
      className={`inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning ${className}`}
    >
      <AlertTriangle size={11} strokeWidth={2.5} />
      Mock data
    </span>
  );
}

export function SuppressedCard({ reason = "Segment too small to display — minimum 250 cardholders", label }) {
  return (
    <Card className="p-5 border-dashed bg-canvas/60">
      <div className="flex items-center gap-2 text-ink-light mb-1.5">
        <Lock size={14} />
        <span className="text-[12px] font-semibold uppercase tracking-wide">Suppressed</span>
      </div>
      {label && <div className="text-[13px] font-medium text-ink-secondary mb-1">{label}</div>}
      <p className="text-[13px] text-ink-light">{reason}</p>
    </Card>
  );
}

export function BasisNote({ children }) {
  return <p className="text-[11px] text-ink-light mt-1 leading-snug">{children}</p>;
}

export function Num({ value, prefix = "", suffix = "", decimals = 0 }) {
  if (value === null || value === undefined) return <span className="text-ink-light">—</span>;
  const formatted = Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span className="font-num">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
