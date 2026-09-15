import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Building2, Check, ChevronDown, Smartphone, Store } from "lucide-react";
import { PERSONAS } from "../data/constants";
import { personaOf, personaBy, pathFor, rememberPath } from "../state/personaRoutes";

// ----------------------------------------------------------------------------------------------
// One way across the three views, top-right of every chrome.
//
// This replaces the ad-hoc cross-links each shell used to carry, which differed per view and left
// the presenter guessing which hop was available from where. The dropdown is the same control in
// the same corner on all three sides, so a judge who asks "can I see the customer's side of that"
// gets one gesture rather than a hunt.
//
// Icons are the ones each chrome already uses for itself — Building2 on the RM desk badge,
// Smartphone on the prototype bar — so the menu reads as a map of the interfaces rather than a
// second vocabulary laid over them.
//
// Switching does not reset anything. Campaign state lives on the bus above the router; the screen
// each persona was left on lives in state/personaRoutes.js.
// ----------------------------------------------------------------------------------------------

const ICONS = { merchant: Store, rm: Building2, cardholder: Smartphone };

const TONES = {
  light: {
    trigger: "border-border bg-white text-ink hover:bg-canvas",
    label: "text-ink",
    note: "text-ink-light",
    chevron: "text-ink-light",
  },
  dark: {
    trigger: "border-white/20 bg-white/10 text-white hover:bg-white/20",
    label: "text-white",
    note: "text-white/55",
    chevron: "text-white/60",
  },
};

export default function PersonaSwitcher({ tone = "light", className = "" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const trigger = useRef(null);
  const items = useRef([]);

  const currentKey = personaOf(location.pathname);
  const current = personaBy(currentKey);
  const t = TONES[tone] ?? TONES.light;
  const CurrentIcon = ICONS[currentKey] ?? Store;

  // Every route change inside a persona is recorded as it happens, so the record is already
  // correct at the moment the presenter switches away.
  useEffect(() => {
    rememberPath(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) items.current[Math.max(0, PERSONAS.findIndex((p) => p.key === currentKey))]?.focus();
  }, [open, currentKey]);

  function go(key) {
    setOpen(false);
    if (key !== currentKey) navigate(pathFor(key));
  }

  // Both shells listen on `window` for bare arrow and digit keys to move between screens. While
  // this menu is open those keys belong to the menu, so nothing typed here reaches that handler.
  function onKeyDown(e) {
    if (!open) return;
    e.stopPropagation();
    if (e.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const focused = items.current.findIndex((el) => el === document.activeElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = (focused + step + PERSONAS.length) % PERSONAS.length;
      items.current[next]?.focus();
    }
  }

  return (
    <div ref={wrap} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Viewing as ${current.label}. Switch view.`}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-brand/30 ${t.trigger}`}
      >
        <CurrentIcon size={14} className="shrink-0" />
        <span className={t.label}>{current.label}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${t.chevron} ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch view"
          className="absolute right-0 top-full mt-2 z-50 w-60 overflow-hidden rounded-lg border border-border bg-white shadow-card-hover"
        >
          <p role="none" className="px-3 pt-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-light">
            Viewing as
          </p>
          {PERSONAS.map((p, i) => {
            const Icon = ICONS[p.key] ?? Store;
            const active = p.key === currentKey;
            return (
              <button
                key={p.key}
                ref={(el) => { items.current[i] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => go(p.key)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus:outline-none focus:bg-canvas ${
                  active ? "bg-canvas" : "hover:bg-canvas"
                }`}
              >
                <Icon size={15} className={`shrink-0 ${active ? "text-ink" : "text-ink-light"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink">{p.label}</span>
                  <span className="block text-[11px] text-ink-light">{p.note}</span>
                </span>
                {active && <Check size={14} className="shrink-0 text-brand" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
