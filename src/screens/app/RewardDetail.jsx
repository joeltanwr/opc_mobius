import React, { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ShieldCheck, HelpCircle, Clock, MapPin, CalendarX2 } from "lucide-react";
import { useDemoData } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { useCardholderId } from "./cardholder";
import { enrich, whyThisOffer } from "./offers";
import { formatDays, formatHours, REWARD_TYPE_LABELS } from "../../components/RewardCard";
import { num } from "../../data/format";

// The detail view of one reward (customer §4.1 "View details", §2 the quiet line). This is where
// "why am I seeing this?" is answered, because it is where the question gets asked.

export default function RewardDetail() {
  const cardholderId = useCardholderId();
  const { offerId } = useParams();
  const navigate = useNavigate();
  const { data } = useDemoData();
  const m = useMobiusState();
  const offer = m?.state?.offers?.[offerId] ?? null;
  const o = useMemo(
    () => (offer && m ? enrich(offer, { profiles: data.merchantProfiles, taxonomy: data.taxonomy, clock: m.state.clock }) : null),
    [offer, m, data]
  );
  if (!m) return null;
  if (!offer) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="text-[14px] font-semibold text-ink">That reward isn't in your wallet.</p>
        <Link to="/app/rewards" className="text-[13px] font-medium text-brand">Back to my rewards</Link>
      </div>
    );
  }

  const holder = m.state.cardholders[cardholderId];
  const campaign = m.state.campaigns[offer.campaign_id] ?? null;
  const categoryId = data.merchantProfiles?.[offer.merchant_id]?.category ?? null;
  const why = whyThisOffer(offer, { campaign, holder, categoryId, categoryLabel: o.categoryLabel });
  const window = [formatDays(offer.days_of_week), formatHours(offer.hours)].filter(Boolean).join(" ");
  const closed = offer.status === "closed";

  return (
    <div className="pb-6">
      <header className="bg-navy text-white px-5 pt-4 pb-5">
        <button onClick={() => navigate("/app/rewards")} className="flex items-center gap-1 text-[12.5px] text-white/70 hover:text-white mb-3">
          <ChevronLeft size={14} /> Rewards
        </button>
        <p className="text-[12px] text-white/60">{o.company}{o.categoryLabel ? ` · ${o.categoryLabel}` : ""}</p>
        <h1 className="text-[19px] font-bold leading-tight mt-0.5">{offer.offer_headline}</h1>
      </header>

      <div className="px-4 pt-4 space-y-3">
        <section className="rounded-2xl border border-border bg-white p-4 space-y-2.5">
          <Line icon={Clock} label="Redeem" value={window || "Any time the business is open"} />
          <Line icon={MapPin} label="Where" value={`${o.company}${o.district ? `, District ${o.district}` : ""}`} />
          <Line icon={CalendarX2} label="Expires"
                value={offer.expires_at
                  ? (o.daysLeft != null && o.daysLeft < 0
                      ? `Expired ${String(offer.expires_at).slice(0, 10)}`
                      : `${String(offer.expires_at).slice(0, 10)}${o.daysLeft != null ? ` · ${num(o.daysLeft)} days left` : ""}`)
                  : "—"} />
          <p className="text-[12.5px] text-ink-secondary leading-snug pt-1 border-t border-border/70">{offer.offer_terms}</p>
          <p className="text-[11.5px] text-ink-light">
            {REWARD_TYPE_LABELS[offer.reward_type] ?? offer.reward_type} · sent to your feed
            {offer.via === "push" ? " and to your phone as a notification" : " only — no push notification was sent"}.
          </p>
        </section>

        {/* ---------------------------------------------------------- why am I seeing this */}
        <section className="rounded-2xl border border-border bg-white p-4">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-ink mb-1.5">
            <HelpCircle size={14} className="text-ink-light" /> Why you're seeing this
          </h2>
          <p className="text-[12.5px] text-ink-secondary leading-snug">{why}</p>
          <p className="text-[12.5px] text-ink-secondary leading-snug mt-2">
            Nobody looked at you individually to decide this, and no part of it uses anything you'd be uncomfortable being asked about.
            You can change what you're shown, or stop it entirely, on{" "}
            <Link to="/app/profile" className="font-semibold text-brand hover:underline">your profile</Link>.
          </p>
        </section>

        {closed && offer.closed?.why && (
          <p className="rounded-lg border border-border bg-canvas px-3 py-2 text-[12.5px] text-ink-secondary">{offer.closed.why}</p>
        )}

        {offer.status === "delivered" ? (
          o.availableNow ? (
            <button onClick={() => navigate(`/app/redeem/${encodeURIComponent(offer.id)}`)}
                    className="w-full rounded-lg bg-brand py-3 text-[14px] font-bold text-white">
              Redeem
            </button>
          ) : (
            <div className="rounded-lg border border-border bg-canvas px-3 py-3 text-center">
              <p className="text-[12.5px] font-semibold text-ink">Not redeemable right now</p>
              <p className="text-[12px] text-ink-secondary mt-0.5">It's yours until it expires — come back {window.toLowerCase()}.</p>
            </div>
          )
        ) : (
          <div className="rounded-lg border border-border bg-canvas px-3 py-3 text-center text-[12.5px] text-ink-secondary">
            {offer.status === "redeemed"
              ? <>Redeemed{offer.code ? ` · code ${offer.code}` : ""}.</>
              : offer.status === "expired" ? "This reward has expired."
              : offer.status === "withdrawn" ? "Withdrawn when you turned offers off."
              : "No longer available."}
          </div>
        )}

        <p className="flex items-start gap-2 text-[11.5px] text-ink-light leading-snug px-1">
          <ShieldCheck size={13} className="shrink-0 mt-0.5" />
          <span>{o.company} sees that a redemption happened, not who you are.</span>
        </p>
      </div>
    </div>
  );
}

function Line({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} className="text-ink-light shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-[11px] text-ink-light">{label}</div>
        <div className="text-[12.5px] text-ink leading-snug">{value}</div>
      </div>
    </div>
  );
}
