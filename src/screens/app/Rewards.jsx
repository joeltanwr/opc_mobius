import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SlidersHorizontal, X, ShieldCheck, BellOff, Undo2 } from "lucide-react";
import { useDemoData } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { RewardFeedCard, REWARD_TYPE_LABELS } from "../../components/RewardCard";
import { useCardholderId, REDEEM_WINDOWS, EXPIRY_BUCKETS, FEED_REWARD_TYPES, SORTS } from "./cardholder";
import { enrich, sortOffers, matchesFilters, EMPTY_FILTERS, countFilters } from "./offers";
import RewardChat from "./RewardChat";

// ---------------------------------------------------------------------------------------------
// Screen 2 — Rewards (customer §4).
//
// The list renders the shared RewardCard, the same component the RM's configuration preview
// renders. That is the point of it living in components/: if these two drift, the RM's preview is
// lying about what the cardholder will see.
//
// "Why these offers" sits above the list and is three lines carrying most of this system's
// defensibility with the public. It is written to be read, not clicked past.
// ---------------------------------------------------------------------------------------------

const NATURES = ["F&B", "Retail", "Services & Lifestyle", "Other"];

export default function Rewards() {
  const cardholderId = useCardholderId();
  const navigate = useNavigate();
  const { data } = useDemoData();
  const m = useMobiusState();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState("recent");
  const [panelOpen, setPanelOpen] = useState(false);
  const triggerRef = useRef(null);

  const clock = m?.state?.clock;
  const holder = m?.state?.cardholders?.[cardholderId];
  const all = useMemo(
    () => (m ? m.allOffersFor(cardholderId).map((o) => enrich(o, { profiles: data.merchantProfiles, taxonomy: data.taxonomy, clock })) : []),
    [m, data, clock]
  );

  // A category the cardholder asked to see less of drops out of the list — visibly, with a way
  // back. An interest control whose effect you cannot see is theatre (customer §5).
  const interests = holder?.profile?.interests ?? {};
  const categoryOf = (o) => data.merchantProfiles?.[o.merchant_id]?.category ?? null;
  const hiddenByInterest = all.filter((o) => interests[categoryOf(o)] === "less");
  const eligible = all.filter((o) => interests[categoryOf(o)] !== "less");

  const shown = useMemo(() => sortOffers(eligible.filter((o) => matchesFilters(o, filters)), sort), [eligible, filters, sort]);
  const active = countFilters(filters);
  const offersOff = holder && !holder.consent.offers;

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e) => { if (e.key === "Escape") { setPanelOpen(false); triggerRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  if (!m) return null;
  const toggle = (group, value) =>
    setFilters((f) => ({ ...f, [group]: f[group].includes(value) ? f[group].filter((v) => v !== value) : [...f[group], value] }));

  return (
    <div className="pb-4">
      <header className="bg-navy text-white px-5 pt-5 pb-5">
        <h1 className="text-[20px] font-bold leading-tight">Your rewards</h1>
        {/* A row of three zeros is accurate and reads as broken. A cardholder holding nothing gets
            a sentence instead of a tally of nothings. */}
        <p className="text-[12.5px] text-white/60 mt-0.5">
          {offersOff
            ? "Offers are turned off"
            : all.length === 0
              ? "Nothing here yet — ask below and we'll look"
              : `${all.filter((o) => o.availableNow).length} you can use right now · ${all.filter((o) => o.status === "delivered").length} saved · ${all.length} in total`}
        </p>
      </header>

      {/* ---------------------------------------------------------- the pull channel */}
      {/* Above "why these offers", because it answers a different question and answers it first:
          that block explains why the list below was sent to you, and this one is how you go and
          find something nobody sent. Kept inside the Rewards tab rather than given a tab of its
          own — a cardholder looking for a deal is already here.

          Shown even when offers are turned off. That switch stops OCBC marketing at them; it was
          never meant to stop them looking something up, and refusing to answer a direct question
          because of a marketing preference would be the wrong reading of it. */}
      <section className="px-4 pt-4">
        <RewardChat cardholderId={cardholderId} holder={holder} />
      </section>

      {/* ---------------------------------------------------------- 4.2 why these offers */}
      <section className="px-4 pt-4">
        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="flex items-start gap-2">
            <ShieldCheck size={15} className="text-ink-light shrink-0 mt-0.5" />
            <div className="text-[12.5px] text-ink-secondary leading-snug space-y-1.5">
              <p>These come from how you use your own OCBC card — the kinds of places you buy from, and roughly when.</p>
              <p>You turned offers on, and you can turn them off at any time.</p>
              <p>
                The businesses never get your name, your number or your card. OCBC sends you the offer; they only ever see that
                somebody redeemed one.
              </p>
              <Link to="/app/profile" className="inline-block font-semibold text-brand hover:underline">See and change what you're shown →</Link>
            </div>
          </div>
        </div>
      </section>

      {offersOff ? (
        <section className="px-4 pt-4">
          <div className="rounded-2xl border border-border bg-white p-6 text-center">
            <BellOff size={22} className="mx-auto text-ink-light" />
            <p className="text-[14px] font-semibold text-ink mt-3">Offers are off, so there's nothing here.</p>
            <p className="text-[12.5px] text-ink-secondary mt-1.5 max-w-xs mx-auto">
              You turned offers off, so we've stopped putting you in any segment and the rewards you were holding have been withdrawn.
              Nothing is sent to you and no business is told anything about you.
            </p>
            <Link to="/app/profile" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-[12.5px] font-semibold text-white">
              Turn offers back on
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* ------------------------------------------------------ 4.3/4.4 controls */}
          <section className="sticky top-0 z-20 bg-canvas/95 backdrop-blur px-4 py-3 mt-3 border-y border-border">
            <div className="flex items-center gap-2">
              <button
                ref={triggerRef}
                onClick={() => setPanelOpen((v) => !v)}
                aria-expanded={panelOpen}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold ${active ? "border-brand/50 bg-[#FDECEC] text-brand" : "border-border bg-white text-ink-secondary"}`}
              >
                <SlidersHorizontal size={13} /> Filter
                {active > 0 && <span className="font-num rounded-full bg-brand px-1.5 text-[10.5px] text-white">{active}</span>}
              </button>
              <label className="flex-1 min-w-0">
                <span className="sr-only">Sort rewards</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}
                        className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12.5px] text-ink">
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>
            <p aria-live="polite" className="text-[11.5px] text-ink-light mt-1.5">
              {shown.length} of {eligible.length} reward{eligible.length === 1 ? "" : "s"}
              {hiddenByInterest.length > 0 && ` · ${hiddenByInterest.length} hidden because you asked for less of that`}
            </p>

            {panelOpen && (
              <div className="mt-3 rounded-xl border border-border bg-white p-3 space-y-3">
                <Group legend="Business" options={NATURES} selected={filters.nature} onToggle={(v) => toggle("nature", v)} />
                <Group legend="Reward type" options={FEED_REWARD_TYPES} labels={REWARD_TYPE_LABELS} selected={filters.type} onToggle={(v) => toggle("type", v)} />
                <Group legend="When you can redeem" options={REDEEM_WINDOWS} selected={filters.redeem} onToggle={(v) => toggle("redeem", v)} />
                <Group legend="Time to expiry" options={EXPIRY_BUCKETS.map((b) => b.id)} labels={Object.fromEntries(EXPIRY_BUCKETS.map((b) => [b.id, b.label]))}
                       selected={filters.expiry} onToggle={(v) => toggle("expiry", v)} />
                <div className="flex items-center justify-between pt-1">
                  <button onClick={() => setFilters(EMPTY_FILTERS)} disabled={!active}
                          className="text-[12px] font-medium text-ink-secondary disabled:text-ink-light">Clear all</button>
                  <button onClick={() => { setPanelOpen(false); triggerRef.current?.focus(); }}
                          className="rounded-lg bg-ink px-3 py-1.5 text-[12px] font-semibold text-white">Done</button>
                </div>
              </div>
            )}
          </section>

          {/* ------------------------------------------------------ 4.1 the list */}
          <section className="px-4 pt-3 space-y-3">
            {hiddenByInterest.length > 0 && (
              <div className="rounded-lg border border-dashed border-border bg-white px-3 py-2 flex items-center gap-2">
                <p className="flex-1 text-[11.5px] text-ink-secondary">
                  {hiddenByInterest.length} reward{hiddenByInterest.length === 1 ? "" : "s"} hidden because you asked for less of{" "}
                  {[...new Set(hiddenByInterest.map((o) => o.categoryLabel ?? "that category"))].join(", ")}.
                </p>
                <button
                  onClick={() => [...new Set(hiddenByInterest.map(categoryOf))].forEach((c) =>
                    m.dispatch({ type: "INTEREST", cardholder_id: cardholderId, category: c, direction: "clear" }))}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand"
                >
                  <Undo2 size={11} /> Undo
                </button>
              </div>
            )}

            {/* Two different empties, and they were one. A cardholder nobody has sent anything to
                was being told "nothing matches those filters" and offered a Clear filters button
                for filters they had not set — the list blaming a control for a state that has
                nothing to do with it. Charles is exactly that cardholder, and his empty Rewards
                tab is the moment the pull channel earns its place, so it points at the assistant
                rather than at a button that would do nothing. */}
            {all.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white p-6 text-center">
                <p className="text-[13.5px] font-semibold text-ink">Nothing has been sent to you yet.</p>
                <p className="text-[12.5px] text-ink-secondary mt-1 max-w-xs mx-auto">
                  Offers arrive here when a business near you is running one you're a match for. You don't have to wait for
                  that — ask above for what you're after and we'll look for it.
                </p>
              </div>
            ) : shown.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white p-6 text-center">
                <p className="text-[13.5px] font-semibold text-ink">Nothing matches those filters.</p>
                <p className="text-[12.5px] text-ink-secondary mt-1">
                  You have {eligible.length} reward{eligible.length === 1 ? "" : "s"} in total — try clearing a filter to see them.
                </p>
                <button onClick={() => setFilters(EMPTY_FILTERS)} className="mt-3 rounded-lg bg-brand px-4 py-2 text-[12.5px] font-semibold text-white">
                  Clear all filters
                </button>
              </div>
            ) : (
              shown.map((o) => (
                <RewardFeedCard
                  key={o.id}
                  offer={o}
                  clock={clock}
                  highlight={o.source === "live" && o.status === "delivered"}
                  availableNow={o.availableNow}
                  onDetails={() => navigate(`/app/rewards/${encodeURIComponent(o.id)}`)}
                  onRedeem={o.availableNow ? () => navigate(`/app/redeem/${encodeURIComponent(o.id)}`) : undefined}
                />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Group({ legend, options, labels, selected, onToggle }) {
  return (
    <fieldset>
      <legend className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-light mb-1.5">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <label key={o} className={`cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-medium ${on ? "border-brand bg-[#FDECEC] text-brand" : "border-border bg-white text-ink-secondary"}`}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggle(o)} />
              {labels?.[o] ?? o}
              {on && <X size={10} className="inline ml-1" />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
