import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { QrCode, Send, LineChart, Gift, Grid3x3, LifeBuoy, Lock, Bell, ChevronRight, X } from "lucide-react";
import { useDemoData } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { useToast } from "./AppFrame";
import { CARDHOLDER_ID } from "./cardholder";
import { enrich } from "./offers";

// ---------------------------------------------------------------------------------------------
// Screen 1 — banking home (customer §3).
//
// The offer arrives in the middle of ordinary banking, which is the whole point. This is not a
// rewards app home screen: the greeting, the quick actions and the log-in card are what the
// cardholder came for, and the offer is the thing that happens to be there.
//
// The push card is live. Before the RM fires the trigger there is no notification and the screen
// says so quietly; the moment it fires, the card appears here without a reload, because both
// screens are reading the same event log.
// ---------------------------------------------------------------------------------------------

const QUICK = [
  { key: "scan", label: "Scan & Pay", icon: QrCode },
  { key: "paynow", label: "PayNow", icon: Send },
  { key: "wealth", label: "Wealth Insights", icon: LineChart },
  { key: "rewards", label: "Rewards", icon: Gift, to: "/app/rewards" },
  { key: "more", label: "More", icon: Grid3x3 },
  { key: "support", label: "Support", icon: LifeBuoy },
];

export default function BankingHome() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data } = useDemoData();
  const m = useMobiusState();
  const [dismissed, setDismissed] = useState([]);
  if (!m) return null;
  const { state, allOffersFor } = m;
  const holder = state.cardholders[CARDHOLDER_ID];
  const offers = allOffersFor(CARDHOLDER_ID).map((o) => enrich(o, { profiles: data.merchantProfiles, taxonomy: data.taxonomy, clock: state.clock }));
  const live = offers.filter((o) => o.status === "delivered");

  // The newest push that has actually arrived, and has not been dismissed on this screen.
  const notification = [...(holder?.notifications ?? [])].reverse().find((n) => !dismissed.includes(n.offer_id)) ?? null;
  const pushed = notification ? offers.find((o) => o.id === notification.offer_id) ?? null : null;
  const newest = live.length ? live.reduce((a, b) => (String(b.delivered_at ?? "") > String(a.delivered_at ?? "") ? b : a)) : null;

  return (
    <div className="pb-4">
      {/* ---------------------------------------------------------- flat slate header */}
      <header className="bg-navy text-white px-5 pt-5 pb-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-brand flex items-center justify-center">
              <span className="text-white font-bold text-[11px]">O</span>
            </div>
            <span className="font-bold text-[14px] tracking-tight">OCBC</span>
          </div>
          <Bell size={17} className="text-white/70" />
        </div>
        <h1 className="mt-5 text-[22px] font-bold leading-tight">Good afternoon, {holder?.name}</h1>
        <p className="text-[12.5px] text-white/60 mt-0.5">Friday 11 September, 3:12pm</p>
      </header>

      <div className="px-4 -mt-4 space-y-3">
        {/* ---------------------------------------------------------- the push, when it arrives */}
        {pushed ? (
          <section className="rounded-2xl border-2 border-brand/40 bg-white shadow-card p-4" aria-live="polite">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand">
                <Bell size={12} /> New offer
              </span>
              <button onClick={() => { setDismissed([...dismissed, notification.offer_id]); toast("Dismissed. The offer is still in your Rewards."); }}
                      aria-label="Dismiss this notification" className="text-ink-light hover:text-ink">
                <X size={15} />
              </button>
            </div>
            <p className="text-[14px] font-bold text-ink leading-snug">{pushed.offer_headline}</p>
            <p className="text-[12.5px] text-ink-secondary leading-snug mt-1">
              From {pushed.company}{pushed.district ? `, District ${pushed.district}` : ""}
              {pushed.categoryLabel ? ` · ${pushed.categoryLabel}` : ""}.
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => navigate(`/app/rewards/${encodeURIComponent(pushed.id)}`)}
                      className="flex-1 rounded-lg bg-brand py-2 text-[12.5px] font-semibold text-white">
                View the offer
              </button>
              <button onClick={() => { setDismissed([...dismissed, notification.offer_id]); toast("Dismissed. The offer is still in your Rewards."); }}
                      className="flex-1 rounded-lg border border-border bg-white py-2 text-[12.5px] font-semibold text-ink-secondary">
                Not now
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-white shadow-card p-4">
            <p className="text-[13px] font-semibold text-ink">No new offers right now.</p>
            <p className="text-[12.5px] text-ink-secondary mt-0.5">
              {live.length > 0
                ? `You have ${live.length} reward${live.length === 1 ? "" : "s"} waiting in Rewards.`
                : "Anything OCBC sends you shows up here and in Rewards."}
            </p>
            {newest && (
              <Link to={`/app/rewards/${encodeURIComponent(newest.id)}`} className="mt-2.5 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <Gift size={15} className="text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-semibold text-ink truncate">{newest.offer_headline}</span>
                  <span className="block text-[11.5px] text-ink-light truncate">{newest.company}</span>
                </span>
                <ChevronRight size={15} className="text-ink-light shrink-0" />
              </Link>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------- quick actions */}
        <section className="rounded-2xl border border-border bg-white shadow-card p-4">
          <h2 className="sr-only">Quick actions</h2>
          <ul className="grid grid-cols-3 gap-y-4">
            {QUICK.map((q) => (
              <li key={q.key}>
                <button
                  onClick={() => (q.to ? navigate(q.to) : toast(`${q.label} is outside this prototype — only Rewards is built.`))}
                  className="w-full flex flex-col items-center gap-1.5 text-center"
                >
                  <span className="relative h-11 w-11 rounded-full bg-canvas border border-border flex items-center justify-center">
                    <q.icon size={18} className="text-ink-secondary" />
                    {q.key === "rewards" && live.length > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] rounded-full bg-brand px-1 font-num text-[10.5px] font-bold leading-[18px] text-white">
                        {live.length}
                      </span>
                    )}
                  </span>
                  <span className="text-[11.5px] font-medium text-ink-secondary leading-tight">{q.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------- mock log-in */}
        <section className="rounded-2xl border border-border bg-white shadow-card p-4">
          <div className="flex items-start gap-2.5">
            <Lock size={15} className="text-ink-light shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-[13px] font-semibold text-ink">Log in to see your balances</h2>
              <p className="text-[12px] text-ink-secondary mt-0.5">
                Your rewards are here without logging in. Balances and transactions are not.
              </p>
            </div>
          </div>
          <button onClick={() => toast("This prototype collects no credentials — there is no password field to submit.")}
                  className="mt-3 w-full rounded-lg border border-border bg-canvas py-2 text-[12.5px] font-semibold text-ink-secondary">
            Log in
          </button>
          <p className="text-[11px] text-ink-light mt-2">
            No password is collected anywhere in this prototype. There is no field to type one into.
          </p>
        </section>
      </div>
    </div>
  );
}
