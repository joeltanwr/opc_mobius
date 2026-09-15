import { isRedeemableNow, daysRemaining } from "../../components/RewardCard";

// ---------------------------------------------------------------------------------------------
// One reading of a reward card, shared by the list, the detail screen and the redemption screen.
// Nothing here invents a field: the business nature is the merchant's own taxonomy group, the
// window is the campaign's own days and hours, and "now" is always the demo clock.
// ---------------------------------------------------------------------------------------------

export function enrich(offer, { data, profiles, taxonomy, clock }) {
  profiles = profiles ?? data?.merchantProfiles;
  taxonomy = taxonomy ?? data?.taxonomy;
  const profile = profiles?.[offer.merchant_id] ?? null;
  const category = taxonomy?.categories?.find((c) => c.id === profile?.category) ?? null;
  const days = offer.days_of_week ?? [];
  const set = new Set(days);
  const redeemTags = [];
  if (set.size === 7) redeemTags.push("Anytime");
  if ([0, 1, 2, 3, 4].every((d) => set.has(d)) && !set.has(5) && !set.has(6)) redeemTags.push("Weekdays");
  if (set.has(5) && set.has(6) && ![0, 1, 2, 3, 4].some((d) => set.has(d))) redeemTags.push("Weekends");
  const now = isRedeemableNow(offer, clock);
  if (now) redeemTags.unshift("Now");
  return {
    ...offer,
    company: offer.merchant_name,
    nature: category?.group ?? "Other",
    categoryLabel: category?.label ?? null,
    district: profile?.district ?? null,
    availableNow: now,
    redeemTags,
    daysLeft: daysRemaining(offer.expires_at, clock),
    isExpired: offer.status === "expired" || (offer.expires_at != null && Date.parse(offer.expires_at) < Date.parse(clock)),
  };
}

// "Why am I seeing this?" — customer §4.2 and §2. The answer has to be one a stranger would find
// reasonable, which means it has to be the real reason: the segment the pipeline built, in the
// words it built it from. Where the offer came from a campaign whose segment is not loaded, it
// falls back to the customer's own spending in that category — also true, also theirs, and still
// nothing about anybody else.
export function whyThisOffer(offer, { campaign, holder, categoryId, categoryLabel }) {
  const weight = categoryId ? holder?.profile?.category_weights?.[categoryId] : null;
  const reasons = [];
  if (campaign?.segment?.description) {
    reasons.push(campaign.segment.description.replace(/^OCBC cardholders who/, "You").replace(/None has transacted with you\.?/, "").trim());
  } else if (weight != null && weight > 0) {
    reasons.push(`You spend in ${categoryLabel ?? "this category"} on your OCBC card, and this business is in the area you usually shop in.`);
  } else {
    reasons.push(`This business matches the categories and times you usually spend in on your OCBC card.`);
  }
  if (holder?.consent?.location) reasons.push("Offers are matched to the districts you are usually in, which you can turn off.");
  return reasons.join(" ");
}

export function sortOffers(list, sortId) {
  const live = (o) => (o.isExpired || o.status === "expired" ? 1 : 0);   // expired last, under every order
  const by = {
    recent: (a, b) => String(b.delivered_at ?? "").localeCompare(String(a.delivered_at ?? "")),
    expiring: (a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9),
    now: (a, b) => Number(b.availableNow) - Number(a.availableNow),
    az: (a, b) => String(a.company ?? "").localeCompare(String(b.company ?? "")),
  }[sortId] ?? (() => 0);
  return [...list].sort((a, b) => live(a) - live(b) || by(a, b));
}

export function matchesFilters(o, f) {
  if (f.nature.length && !f.nature.includes(o.nature)) return false;
  if (f.type.length && !f.type.includes(o.reward_type)) return false;
  if (f.redeem.length && !f.redeem.some((r) => o.redeemTags.includes(r))) return false;
  if (f.expiry.length) {
    const d = o.daysLeft;
    const bucket = d == null ? null : d < 0 ? "expired" : d <= 7 ? "7" : d <= 30 ? "30" : "30+";
    if (!f.expiry.includes(bucket)) return false;
  }
  return true;
}

export const EMPTY_FILTERS = { nature: [], type: [], redeem: [], expiry: [] };
export const countFilters = (f) => f.nature.length + f.type.length + f.redeem.length + f.expiry.length;
