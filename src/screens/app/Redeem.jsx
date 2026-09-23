import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { useDemoData } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { enrich } from "./offers";
import { formatDays, formatHours, REWARD_TYPE_LABELS, isRedeemableNow } from "../../components/RewardCard";

// ---------------------------------------------------------------------------------------------
// Redemption — customer §6. The event the whole system is built around, so it gets a screen.
//
// Tapping Redeem fires the real REDEEMED event on the shared state. That single dispatch moves
// the merchant's dashboard, the RM's campaign detail and this cardholder's own profile weights,
// live, in whatever tab they happen to be open in. In the pitch this is the thirty seconds where
// the system does something instead of displaying something.
//
// What comes back is usable at a counter: a derived code (never random — two tabs replaying the
// same log must agree on it) above the terms, the merchant and the window.
// ---------------------------------------------------------------------------------------------

export default function Redeem() {
  const { offerId } = useParams();
  const navigate = useNavigate();
  const { data } = useDemoData();
  const m = useMobiusState();
  const [fired, setFired] = useState(false);

  const offer = m?.state?.offers?.[offerId] ?? null;
  const enriched = useMemo(
    () => (offer && m ? enrich(offer, { profiles: data.merchantProfiles, taxonomy: data.taxonomy, clock: m.state.clock }) : null),
    [offer, m, data]
  );

  // Fire once, on arrival. The screen IS the redemption — there is no second confirm button,
  // because the customer already pressed Redeem to get here and asking twice is not consent, it
  // is friction. A refusal from the reducer is shown in full rather than swallowed.
  useEffect(() => {
    if (!m || fired || !offer) return;
    setFired(true);
    if (offer.status !== "redeemed") m.dispatch({ type: "REDEEMED", offer_id: offerId });
    // Whether it took is read from the state on the next render, not from the return value:
    // the reducer is the authority on what happened and the ledger carries its reason.
  }, [m, offer, offerId, fired]);

  if (!m) return null;
  if (!offer) return <NotFound />;

  const refused = [...m.state.ledger].reverse().find((e) => e.type === "REJECTED" && e.event === "REDEEMED" && e.detail?.offer_id === offerId);
  const redeemed = offer.status === "redeemed";

  return (
    <div className="pb-6">
      <header className="bg-navy text-white px-5 pt-4 pb-5">
        <button onClick={() => navigate(`/app/rewards/${encodeURIComponent(offerId)}`)}
                className="flex items-center gap-1 text-[12.5px] text-white/70 hover:text-white mb-3">
          <ChevronLeft size={14} /> Back to the offer
        </button>
        <h1 className="text-[17px] font-bold leading-tight">{offer.merchant_name}</h1>
        <p className="text-[12.5px] text-white/65 mt-0.5">{offer.offer_headline}</p>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {redeemed ? (
          <>
            {/* -------------------------------------------------- the artefact at the counter */}
            <section className="rounded-2xl border-2 border-ink bg-white p-5 text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-success-bg border border-success/30 px-2.5 py-1 text-[11px] font-bold text-success">
                <CheckCircle2 size={12} /> Redeemed
              </div>
              <p className="text-[12px] text-ink-secondary mt-3">Show this at the counter</p>
              <p className="font-num text-[30px] font-extrabold tracking-[0.12em] text-ink mt-1 tabular-nums break-all">{offer.code}</p>
              <Barcode code={offer.code} />
              <p className="text-[11.5px] text-ink-light mt-2">
                Redeemed {fmtAt(offer.redeemed_at)}. One code, one redemption.
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-white p-4">
              <Row label="Business" value={`${offer.merchant_name}${enriched?.district ? `, District ${enriched.district}` : ""}`} />
              <Row label="Reward" value={`${REWARD_TYPE_LABELS[offer.reward_type] ?? offer.reward_type} — ${offer.offer_headline}`} />
              <Row label="Redeemable" value={[formatDays(offer.days_of_week), formatHours(offer.hours)].filter(Boolean).join(" ") || "Any time"} />
              <Row label="Expires" value={offer.expires_at ? String(offer.expires_at).slice(0, 10) : "—"} />
              <Row label="Terms" value={offer.offer_terms ?? "—"} last />
            </section>

            {/* The quiet line (customer §2) is said once, on the reward's detail view — not again here (round 7). */}

            <Link to="/app/rewards" className="block w-full rounded-lg bg-ink py-2.5 text-center text-[13px] font-semibold text-white">
              Back to my rewards
            </Link>
          </>
        ) : (
          <section className="rounded-2xl border border-warning/50 bg-warning-bg/50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-ink">This reward could not be redeemed.</p>
                <p className="text-[12.5px] text-ink-secondary mt-1">
                  {refused?.reason ?? describeStatus(offer, m.state.clock)}
                </p>
              </div>
            </div>
            <Link to="/app/rewards" className="mt-3 block w-full rounded-lg border border-border bg-white py-2 text-center text-[12.5px] font-semibold text-ink-secondary">
              Back to my rewards
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}

function describeStatus(offer, clock) {
  if (offer.status === "expired") return `This reward expired on ${String(offer.expires_at ?? "").slice(0, 10)}.`;
  if (offer.status === "closed") return offer.closed?.why ?? "This offer has closed.";
  if (offer.status === "withdrawn") return offer.withdrawn?.why ?? "You turned offers off, so this reward was withdrawn.";
  if (!isRedeemableNow(offer, clock)) {
    return `This reward is only redeemable ${[formatDays(offer.days_of_week), formatHours(offer.hours)].filter(Boolean).join(" ")}. It is still yours until it expires.`;
  }
  return "The reward is no longer available.";
}

// A visual artefact for the counter, drawn from the code itself — deterministic, so the same code
// always draws the same bars and nothing on this screen is random.
function Barcode({ code }) {
  const bars = [...String(code)].flatMap((ch) => {
    const n = ch.charCodeAt(0);
    return [1 + (n % 3), 1 + ((n >> 2) % 3)];
  });
  let x = 0;
  return (
    <svg viewBox={`0 0 ${bars.reduce((a, b) => a + b + 1, 0)} 26` } className="mt-3 h-14 w-full" role="img" aria-label={`Barcode for redemption code ${code}`}>
      {bars.map((w, i) => {
        const rect = <rect key={i} x={x} y="0" width={i % 2 ? 0 : w} height="26" fill="#0F172A" />;
        x += w + 1;
        return rect;
      })}
    </svg>
  );
}

function Row({ label, value, last }) {
  return (
    <div className={`flex gap-3 py-2 ${last ? "" : "border-b border-border/70"}`}>
      <span className="w-24 shrink-0 text-[12px] text-ink-secondary">{label}</span>
      <span className="text-[12.5px] text-ink leading-snug">{value}</span>
    </div>
  );
}

function NotFound() {
  return (
    <div className="px-5 py-16 text-center">
      <p className="text-[14px] font-semibold text-ink">That reward isn't in your wallet.</p>
      <Link to="/app/rewards" className="text-[13px] font-medium text-brand">Back to my rewards</Link>
    </div>
  );
}

const fmtAt = (at) => (at ? new Date(at).toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
