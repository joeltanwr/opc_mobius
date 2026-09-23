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
// strings. A figure duplicated in both places drifts — and this file used to
// contradict that sentence by redeclaring the cardholder base and the privacy
// floor a few lines below it. Both are gone; read them with usePrivacyRules()
// or constantOf(), which go to the manifest. The merchant funds every
// reward in full — OCBC supplies targeting, delivery and measurement, never
// money — so every cost figure here and on screen is the merchant's whole cost.
// -----------------------------------------------------------------------------

export const CONSTANTS = {
  MOCK_DATA_LABEL: {
    value: "Mock data",
    basis: "Entire dataset is synthetically generated (data-generator/generate.py, seed=42). No real cardholder or merchant records anywhere in this build.",
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

  // ---------------------------------------------------------------------------
  // Deck-facing, deliberately. Both figures are real, both carry a basis, and
  // neither belongs on a merchant's screen: a merchant has no use for how long
  // OCBC's controlled pilot runs or what OCBC's inference bill comes to. They
  // answer questions a judge asks, not questions a merchant asks, so they live
  // here for the write-up and the Q&A rather than being wired into a component.
  // Not dead code — do not delete them for being unreferenced.
  // ---------------------------------------------------------------------------
  PILOT_LENGTH_WEEKS: {
    value: [12, 16],
    display: "12–16 weeks",
    basis: "Controlled pilot length. The 26-day figure elsewhere in the source material describes the hackathon-period survey window, not the pilot itself, and is not used here.",
  },

  // The pending queue's failure mode is a row that quietly grows old, so the RM view ages a row
  // once it passes this. The number is not invented for the interface: it is the promise already
  // made to the merchant when the application was confirmed.
  RM_CONTACT_PROMISE_DAYS: {
    value: 7,
    display: "within the week",
    basis: "The application confirmation tells the merchant a relationship manager will be in touch within the week (campaign_results.json applied[].rm_message, merchant prompt \u00a76). A pending row past seven days has outlived the promise the merchant was given, which is why the row ages rather than staying quiet.",
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
// The real constraint is a measured budget, not a character count. Last measured in the browser at
// a 1280px viewport with the four-tab set and Reward Configuration unlocked: the nav row used
// 757px of the ~905px available (Overview 99, Customer Profile & Reward Programme 299, Reward
// Configuration 182, Reward Dashboard 164), leaving ~148px spare. Adding an entry or lengthening
// a label is fine while that stays positive; re-measure in the browser rather than estimating,
// because the last time this overflowed it clipped a label to "Reward s" and nothing failed
// loudly.
//
// Since that measurement the second label shortened to "Customer Profile", which gives back
// roughly half its width and takes the row well clear. The figures above are left as the last
// real measurement rather than adjusted by arithmetic — an estimate written in the slot where a
// measurement belongs is how this stops being a budget.
// Order is the demo sequence, walked left to right with the arrow keys.
//
// Retired: "Your view" (screen 1's trading summary, absorbed into Customer profile along with the
// exact-versus-floored contrast it alone used to make) and "RM handoff" (its six ranked reward
// types duplicated Customer profile's, its handoff is now the APPLY event, and its incrementality
// block moved next to the reward ranking it explains).
// ----------------------------------------------------------------------------------------------
// The merchant's screens, and which of them the nav offers.
//
// `show` is about visibility, never existence:
//   always   on the nav unconditionally
//   gated    on the nav only once the merchant has applied and the eligibility gate cleared that
//            application — see rewardConfigUnlocked in state/store.js
//   extra    disconnected from the nav and from the router
//
// The `extra` screens are the Set-up page that Reward Configuration replaced, plus the demand-gap
// detector, the segment panel and the allocation preview. Nothing about them has been switched
// off and their components are untouched: the detectors still run in the pipeline, and their
// combined output is what "Customer Profile & Reward Programme" presents to the merchant.
// Flipping MERCHANT_EXTRA_SCREENS puts them all back on the nav and the router in one move,
// which is why none of this is commented out.
//
// Screen numbers are stable per key and do not renumber when visibility changes: a screen that
// prints "Screen 6" in its own eyebrow must still say 6 when it is reached with the flag on.
// The visible run is kept contiguous: 1, 2 and 4 always, 3 once Reward Configuration unlocks,
// and 5 for the hop to the cardholder app, with the disconnected screens numbered above that.
// So the digits a presenter types always match the numbers printed on the tabs.
// ----------------------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------------------
// The small light-grey provenance lines under figures and panels — <BasisNote>, and the matching
// basis line on CohortCard.
//
// Off: they were the bulk of the words on every screen, and a projector read at three metres is
// the thing this build is optimised for. The strings themselves are untouched at all 57 call
// sites, so nothing about where a figure came from has been lost from the codebase — only from
// the screen. Flip this to true for an audit or a spec review and every one of them comes back.
//
// What this does NOT switch off, because the brief requires them visible: the "Mock data" marker
// on every screen, the `provisional` tag on a provisional figure, and the scale disclosure in
// each chrome (validate.py checks the last of those renders in both).
// ----------------------------------------------------------------------------------------------
export const SHOW_BASIS_NOTES = false;

export const MERCHANT_EXTRA_SCREENS = false;

export const ALL_MERCHANT_SCREENS = [
  { key: "overview", num: 1, label: "Overview", path: "/overview", show: "always" },
  // "& Reward Programme" came off the label once Reward Configuration became a tab of its own:
  // the programme is configured there now, and this tab is the customer picture that justifies it
  // — the demand-gap output, the RFM distribution and the ranked rewards. The shorter label is
  // also ~130px of nav budget back, which the measured note above was spending on one word.
  { key: "target-customer", num: 2, label: "Customer Profile", path: "/target-customer", show: "always" },
  // The configuration page, gated. It sits third — where it appears once unlocked, not a promise
  // that it is always there. Its component is the RM view's Configure screen, reused rather than
  // reimplemented: one configuration surface now, not two that can drift apart.
  { key: "reward-configuration", num: 3, label: "Reward Configuration", path: "/reward-configuration", show: "gated" },
  { key: "results", num: 4, label: "Reward Dashboard", path: "/results", show: "always" },
  // Disconnected. reward-setup is the page Reward Configuration replaced — kept whole in the
  // codebase, off the nav and off the router, like the three below it.
  { key: "reward-setup", num: 6, label: "Set-up", path: "/reward-setup", show: "extra" },
  { key: "demand-gap", num: 7, label: "Demand gap", path: "/demand-gap", show: "extra" },
  { key: "opportunity", num: 8, label: "Segments", path: "/opportunity", show: "extra" },
  { key: "preview", num: 9, label: "Preview", path: "/preview", show: "extra" },
];
// What the nav may render. The gated entry is in this list; AppShell is what drops it until it
// unlocks, so the lock is enforced in one place rather than in every consumer of SCREENS.
export const SCREENS = ALL_MERCHANT_SCREENS.filter((s) => s.show !== "extra" || MERCHANT_EXTRA_SCREENS);

// The cardholder's app is a build of its own, not a fourth merchant tab — it has its own
// chrome, its own nav and its own audience. The merchant nav keeps a link across to it, which is
// what this entry is: a way out of the merchant view, numbered so the keyboard can reach it.
export const OPTIONAL_SCREENS = [
  { key: "consumer", num: 5, label: "Cardholder", path: "/app" },
];

// The screen number a view prints in its eyebrow. Read off the full table, not the filtered nav,
// so a screen reached while disconnected still announces its own number instead of a blank.
export const screenNum = (key) =>
  [...ALL_MERCHANT_SCREENS, ...OPTIONAL_SCREENS].find((s) => s.key === key)?.num ?? "";

// The highest number the keyboard can jump to. AppShell matches a typed digit against `num`
// rather than against a position, so a hidden gated tab does not shift the others under the
// presenter's fingers mid-pitch.
export const maxScreenNum = (screens, optional) =>
  Math.max(0, ...[...screens, ...optional].map((s) => s.num ?? 0));


// ----------------------------------------------------------------------------------------------
// The RFM segments in plain language, for the info button beside the segmentation chart.
//
// The keys are the taxonomy the pipeline actually scores into (profiles[mid].rfm.segments), so a
// segment the pipeline stops producing loses its gloss rather than showing a stale one, and a new
// one shows up unexplained rather than mislabelled. Wording is the merchant's vocabulary — what
// the segment means about their own customers — not the recency/frequency/monetary arithmetic
// behind it, which is the pipeline's business and not something an SME needs read to them.
// ----------------------------------------------------------------------------------------------
export const RFM_SEGMENT_GLOSSARY = {
  "Champions": "Bought recently, come in often, and spend the most.",
  "Loyal Customers": "Come in regularly and respond well to what you offer.",
  "Potential Loyalists": "Recent customers spending well who could become regulars.",
  "New Customers": "Bought from you for the first time very recently.",
  "Promising": "Recent first-time buyers, modest spend so far.",
  "Need Attention": "Were regular and spent above average, but it has been a while.",
  "Can't Lose Them": "Used to spend heavily and often, and have not been back for a long time.",
  "At Risk": "Spent well before, and the gap since their last visit is growing.",
  "Hibernating": "Few visits, low spend, and a long time since the last one.",
  "Lost": "The lowest spend and frequency, and away the longest.",
};
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

// The campaign the pitch walks up the ladder: applied on merchant Tab 3, configured and approved
// in the RM view, redeemed in the customer view. One id, imported by every screen that touches
// it, because three screens each holding their own string is how the demo ends up showing three
// different campaigns.
export const DEMO_CAMPAIGN_ID = "C-SJ-03";

// The completed campaign the RM nav opens by default — the measured one, so screen 4 has its full
// drill-down (control arm, redeemer profile, verdict) rather than a row of dashes.
export const RM_DETAIL_DEFAULT_CAMPAIGN = "C-SJ-02";

// ----------------------------------------------------------------------------------------------
// The RM's screens. Same `show` vocabulary as the merchant table.
//
// Pending brief and Configure are off the RM nav and off the RM router. Configure is a special
// case among the disconnected screens: its component is not parked, it is now the merchant view's
// "Reward Configuration" tab, so only the RM-side tab and route entry are hidden. Pending brief
// is fully parked — but note it was the only thing that moved a campaign applied → draft, so the
// merchant configuration page opens its own draft now (see RewardConfiguration).
//
// Consequence worth saying out loud: with both hidden there is no RM approval step anywhere in
// the demo. That reverses the logged human-in-the-loop decision and needs a talk-track line.
// ----------------------------------------------------------------------------------------------
export const RM_EXTRA_SCREENS = false;

export const ALL_RM_SCREENS = [
  { key: "rm-portfolio", num: 1, label: "Portfolio", path: "/rm", show: "always" },
  { key: "rm-campaign", num: 2, label: "Campaign detail", path: `/rm/campaign/${RM_DETAIL_DEFAULT_CAMPAIGN}`, show: "always" },
  { key: "rm-pending", num: 3, label: "Pending brief", path: `/rm/pending/${DEMO_CAMPAIGN_ID}`, show: "extra" },
  { key: "rm-configure", num: 4, label: "Configure", path: `/rm/configure/${DEMO_CAMPAIGN_ID}`, show: "extra" },
];

export const RM_SCREENS = ALL_RM_SCREENS.filter((s) => s.show !== "extra" || RM_EXTRA_SCREENS);

// -----------------------------------------------------------------------------
// The three interfaces of the one platform, named once so the persona switcher,
// the route reader and the chrome all agree on what they are called.
//
// `entry` is where a persona opens cold — the first screen of its own flow, not
// the landing card. `prefix` is how a pathname is read back to the persona that
// owns it; the merchant view has none because it owns everything left over.
// -----------------------------------------------------------------------------
export const PERSONAS = [
  { key: "merchant", label: "Merchant view", note: "SME dashboard", entry: SCREENS[0].path, prefix: null },
  { key: "rm", label: "RM view", note: "OCBC internal", entry: "/rm", prefix: "/rm" },
  { key: "cardholder", label: "Cardholder view", note: "Consumer app", entry: "/app", prefix: "/app" },
];

// Merchant first: the pitch opens there, and so does a cold load.
export const DEFAULT_PERSONA = PERSONAS[0].key;

// ----------------------------------------------------------------------------------------------
// A campaign that has been submitted but whose window has not opened yet.
//
// Not a ladder state: the campaign really is `active` — approved, frozen, allocated — it simply
// has a start date in the future, and calling it "Live" on a merchant's dashboard the week before
// it starts is the kind of small lie that gets noticed. So it is a display refinement applied at
// render time, exactly like the capped_display refinement the pipeline ships, and it lives here
// rather than in constants.json because validate.py asserts the shipped status_display has one key
// per ladder status and no more. Adding a key there would fail that check, correctly.
// ----------------------------------------------------------------------------------------------
export const QUEUED_DISPLAY = "In queue";

// ----------------------------------------------------------------------------------------------
// DEMO PRESENTATION LAYER — not the product's information architecture.
//
// The consolidated cardholder view is a pitch device: four cardholders' home screens side by side
// so a judge can watch the allocator reach two of them and not the other two. No real cardholder
// app shows four people's phones at once, and nothing about this belongs in a shipped IA. It is
// kept behind its own toggle, labelled as a demo control on screen, and every part of it reads the
// same state as the individual view rather than a parallel fixture.
//
// The four, and why each is here:
//   edwin    in Soujourner's acquisition cohort — an existing customer inside the target segment
//   bernice  in the same cohort — the lookalike who has never walked in (the acquisition case)
//   alvin    Champions, not the acquisition cohort — an existing regular the allocator leaves be
//   charles  excluded on price band — a non-customer who does not match, and is not contacted
//
// Scope is decided by cohort_membership against the campaign's cohort_tag, in store.js — the same
// rule the RM's dialog and the reducer use. This screen has no targeting logic of its own, which
// is the whole reason it is worth showing.
// ----------------------------------------------------------------------------------------------
// `chip` is the System Trace verdict label for the tile. It names the person, never the verdict:
// the tick or cross beside it is worked out from state (state/trace.js verdictFor), so a
// cardholder who turns offers off, or a campaign re-aimed at another pool, flips the mark without
// anybody editing this list.
export const CONSOLIDATED_CARDHOLDERS = [
  { id: "edwin", caption: "In segment · existing customer", chip: "In segment · existing" },
  { id: "bernice", caption: "Lookalike · not yet a customer", chip: "Lookalike" },
  { id: "alvin", caption: "Champion · outside this segment", chip: "Champion · existing customer" },
  { id: "charles", caption: "No match · not a customer", chip: "No lookalike match" },
];

// ----------------------------------------------------------------------------------------------
// DEMO LAYER — one switch for everything that exists for the pitch rather than for a user.
//
// Three things sit behind it: the consolidated cardholder view (its toggle and its route), the
// reset control in every chrome, and the System Trace drawer in the RM and cardholder views. On
// by default, so flipping it changes nothing today; off, the build shows only the three products
// themselves. Nothing behind it is deleted or commented out — same convention as the EXTRA_SCREENS
// flags above.
// ----------------------------------------------------------------------------------------------
export const DEMO_LAYER = true;

// ----------------------------------------------------------------------------------------------
// The System Trace — names and explanations for each stage of the recommender, and nothing else.
//
// No figure lives here. Every number the drawer prints is read from shared state or the loaded
// dataset by state/trace.js at render time, so the trace cannot disagree with the screen beside
// it. What is here is words: the stage names, the fixed control node, and the ⓘ text, each held
// to two sentences. Where an explanation needs a number (a cap, the rounding), trace.js reads it
// from state and appends it rather than a digit being typed into a sentence below.
//
// The strip runs in pipeline order. `sub` stages render inside their parent (Allocator is
// Consent → Freq Cap; Delivery is Push | Pull).
// ----------------------------------------------------------------------------------------------
export const TRACE = {
  badge: "DEMO LAYER · simulated trace",
  title: "System Trace",
  skipped: "segment match skipped · customer-initiated",
  nodes: {
    tagging: {
      label: "Customer Tagging",
      info: "Every active cardholder is tagged from their own card spend: category, spending frequency, local or foreign. Dormant cardholders are left out.",
    },
    sme: {
      label: "SME Analysis",
      info: "Compares each weekday slot with the merchant's own baseline to find a recurring quiet window. Also scores the merchant's existing customers into RFM segments.",
    },
    gate: {
      label: "Eligibility Gate",
      info: "Average balance must be strictly above the threshold, and the internal or external transaction score at the maximum band or better. Fail either and nothing is recommended.",
    },
    recommender: {
      label: "Reward Recommender",
      info: "Ranks all six reward types against the gap and maps the pick to a target pool. Acquisition targets lookalikes from merchant-pair lift; retention targets RFM segments.",
    },
    review: {
      label: "RM review",
      line: "prod queue · bypassed in demo",
      info: "In production every campaign waits in an RM queue before it is allocated. The demo skips the queue so the allocator can be fired live.",
    },
    allocator: {
      label: "Allocator",
      info: "Takes the candidate pool, removes anyone who opted out, then anyone already at the frequency cap. The last figure is the reach every dashboard shows, rounded.",
    },
    consent: {
      label: "Consent",
      info: "Cardholders with offers turned off are removed before anything else is decided. Turning offers off in the app moves this count live.",
    },
    cap: {
      label: "Freq Cap",
      info: "Anyone already holding the portfolio maximum of concurrent offers is left out, whichever merchant sent them.",
    },
    delivery: {
      label: "Delivery",
      info: "Push is OCBC reaching out: a feed card plus a notification, capped per week. Pull is the cardholder asking, so segment matching is skipped and only live programmes nearby come back.",
    },
    push: { label: "Push" },
    pull: { label: "Pull" },
  },
};

// ----------------------------------------------------------------------------------------------
// Edwin's weekly push cap, lifted for the demo.
//
// The shipped dataset puts Edwin at 2 of 2 pushes for the demo week, which makes him the named
// suppressed-push recipient: in scope for the campaign, delivered a feed card, and refused the
// push by the frequency cap. That is a deliberate fixture — it is his description, his role and
// his second cohort tag in showcase_personas.json.
//
// The consolidated view needs both in-scope cardholders to visibly receive the notification, so
// this drops his count to zero at seed time. Consequences, said plainly rather than discovered on
// stage: the RM's push dialog no longer names anyone as suppressed (the aggregate suppression
// count from the allocation is unaffected and still shown), and the suppressed-push demonstration
// now has no named face. Flip this to false to put the fixture back exactly as the pipeline
// shipped it.
//
// It is applied in the seed and nowhere else, so every screen agrees about Edwin. The alternative
// — overriding him only inside the consolidated view — would have shown him receiving a push on
// one screen and being refused one on another, which is worse than either state on its own.
//
// The pipeline is the proper home for this and cannot be re-run in this environment; when it can,
// move it to pipeline/config.py and delete this.
// ----------------------------------------------------------------------------------------------
export const DEMO_LIFT_EDWIN_PUSH_CAP = true;
