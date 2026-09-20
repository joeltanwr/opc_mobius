import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, MapPin, Bell, BellOff, ThumbsUp, ThumbsDown, Undo2 } from "lucide-react";
import { useDemoData } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { useToast } from "./AppFrame";
import { useCardholderId } from "./cardholder";
import { pct, num } from "../../data/format";
import PersonaCard from "../../components/PersonaCard";

// ---------------------------------------------------------------------------------------------
// Screen 3 — spending profile and preferences (customer §5).
//
// The consent surface, and the answer to the question a judge will ask. It is the one place in
// the whole system where individual-level detail is the right thing to render, because the person
// reading it is the person it describes. Everywhere else — merchant, RM — the same cardholder is
// a count inside a cohort.
//
// Every control here is real: turning offers off empties the feed and withdraws the cards, an
// interest change moves the rewards list on the next render, and the push cap is stated as a
// commitment rather than left to be discovered.
// ---------------------------------------------------------------------------------------------

const TOP_N = 6;

export default function Preferences() {
  const cardholderId = useCardholderId();
  const { data } = useDemoData();
  const m = useMobiusState();
  const toast = useToast();
  if (!m) return null;
  const { state, dispatch } = m;
  const holder = state.cardholders[cardholderId];
  const persona = (data.showcasePersonas ?? []).find((p) => p.id === cardholderId) ?? null;
  const labelOf = (id) => data.taxonomy?.categories?.find((c) => c.id === id)?.label ?? id;
  const weights = Object.entries(holder.profile.category_weights).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]);
  const top = weights.slice(0, TOP_N);

  // The interest controls are listed over the categories she actually has rewards in, ahead of the
  // categories she merely spends in. A control that changes nothing visible is theatre (customer
  // §5), and her biggest spending category is an online marketplace that sends her no offers at
  // all — putting that at the top of the list would have made the whole control look dead.
  const offerCategoryCounts = Object.values(state.offers)
    .filter((o) => o.cardholder_id === cardholderId)
    .reduce((acc, o) => {
      const c = data.merchantProfiles?.[o.merchant_id]?.category;
      if (c) acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
  const interestRows = [
    ...Object.keys(offerCategoryCounts).sort((a, b) => offerCategoryCounts[b] - offerCategoryCounts[a]),
    ...top.map(([id]) => id).filter((id) => !(id in offerCategoryCounts)),
  ].slice(0, 8);
  const dayparts = Object.entries(holder.profile.daypart_availability ?? {}).sort((a, b) => b[1] - a[1]);
  const interests = holder.profile.interests ?? {};
  const held = Object.values(state.offers).filter((o) => o.cardholder_id === cardholderId && o.status === "delivered").length;

  const setInterest = (categoryId, direction) => {
    dispatch({ type: "INTEREST", cardholder_id: cardholderId, category: categoryId, direction });
    toast(direction === "clear"
      ? `Back to normal for ${labelOf(categoryId)}.`
      : `You'll see ${direction} ${labelOf(categoryId).toLowerCase()} offers. Your rewards list has already changed.`);
  };

  return (
    <div className="pb-6">
      <header className="bg-navy text-white px-5 pt-5 pb-5">
        <h1 className="text-[20px] font-bold leading-tight">You and your offers</h1>
        <p className="text-[12.5px] text-white/60 mt-0.5">What we know, what we show you, and how to stop it.</p>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {/* ---------------------------------------------------------- their own profile */}
        <section className="rounded-2xl border border-border bg-white p-4">
          <h2 className="text-[13.5px] font-bold text-ink">What your card says about you</h2>
          <p className="text-[12px] text-ink-secondary mt-0.5 mb-3">
            Your own spending, shown back to you. This is the only screen in the system where anyone sees it at this level of
            detail — because it's yours.
          </p>
          <ul className="space-y-1.5">
            {top.map(([id, w]) => (
              <li key={id}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-ink">{labelOf(id)}</span>
                  <span className="font-num tabular-nums text-ink-secondary">{pct(w, 0)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-canvas border border-border overflow-hidden">
                  <div className="h-full bg-navy" style={{ width: `${Math.min(100, (w / top[0][1]) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] text-ink-light mt-3">
            You usually spend in the {dayparts[0]?.[0]} ({pct(dayparts[0]?.[1] ?? 0, 0)} of the time), around District{" "}
            {holder.profile.work_district ?? holder.profile.home_district} and District {holder.profile.home_district}. That is what
            "nearby" means when we say an offer is nearby.
          </p>
          {holder.profile.last_redemption && (
            <p className="text-[11.5px] text-ink-secondary mt-2 rounded-lg border border-border bg-canvas px-3 py-2">
              Your last redemption moved {labelOf(holder.profile.last_redemption.category)} from{" "}
              <span className="font-num">{pct(holder.profile.last_redemption.weight_before, 1)}</span> to{" "}
              <span className="font-num">{pct(holder.profile.last_redemption.weight_after, 1)}</span> — that is the whole of what
              "we learn from your redemptions" means here.
            </p>
          )}
        </section>

        {/* ---------------------------------------------------------- interest controls */}
        <section className="rounded-2xl border border-border bg-white p-4">
          <h2 className="text-[13.5px] font-bold text-ink">More of this, less of that</h2>
          <p className="text-[12px] text-ink-secondary mt-0.5 mb-3">Changes your rewards list straight away, not next month.</p>
          <ul className="space-y-1.5">
            {interestRows.map((id) => {
              const choice = interests[id];
              const n = offerCategoryCounts[id] ?? 0;
              return (
                <li key={id} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-[12.5px] text-ink truncate">
                    {labelOf(id)}
                    <span className="text-ink-light"> · {n === 0 ? "no rewards yet" : `${n} reward${n === 1 ? "" : "s"}`}</span>
                  </span>
                  {choice && (
                    <button onClick={() => setInterest(id, "clear")} className="text-[11px] font-medium text-ink-light hover:text-ink inline-flex items-center gap-0.5">
                      <Undo2 size={10} /> reset
                    </button>
                  )}
                  <button onClick={() => setInterest(id, "more")} aria-label={`More ${labelOf(id)} offers`}
                          className={`rounded-lg border px-2 py-1 ${choice === "more" ? "border-success bg-success-bg text-success" : "border-border text-ink-light"}`}>
                    <ThumbsUp size={13} />
                  </button>
                  <button onClick={() => setInterest(id, "less")} aria-label={`Fewer ${labelOf(id)} offers`}
                          className={`rounded-lg border px-2 py-1 ${choice === "less" ? "border-warning bg-warning-bg text-warning" : "border-border text-ink-light"}`}>
                    <ThumbsDown size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------------------------------------------------------- notifications + the cap */}
        <section className="rounded-2xl border border-border bg-white p-4">
          <h2 className="text-[13.5px] font-bold text-ink mb-2">Notifications</h2>
          <Toggle
            on={holder.consent.push}
            label="Push notifications"
            detail={`At most ${state.caps.push_per_week} a week, across every business on the platform. That is a limit we hold ourselves to, not a setting you have to find.`}
            onChange={(v) => { dispatch({ type: "PUSH_PREF", cardholder_id: cardholderId, push: v }); toast(v ? "Push notifications on." : "Push off. Offers still appear in your Rewards."); }}
          />
          <p className="text-[11.5px] text-ink-light mt-2">
            With push off, offers still arrive in your Rewards list — we just don't interrupt you. You've had{" "}
            <span className="font-num">{num(holder.pushes_this_week)}</span> of {state.caps.push_per_week} this week.
          </p>
        </section>

        {/* ---------------------------------------------------------- location relevance */}
        <section className="rounded-2xl border border-border bg-white p-4">
          <h2 className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink mb-2"><MapPin size={14} className="text-ink-light" /> Location relevance</h2>
          <Toggle
            on={holder.consent.location}
            label="Match offers to where I usually am"
            detail="On by default, deliberately: without it you'd get offers from businesses you can't walk to, which is more offers and worse ones. It uses the districts your card is already used in — never live location."
            onChange={(v) => { dispatch({ type: "LOCATION_PREF", cardholder_id: cardholderId, location: v }); toast(v ? "Offers will be matched to your area." : "Location matching off. It applies to new offers, not the ones you're holding."); }}
          />
        </section>

        {/* ---------------------------------------------------------- the consent control */}
        <section className={`rounded-2xl border p-4 ${holder.consent.offers ? "border-border bg-white" : "border-brand/40 bg-[#FDECEC]/40"}`}>
          <h2 className="text-[13.5px] font-bold text-ink mb-1">Offers altogether</h2>
          {holder.consent.offers ? (
            <>
              <p className="text-[12.5px] text-ink-secondary leading-snug">
                You're in. Turning this off takes you out of every future segment, empties your rewards list and withdraws the{" "}
                <span className="font-num">{num(held)}</span> reward{held === 1 ? "" : "s"} you're holding. Nothing is shared with any
                business either way.
              </p>
              <button
                onClick={() => { dispatch({ type: "OFFERS_OFF", cardholder_id: cardholderId }); toast("Offers are off. Your rewards list is empty."); }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand bg-white px-3.5 py-2 text-[12.5px] font-semibold text-brand"
              >
                <BellOff size={13} /> Turn offers off
              </button>
            </>
          ) : (
            <>
              <p className="text-[12.5px] text-ink-secondary leading-snug">
                Offers are off. You're not in any segment and nothing will be sent to you. Rewards you were holding were withdrawn —
                turning offers back on doesn't bring those back, but you'll be eligible for new ones.
              </p>
              <button
                onClick={() => { dispatch({ type: "OFFERS_ON", cardholder_id: cardholderId }); toast("Offers are back on."); }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white"
              >
                <Bell size={13} /> Turn offers back on
              </button>
            </>
          )}
        </section>

        {/* ---------------------------------------------------------- who this is */}
        {persona && (
          <section>
            <p className="text-[11.5px] font-semibold text-ink-secondary mb-1.5">Who is holding this phone</p>
            <PersonaCard persona={persona} emphasis />
            <p className="flex items-start gap-2 text-[11px] text-ink-light leading-snug mt-2 px-1">
              <ShieldCheck size={12} className="shrink-0 mt-0.5" />
              <span>
                Her name, age and pattern are on her own screen because they are hers. Every business in this system sees a cohort
                and a count — never this card. <Link to="/rm" className="underline">The bank's own screens</Link> don't show it either.
              </span>
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, label, detail, onChange }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <div className="text-[12.5px] font-semibold text-ink">{label}</div>
        <p className="text-[11.5px] text-ink-secondary leading-snug mt-0.5">{detail}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${on ? "bg-success border-success" : "bg-canvas border-border"}`}
      >
        <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
