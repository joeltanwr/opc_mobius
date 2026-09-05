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

  AUTO_APPROVE_MAX_REACH: {
    value: 250,
    display: "250",
    basis: "Set equal to the minimum displayable segment size: the smallest segment a merchant can ever see auto-approves, anything larger routes to mandatory human review.",
  },

  FREQUENCY_CAP_PER_WEEK: {
    value: 1,
    display: "1 offer / cardholder / week",
    basis: "Portfolio-level send cap, enforced by OCBC at the send layer independent of any single campaign approval, so no cardholder is targeted by multiple concurrent campaigns.",
  },

  OCBC_ACQUIRED_CARD_SHARE: {
    value: 0.25,
    display: "~25%",
    basis: "Share of a hero merchant's own acquiring volume that runs on OCBC-issued cards (data-generator: TARGET_OCBC_SHARE) — the concrete version of \"you only see a quarter of your customers, we see all of them.\"",
  },

  ANNUAL_LLM_COST_CEILING: {
    value: 1000,
    display: "< S$1,000 / year",
    basis: "LLM calls scale with the number of decisions a human reviews (segment names, gap explanations, offer copy) — never with transaction volume — at pilot scale (~50-100 merchants).",
  },

  FUNDING_SPLIT_OCBC_SHARE: {
    value: 0.5,
    display: "50/50",
    basis: "Pilot-tier default funding split between OCBC and the merchant (campaign_results.json: reward_cost_ocbc_funded_sgd / reward_cost_merchant_funded_sgd).",
  },

  CAMPAIGN_TREATED_SHARE: {
    value: 0.6,
    display: "60%",
    basis: "Share of the eligible target cohort assigned to the treated group in campaign_results.json; the remainder is held out as control.",
  },
};

export const SCREENS = [
  { key: "merchant-view", num: 1, label: "Your view", path: "/merchant-view" },
  { key: "demand-gap", num: 2, label: "The demand gap", path: "/demand-gap" },
  { key: "opportunity", num: 3, label: "Opportunity panel", path: "/opportunity" },
  { key: "reward-rm", num: 4, label: "Reward & RM handoff", path: "/reward-rm" },
  { key: "results", num: 5, label: "Campaign results", path: "/results" },
  { key: "preview", num: 6, label: "Preview mode", path: "/preview" },
];

export const OPTIONAL_SCREENS = [
  { key: "consumer", num: 7, label: "Cardholder view", path: "/consumer" },
];

export const HERO_MERCHANT_ID = "M0001";
export const HERO_RIVAL_MERCHANT_ID = "M0055";
export const COLD_START_MERCHANT_ID = "M0002";
export const SEASONAL_MERCHANT_ID = "M0003";
export const PROSPECT_MERCHANT_ID = "M0004";
