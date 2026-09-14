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

// Nav labels are deliberately short. The chrome is one row at 1280px and the labels are set at
// 14px — the design system's floor for anything meaningful on a projector — so the width has to
// come out of the words, not out of the type. Keep every label at or under ten characters.
export const SCREENS = [
  { key: "merchant-view", num: 1, label: "Your view", path: "/merchant-view" },
  { key: "demand-gap", num: 2, label: "Demand gap", path: "/demand-gap" },
  { key: "target-customer", num: 3, label: "Target", path: "/target-customer" },
  { key: "opportunity", num: 4, label: "Segments", path: "/opportunity" },
  { key: "reward-rm", num: 5, label: "RM handoff", path: "/reward-rm" },
  { key: "reward-setup", num: 6, label: "Set-up", path: "/reward-setup" },
  { key: "results", num: 7, label: "Results", path: "/results" },
  { key: "preview", num: 8, label: "Preview", path: "/preview" },
];

export const OPTIONAL_SCREENS = [
  { key: "consumer", num: 9, label: "Cardholder", path: "/consumer" },
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
