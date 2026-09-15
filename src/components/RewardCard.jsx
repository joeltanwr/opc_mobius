import React from "react";
import { Coffee, ShoppingBag, Sparkles, Tag, Bell, ChevronLeft, Clock, MapPin, ShieldCheck } from "lucide-react";
import { num } from "../data/format";

// ---------------------------------------------------------------------------------------------
// The reward card contract — customer prompt §8, §9; RM prompt §5.8.
//
// One component, two surfaces. The RM's configuration preview renders it, and the customer view's
// Rewards list renders the same component from the same fields. That is the whole reason it lives
// here rather than inside either screen: the customer prompt says the RM preview must match the
// customer card exactly, and two components that merely look alike today will not still match in
// three weeks. If the card changes, both sides change together or neither does.
//
// The fields are the contract from customer §8: company, business nature, reward type, the offer,
// the permitted redemption window, expiry with days remaining, and status. Anything the caller
// cannot supply renders as an honest blank, never as a placeholder value.
// ---------------------------------------------------------------------------------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const REWARD_TYPE_LABELS = {
  discount: "Discount",
  cashback: "Cashback",
  voucher: "Voucher",
  spend_and_save: "Spend & save",
  bundle_1for1: "Bundle / 1-for-1",
  overseas_fx: "Overseas / FX",
};

export function formatHours(hours) {
  return hours && hours.length === 2 ? `${String(hours[0]).padStart(2, "0")}:00–${String(hours[1]).padStart(2, "0")}:00` : null;
}

export function formatDays(days) {
  if (!days || days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a - b);
  const runs = [];
  for (const d of sorted) {
    const last = runs.at(-1);
    if (last && d === last.at(-1) + 1) last.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length > 1 ? `${WEEKDAYS[r[0]]}–${WEEKDAYS[r.at(-1)]}` : WEEKDAYS[r[0]])).join(", ");
}

// Whole days between the demo clock and an expiry date. The clock is passed in — no component
// computes "now" for itself, or the three views drift apart on stage (brief §2).
export function daysRemaining(expiryIso, clockIso) {
  if (!expiryIso || !clockIso) return null;
  return Math.ceil((Date.parse(expiryIso) - Date.parse(clockIso)) / 86_400_000);
}

// Is this card redeemable at this instant? The window is the campaign's own days and hours, and
// "now" is the demo clock — never the wall clock, or the Available-now filter quietly changes
// meaning depending on when the pitch is given.
export function isRedeemableNow(offer, clockIso) {
  if (!offer || offer.status !== "delivered" || !clockIso) return false;
  const now = new Date(Date.parse(clockIso));
  // The clock is stamped +08:00 and every window is Singapore local, so read the parts in SGT.
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(now);
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.find((p) => p.type === "weekday").value);
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const days = offer.days_of_week, hours = offer.hours;
  if (days && days.length && !days.includes(weekday)) return false;
  if (hours && hours.length === 2 && !(hour >= hours[0] && hour < hours[1])) return false;
  if (offer.expires_at && Date.parse(offer.expires_at) < now.getTime()) return false;
  return true;
}

// One icon per taxonomy group, so a hair studio does not arrive wearing a coffee cup.
const NATURE_ICON = { "F&B": Coffee, Retail: ShoppingBag, "Services & Lifestyle": Sparkles };

const STATUS_TONE = {
  delivered: { label: "Available", cls: "bg-success-bg text-success border-[#A7F3D0]" },
  redeemed: { label: "Redeemed", cls: "bg-canvas text-ink-secondary border-border" },
  closed: { label: "Fully redeemed", cls: "bg-canvas text-ink-light border-border" },
  expired: { label: "Expired", cls: "bg-canvas text-ink-light border-border" },
  withdrawn: { label: "Withdrawn", cls: "bg-canvas text-ink-light border-border" },
};

/**
 * The feed card, exactly as the cardholder sees it in the OCBC app's Rewards list.
 *
 * @param offer     {company, nature, reward_type, offer_headline, offer_terms, days_of_week, hours,
 *                   expires_at, status}
 * @param clock     the demo clock, for days remaining
 * @param onRedeem  fired by the Redeem button. Omitted in the RM's preview, where the card is a
 *                  rendering of what will be sent and nothing on it should be operable.
 * @param onDetails fired by View details.
 */
export function RewardFeedCard({ offer, clock, highlight = false, onRedeem, onDetails, availableNow = null }) {
  const days = daysRemaining(offer.expires_at, clock);
  const base = STATUS_TONE[offer.status] ?? STATUS_TONE.delivered;
  // "Available" is reserved for a card that can be used at this moment. One the cardholder holds
  // but cannot use right now is Saved — otherwise the pill and the line underneath it disagree.
  const status = offer.status === "delivered" && availableNow === false
    ? { label: "Saved", cls: "bg-canvas text-ink-secondary border-border" }
    : base;
  const Icon = NATURE_ICON[offer.nature] ?? Tag;
  const window = [formatDays(offer.days_of_week), formatHours(offer.hours)].filter(Boolean).join(" ");

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-card ${highlight ? "border-brand/50" : "border-border"}`}>
      <div className="flex items-start gap-2.5 mb-2.5">
        <div className="h-9 w-9 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-brand" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-ink leading-tight truncate">{offer.company ?? offer.merchant_name}</div>
          <div className="text-[11px] text-ink-light">
            {offer.nature ?? "—"}
            {offer.reward_type && <> · {REWARD_TYPE_LABELS[offer.reward_type] ?? offer.reward_type}</>}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${status.cls}`}>{status.label}</span>
      </div>

      <p className="text-[13.5px] font-semibold text-ink leading-snug">{offer.offer_headline ?? "Offer not written yet"}</p>
      {offer.offer_terms && <p className="text-[11.5px] text-ink-secondary leading-snug mt-1">{offer.offer_terms}</p>}

      <div className="mt-2.5 space-y-1 text-[11.5px] text-ink-secondary">
        {window && (
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-ink-light shrink-0" /> <span>Redeem {window}</span>
          </div>
        )}
        {offer.outlets_label && (
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-ink-light shrink-0" /> <span>{offer.outlets_label}</span>
          </div>
        )}
        {offer.expires_at && (
          <div className="flex items-center gap-1.5 font-num">
            {days !== null && days < 0 ? (
              <span className="text-ink-light">Expired {String(offer.expires_at).slice(0, 10)}</span>
            ) : (
              <>
                <span className="text-ink-light">Expires {String(offer.expires_at).slice(0, 10)}</span>
                {days !== null && <span className={days <= 7 ? "text-warning font-semibold" : "text-ink-secondary"}>· {num(days)} days left</span>}
              </>
            )}
          </div>
        )}
      </div>

      {availableNow === false && offer.status === "delivered" && (
        <p className="mt-2 text-[11.5px] text-ink-light">Not redeemable right now — comes back inside the window above.</p>
      )}

      <div className="mt-3 flex gap-2">
        {onDetails && (
          <button
            type="button"
            onClick={onDetails}
            className="flex-1 rounded-lg border border-border bg-white text-[12.5px] font-semibold text-ink-secondary py-2 hover:text-ink"
          >
            View details
          </button>
        )}
        <button
          type="button"
          onClick={onRedeem}
          disabled={offer.status !== "delivered" || !onRedeem}
          className="flex-1 rounded-lg bg-brand text-white text-[12.5px] font-semibold py-2 disabled:bg-canvas disabled:text-ink-light disabled:border disabled:border-border"
        >
          {offer.status === "delivered" ? "Redeem" : status.label}
        </button>
      </div>
    </div>
  );
}

/**
 * The push notification, as it lands on the lock screen. A different artefact from the feed card
 * and written separately, because the push copy is the one that gets written carelessly
 * (RM §5.8) — and the one a cardholder judges the whole idea by.
 */
export function PushNotificationCard({ headline, body, merchantName, suppressed = false }) {
  return (
    <div className={`rounded-2xl border bg-white p-3.5 shadow-card ${suppressed ? "border-dashed border-ink-light/50 opacity-70" : "border-border"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="h-5 w-5 rounded bg-brand flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-[10px]">M</span>
        </div>
        <span className="text-[11px] font-semibold text-ink-secondary">OCBC · now</span>
        {suppressed && <span className="ml-auto text-[10.5px] font-semibold text-ink-light">not sent — feed card only</span>}
      </div>
      <p className="text-[13px] font-bold text-ink leading-snug">{headline || `An offer from ${merchantName}`}</p>
      <p className="text-[12px] text-ink-secondary leading-snug mt-0.5">{body || "No push copy written yet."}</p>
    </div>
  );
}

/**
 * The phone frame both surfaces sit in. Kept here so the RM preview and the customer view cannot
 * end up rendering the same card at two different widths.
 */
export function PhoneFrame({ children, caption, time = "Today" }) {
  return (
    <div className="w-[300px] mx-auto">
      <div className="rounded-[36px] border-8 border-ink bg-ink shadow-card-hover overflow-hidden">
        <div className="bg-white rounded-[28px] overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 bg-navy text-white">
            <ChevronLeft size={16} />
            <span className="text-[12px] font-semibold">OCBC App</span>
            <Bell size={14} />
          </div>
          <div className="p-3.5 bg-canvas">
            <div className="text-[11px] text-ink-light mb-2.5">{time}</div>
            <div className="space-y-3">{children}</div>
          </div>
        </div>
      </div>
      {caption && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-light leading-snug">
          <ShieldCheck size={12} className="shrink-0 mt-0.5" />
          <span>{caption}</span>
        </p>
      )}
    </div>
  );
}
