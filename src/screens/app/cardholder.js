import { createContext, useContext } from "react";

// The logged-in cardholder. Brief §2 names Kelly as the one the customer view is shown as: the
// push she receives is the campaign the merchant configured and the RM approved, which is what
// makes it one campaign seen from three sides rather than three unrelated demos.
export const CARDHOLDER_ID = "kelly";

// ----------------------------------------------------------------------------------------------
// The two phones the individual view can be shown as.
//
// Kelly is the lookalike: she is in the Hanami acquisition cohort, so the campaign reaches her
// without her asking. Jieru is a recent first-time Hanami customer (RFM Promising). She holds no
// other offers, so her Rewards tab is empty until the campaign reaches her or she asks the
// assistant for something redeemable near her.
// ----------------------------------------------------------------------------------------------
export const INDIVIDUAL_CARDHOLDERS = [
  { id: "kelly", label: "Kelly", note: "In the target segment — the campaign reached her" },
  { id: "jieru", label: "Jieru", note: "Recent first-time customer — holds nothing until the campaign or a search finds her something" },
];

// Module-level, for the same reason the persona switcher's route memory is: hopping to the RM view
// to fire the allocator and back unmounts this whole chrome, and a presenter who was halfway
// through Jieru's story should not land back on Kelly's phone.
let currentCardholder = CARDHOLDER_ID;
export const getCardholderId = () => currentCardholder;
export const setCardholderId = (id) => { currentCardholder = id; };

const CardholderContext = createContext(CARDHOLDER_ID);
export const CardholderProvider = CardholderContext.Provider;
export const useCardholderId = () => useContext(CardholderContext);

// The filter groups (customer §4.3). Business nature comes from the shipped taxonomy's own groups
// rather than a hand-written list: the prompt names F&B / Hospitality / Travel, but this dataset
// has no hotel or travel merchants and inventing two empty chips would break the same section's
// rule that every chip returns something. Reward types are the five that can reach a feed —
// overseas/FX never does in this build, and Points is not a type.
export const REDEEM_WINDOWS = ["Now", "Weekdays", "Weekends", "Anytime"];
export const EXPIRY_BUCKETS = [
  { id: "7", label: "Within 7 days", max: 7 },
  { id: "30", label: "Within 30 days", max: 30 },
  { id: "30+", label: "More than 30 days", max: Infinity },
];
export const FEED_REWARD_TYPES = ["discount", "cashback", "voucher", "spend_and_save", "bundle_1for1"];

export const SORTS = [
  { id: "recent", label: "Most recent" },
  { id: "expiring", label: "Expiring soon" },
  { id: "now", label: "Available to redeem now" },
  { id: "az", label: "Company A–Z" },
];
