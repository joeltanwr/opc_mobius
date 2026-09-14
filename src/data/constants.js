// -----------------------------------------------------------------------------
// The ONE constants file. Every headline figure that isn't loaded dynamically
// from public/data/*.json lives here, with a `basis` string saying where it
// came from. If a number has no basis, it must not appear in the UI.
//
// This resolves the contradictions flagged in the source write-up: cardholder
// base is the 800,000 figure (not ">1M"), engagement is the 15% base case
// (25% only ever appears labeled as an upside scenario), and the pilot length
// is the 12-16 week controlled pilot (never the 26-day hackathon survey
// window).
//
// Anything the pipeline computes belongs in public/data/*.json, not here: the
// privacy floor, the send caps, the cardholder base and the campaign arm sizes
// all ship in constants.json and allocation_summary.json with their own basis
// strings. A figure duplicated in both places drifts. The merchant funds every
// reward in full — OCBC supplies targeting, delivery and measurement, never
// money — so every cost figure here and on screen is the merchant's whole cost.
// -----------------------------------------------------------------------------

export const CONSTANTS = {
  MOCK_DATA_LABEL: {
    value: "Mock data",
    basis: "Entire dataset is synthetically generated (data-generator/generate.py, seed=42). No real cardholder or merchant records anywhere in this build.",
  },

  TOTAL_OCBC_CARDHOLDERS: {
    value: 800_000,
    display: "800,000",
    basis: "OCBC's stated active cardholder base — the resolved figure, not the unsupported \">1M\" claim in earlier drafts.",
  },

  BASE_ENGAGEMENT_RATE: {
    value: 0.15,
    display: "15%",
    basis: "Base-case assumption for cardholders reachable and responsive to a merchant offer in a given campaign window.",
  },

  UPSIDE_ENGAGEMENT_RATE: {
    value: 0.25,
    display: "25%",
    basis: "Upside scenario only — shown labeled, never as the base case.",
    isUpside: true,
  },

  PILOT_LENGTH_WEEKS: {
    value: [12, 16],
    display: "12–16 weeks",
    basis: "Controlled pilot length. The 26-day figure elsewhere in the source material describes the hackathon-period survey window, not the pilot itself, and is not used here.",
  },

  MIN_SEGMENT_SIZE: {
    value: 250,
    display: "250",
    basis: "Privacy floor enforced in data-generator/generate.py (MIN_SEGMENT_SIZE) and re-enforced at render time — segments below this never show a size or profile, only a suppressed state.",
  },

  ANNUAL_LLM_COST_CEILING: {
    value: 1000,
    display: "< S$1,000 / year",
    basis: "LLM calls scale with the number of decisions a human reviews (segment names, gap explanations, offer copy) — never with transaction volume — at pilot scale (~50-100 merchants).",
  },

};

// Nav labels are short because the chrome is one row and the type is fixed at 14px — the design
// system's floor for anything meant to be read off a projector. Width comes out of the words,
// never out of the type.
//
// The real constraint is a measured budget, not a character count: at the 1280px container the
// header row has 1232px, of which the logo lockup takes ~193px, the cardholder link ~86px and the
// gaps 48px. Measured at seven entries the nav uses 578px of the ~905px available, leaving ~327px
// spare. Adding an entry or lengthening a label is fine while that stays positive; check it in the
// browser rather than estimating, because the last time this overflowed it clipped a label to
// "Reward s" and nothing failed loudly.
// Order is the demo sequence, walked left to right with the arrow keys.
//
// Screen 1 is the merchant's whole story and ends in the application. Screens 2 and 3 are the
// evidence under the two numbers it shows, placed immediately after it because that is when a
// sceptical reviewer asks for them — and before screen 4, where the merchant commits budget.
// Screens 4 and 5 walk the campaign up the ladder; 6 covers the merchants this cannot help yet.
//
// Retired: "Your view" (screen 1's trading summary, absorbed into Target customer along with the
// exact-versus-floored contrast it alone used to make) and "RM handoff" (its six ranked reward
// types duplicated Target customer's, its handoff is now the APPLY event, and its incrementality
// block moved next to the reward ranking it explains).
export const SCREENS = [
  { key: "target-customer", num: 1, label: "Target customer", path: "/target-customer" },
  { key: "demand-gap", num: 2, label: "Demand gap", path: "/demand-gap" },
  { key: "opportunity", num: 3, label: "Segments", path: "/opportunity" },
  { key: "reward-setup", num: 4, label: "Set-up", path: "/reward-setup" },
  { key: "results", num: 5, label: "Results", path: "/results" },
  { key: "preview", num: 6, label: "Preview", path: "/preview" },
];

export const OPTIONAL_SCREENS = [
  { key: "consumer", num: 7, label: "Cardholder", path: "/consumer" },
];

// The screen number a view prints in its eyebrow. Derived from SCREENS so reordering the nav can
// never leave a screen announcing a number the chrome disagrees with.
export const screenNum = (key) =>
  [...SCREENS, ...OPTIONAL_SCREENS].find((s) => s.key === key)?.num ?? "";

export const HERO_MERCHANT_ID = "M0001";
export const HERO_RIVAL_MERCHANT_ID = "M0055";
export const COLD_START_MERCHANT_ID = "M0002";
export const SEASONAL_MERCHANT_ID = "M0003";
export const PROSPECT_MERCHANT_ID = "M0004";
// Fails the SME eligibility gate on its transaction score — the not-eligible state on Tab 3 has
// to be reachable in the demo, or the gate is a claim rather than a control.
export const INELIGIBLE_MERCHANT_ID = "M0010";

// The accounts Tab 3 can be loaded as. Merchant §3 asks for the first three; the fourth is the
// only way to show the eligibility gate refusing someone.
export const TAB3_ACCOUNTS = [
  { id: HERO_MERCHANT_ID, note: "OCBC-acquired, full profile" },
  { id: PROSPECT_MERCHANT_ID, note: "Not acquired by OCBC — reduced card mix" },
  { id: INELIGIBLE_MERCHANT_ID, note: "Fails the eligibility gate" },
  { id: COLD_START_MERCHANT_ID, note: "Thin history — degrades to benchmarks" },
];
