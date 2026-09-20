import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, Gift, UserRound, Smartphone, RotateCcw } from "lucide-react";
import { useMobiusState } from "../../state/StateProvider";
import { MockDataBadge, ScaleDisclosure } from "../../components/ui";
import PersonaSwitcher from "../../components/PersonaSwitcher";
import { INDIVIDUAL_CARDHOLDERS, CardholderProvider, getCardholderId, setCardholderId } from "./cardholder";

// ---------------------------------------------------------------------------------------------
// The cardholder's app — customer prompt §9.
//
// Two layers that must never be mistaken for each other: the prototype chrome (slate, outside the
// device, says "Mock data" and names which screen you are on) and the app itself (inside the
// frame, which is what a member of the public would see). A judge should never wonder whether the
// screen-switcher is part of the product.
//
// Below ~520px the frame comes off and the app fills the viewport, because at that width the phone
// bezel is costing the content the space it is supposed to be demonstrating.
// ---------------------------------------------------------------------------------------------

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

const NAV = [
  { key: "home", label: "Home", path: "/app", icon: Home, end: true },
  { key: "rewards", label: "Rewards", path: "/app/rewards", icon: Gift },
  { key: "profile", label: "Settings", path: "/app/profile", icon: UserRound },
];

// ---------------------------------------------------------------------------------------------
// The two demo modes, and why the toggle is not the persona switcher.
//
// The persona switcher in the header moves between three products — merchant, RM, cardholder.
// This moves between two ways of showing one of them, and only one of the two is a product at
// all: "Individual" is the cardholder app, "Consolidated" is a pitch device that puts four
// people's home screens on one slide. Folding the second into the persona switcher would put a
// presentation mode next to three real interfaces as though it were a fourth, which is exactly
// the confusion the switcher exists to remove.
//
// So it sits inside the cardholder view, in the prototype chrome outside the device, next to the
// "Prototype" marker — the layer that is already understood to be scaffolding.
// ---------------------------------------------------------------------------------------------
const MODES = [
  { key: "individual", label: "Individual", path: "/app" },
  { key: "consolidated", label: "Consolidated", path: "/app/all" },
];
export const CONSOLIDATED_PATH = "/app/all";

export default function AppFrame() {
  const location = useLocation();
  const navigate = useNavigate();
  const m = useMobiusState();
  const [toast, setToast] = useState(null);
  // Which phone the individual view is showing. Initialised from the module-level value so a hop
  // out to the RM view and back does not land the presenter on the wrong cardholder mid-story.
  const [cardholderId, setHolderId] = useState(getCardholderId);
  const timer = useRef(null);
  const seq = useRef(0);

  // A counter, not a timestamp: nothing in this app reads a wall clock, and two toasts raised in
  // the same millisecond would have collided on the key anyway.
  const show = useCallback((message) => {
    seq.current += 1;
    setToast({ message, id: seq.current });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const consolidated = location.pathname === CONSOLIDATED_PATH;

  // Keyboard: the presenter must be able to reach any of the three screens without a mouse. The
  // digits are the app's own screens, so they do nothing in the consolidated view — there is one
  // screen there, and silently jumping out of it mid-sentence would be worse than not responding.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (consolidated) return;
      const n = Number(e.key);
      if (!Number.isNaN(n) && n >= 1 && n <= NAV.length) navigate(NAV[n - 1].path);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, consolidated]);

  if (!m) return null;
  const holder = m.state.cardholders[cardholderId];
  // The badge counts rewards available to redeem — the same thing the Rewards quick action on the
  // home screen counts. Two badges on the same word showing two different numbers is the kind of
  // detail that makes a prototype feel untrustworthy for no benefit.
  const unread = Object.values(m.state.offers).filter((o) => o.cardholder_id === cardholderId && o.status === "delivered").length;

  return (
    <ToastContext.Provider value={show}>
    <CardholderProvider value={cardholderId}>
      <div className="min-h-full flex flex-col bg-canvas">
        {/* ---------------------------------------------------------- prototype chrome */}
        <header className="sticky top-0 z-40 border-b border-border bg-navy text-white/85">
          <div className="max-w-container mx-auto px-4 sm:px-6 flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
            <div className="flex items-center gap-2 shrink-0">
              <Smartphone size={14} />
              <span className="text-[12px] font-semibold uppercase tracking-wide">Prototype</span>
              <span className="hidden sm:inline text-[12px] text-white/55">
                {consolidated ? "· cardholder app · four cardholders" : `· cardholder app · ${holder?.name}'s phone`}
              </span>
            </div>

            {/* The demo-mode toggle. Segmented rather than a dropdown: there are two of them, both
                fit, and a presenter mid-pitch should not have to open anything. */}
            <div className="flex items-center gap-1 rounded-lg bg-white/10 p-0.5" role="group" aria-label="Cardholder view mode">
              {MODES.map((mode) => {
                const active = mode.key === (consolidated ? "consolidated" : "individual");
                return (
                  <button
                    key={mode.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => navigate(mode.path)}
                    className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                      active ? "bg-white text-navy" : "text-white/65 hover:text-white"
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>

            {/* Whose phone. Individual view only — the consolidated view shows four at once, so
                there is nothing to choose between there.

                Two cardholders because the build now has two distribution channels, and one
                persona cannot show both: Bernice is reached by the campaign without asking, and
                Charles is the one the targeting engine excluded, who holds nothing until he
                searches. Swapping between them is how the push/pull distinction gets demonstrated
                rather than asserted. */}
            {!consolidated && (
              <div className="flex items-center gap-1 text-[12px]" role="group" aria-label="Cardholder">
                {INDIVIDUAL_CARDHOLDERS.map((p) => {
                  const active = p.id === cardholderId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={active}
                      title={p.note}
                      onClick={() => { setCardholderId(p.id); setHolderId(p.id); }}
                      className={`rounded-md px-2 py-1 font-medium ${active ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* The app's own screens. Hidden in the consolidated view, which has no screens of its
                own to offer — four home screens are the whole of it. */}
            {!consolidated && (
              <nav className="flex items-center gap-1 text-[12px]">
                {NAV.map((s, i) => (
                  <NavLink
                    key={s.key}
                    to={s.path}
                    end={s.end}
                    className={({ isActive }) =>
                      `rounded-md px-2 py-1 font-medium ${isActive ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`
                    }
                  >
                    <span className="font-num opacity-60 mr-1">{i + 1}</span>
                    {s.label}
                  </NavLink>
                ))}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <MockDataBadge />
              <PersonaSwitcher tone="dark" />
            </div>
          </div>
        </header>

        {/* ---------------------------------------------------------- the app itself */}
        {/* One phone, or four. The consolidated view draws its own tiles and their bezels, so it
            is rendered wide and unframed here rather than inside a device that would be a fifth
            frame around four. The bottom nav goes with the single phone for the same reason: it
            is the app's navigation, and there is no one app on that screen to navigate. */}
        {consolidated ? (
          <main className="flex-1">
            <div key={location.pathname} className="screen-enter">
              <Outlet context={{ toast: show }} />
            </div>
          </main>
        ) : (
          <main className="flex-1 flex justify-center px-0 sm:px-6 py-0 sm:py-8">
            <div className="w-full max-w-[420px] sm:rounded-[36px] sm:border-8 sm:border-ink sm:shadow-card-hover overflow-hidden bg-white">
              <div className="sm:rounded-[28px] overflow-hidden flex flex-col min-h-[100dvh] sm:min-h-[760px]">
                <div key={location.pathname} className="flex-1 screen-enter">
                  <Outlet context={{ toast: show }} />
                </div>
                <BottomNav unread={unread} />
              </div>
            </div>
          </main>
        )}

        <footer className="border-t border-border bg-white">
          <div className="max-w-container mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 justify-between">
            <ScaleDisclosure />
            {!consolidated && (
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-ink-light">
                <span className="kbd">1</span>–<span className="kbd">{NAV.length}</span><span>jump to screen</span>
              </div>
            )}
            {/* The same reset as the merchant and RM chromes: one shared event log, so the control
                has to be reachable from whichever view the presenter happens to be standing in. */}
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Reset the demo to a cold load? This clears every configuration, application and redemption made in this session and reloads the page.")) {
                  m?.resetDemoData?.();
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-ink-light hover:text-ink hover:border-ink-light"
            >
              <RotateCcw size={11} /> Reset demo data
            </button>
          </div>
        </footer>

        {/* ---------------------------------------------------------- toast, live region */}
        <div aria-live="polite" className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
          {toast && (
            <div key={toast.id} className="rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-card-hover max-w-sm text-center">
              {toast.message}
            </div>
          )}
        </div>
      </div>
    </CardholderProvider>
    </ToastContext.Provider>
  );
}

function BottomNav({ unread }) {
  return (
    <nav className="sticky bottom-0 border-t border-border bg-white/95 backdrop-blur">
      <ul className="flex">
        {NAV.map((s) => (
          <li key={s.key} className="flex-1">
            <NavLink
              to={s.path}
              end={s.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? "text-brand" : "text-ink-light hover:text-ink-secondary"}`
              }
            >
              <span className="relative">
                <s.icon size={19} strokeWidth={2} />
                {s.key === "rewards" && unread > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[15px] rounded-full bg-brand px-1 font-num text-[10px] font-bold leading-[15px] text-white text-center">
                    {unread}
                  </span>
                )}
              </span>
              {s.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
