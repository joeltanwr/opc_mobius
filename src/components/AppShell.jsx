import React, { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { SCREENS, OPTIONAL_SCREENS } from "../data/constants";
import { useDemoData } from "../data/DataProvider";
import PrivacyAffordance from "./PrivacyAffordance";
import { MockDataBadge } from "./ui";

const ALL_NAV = [...SCREENS, ...OPTIONAL_SCREENS];

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  // One scale disclosure for all three views, shipped by the pipeline in constants.json so the
  // sentence and the figures in it have a single source. Counts on screen are sample units.
  const { data } = useDemoData();
  const scaleDisclosure = data?.constants?.scale_disclosure;

  useEffect(() => {
    function onKeyDown(e) {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      }
      const currentIdx = SCREENS.findIndex((s) => s.path === location.pathname);

      if (e.key === "ArrowRight" || e.key === "l") {
        if (currentIdx >= 0 && currentIdx < SCREENS.length - 1) {
          navigate(SCREENS[currentIdx + 1].path);
        } else if (currentIdx === -1) {
          navigate(SCREENS[0].path);
        }
      } else if (e.key === "ArrowLeft" || e.key === "h") {
        if (currentIdx > 0) navigate(SCREENS[currentIdx - 1].path);
      } else {
        const n = Number(e.key);
        if (!Number.isNaN(n) && n >= 1 && n <= ALL_NAV.length) {
          navigate(ALL_NAV[n - 1].path);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [location.pathname, navigate]);

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="max-w-container mx-auto px-6 flex items-center h-16 gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 rounded-md bg-brand flex items-center justify-center">
              <span className="text-white font-bold text-[13px]">M</span>
            </div>
            <span className="font-bold text-[16px] text-ink tracking-tight">Mobius</span>
            <MockDataBadge className="ml-1" />
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto">
            {SCREENS.map((s) => (
              <NavLink
                key={s.key}
                to={s.path}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-[#FDECEC] text-brand"
                      : "text-ink-secondary hover:bg-canvas hover:text-ink"
                  }`
                }
              >
                <span className="font-num text-[11px] opacity-60">{s.num}</span>
                {s.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 shrink-0">
            <NavLink
              to="/consumer"
              className={({ isActive }) =>
                `text-[12px] font-medium whitespace-nowrap ${isActive ? "text-brand" : "text-ink-light hover:text-ink-secondary"}`
              }
            >
              Cardholder view →
            </NavLink>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div key={location.pathname} className="screen-enter">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-border bg-white">
        <div className="max-w-container mx-auto px-6 min-h-12 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 justify-between text-ink-light">
          <PrivacyAffordance />
          {scaleDisclosure && <p className="text-[12px] text-ink-light max-w-xl leading-snug">{scaleDisclosure}</p>}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
            <span className="kbd">←</span>
            <span className="kbd">→</span>
            <span>navigate</span>
            <span className="mx-1.5 text-border">|</span>
            <span className="kbd">1</span>–<span className="kbd">8</span>
            <span>jump to screen</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
