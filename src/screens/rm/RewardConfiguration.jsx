import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock, RotateCcw, AlertTriangle, Send, Ban, Sparkles, CheckCircle2, Users, Radio, Ticket, ChevronRight } from "lucide-react";
import { useDemoData, merchantById, usePrivacyRules, natureOf } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { REQUIRED_TO_SUBMIT, PER_CUSTOMER_OPTIONS, PER_CUSTOMER_LIMITS, reachFromSelection, perOutletFromSelection,
         onAllocatedPool, FIELD_OWNERS } from "../../state/store.js";
import { expectedOutcome, windowLoad } from "../../state/expected.js";
import { CONSTANTS, screenNum } from "../../data/constants";
import { sgd, num, pctOf } from "../../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../../components/ui";
import { RewardFeedCard, PushNotificationCard, PhoneFrame, REWARD_TYPE_LABELS } from "../../components/RewardCard";
import { StatusPill, Th, Td } from "./rmCommon";

// ---------------------------------------------------------------------------------------------
// RM screen 3 — reward configuration (RM §5).
//
// Form on the left, the customer's own card on the right, sticky, updating as fields change. The
// preview is the shared RewardCard component the customer view renders, not a lookalike, because
// a preview that has drifted from the real card is a preview that lies.
//
// Every field is prefilled from /reward-programme-recommendation and marked as prefilled until it
// is changed; each section can be reset to the Mobius draft on its own. An RM who cannot tell
// what they changed cannot explain the result afterwards.
//
// Three numbers on this page all sound like limits and are not the same thing, so §5.5 states the
// difference on screen rather than trusting the labels: the segment is who qualifies, the reach
// cap is how many of them get contacted, the redemption limit is how many can claim.
//
// Submit starts the programme. Approval used to be a second step with a second owner and is no
// longer part of the workflow, so the button says "Submit" and claims nothing about a review. The
// check that made submitting meaningful moved with it: the reducer still refuses an incomplete
// configuration, now on the draft → active edge rather than the draft → pending one.
//
// A submitted programme reads "Live" or "In queue" depending on its start date — the same
// distinction isQueued() draws in the state module, computed here as `startsLater` so the button's
// own caption cannot disagree with the dashboard it is about to write to.
// ---------------------------------------------------------------------------------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 17 }, (_, i) => 7 + i);
const HEADLINE_BUDGET = 65;
const BODY_BUDGET = 140;

// Per-type configuration, RM §5.4. One reward per campaign; selecting a type reveals only its own
// fields, so the form never shows a cashback cap on a bundle.
const TYPE_FIELDS = {
  discount: [
    { field: "discount_pct", label: "Percentage off", suffix: "%" },
    { field: "min_spend_sgd", label: "Minimum spend", prefix: "S$" },
    { field: "max_reward_value_sgd", label: "Maximum value per redemption", prefix: "S$", required: true },
  ],
  cashback: [
    { field: "discount_pct", label: "Percentage back", suffix: "%" },
    { field: "max_reward_value_sgd", label: "Cap per transaction", prefix: "S$", required: true },
  ],
  voucher: [
    { field: "max_reward_value_sgd", label: "Amount off", prefix: "S$", required: true },
    { field: "min_spend_sgd", label: "Minimum spend", prefix: "S$" },
  ],
  spend_and_save: [
    { field: "max_reward_value_sgd", label: "Save", prefix: "S$", required: true },
    { field: "min_spend_sgd", label: "On a spend of", prefix: "S$" },
  ],
  bundle_1for1: [
    { field: "max_reward_value_sgd", label: "Value of the free item", prefix: "S$", required: true },
    { field: "bundle_quantity", label: "Quantity rule — buy N, get one" },
  ],
  overseas_fx: [],
};
const TEXT_FIELDS = { discount: "exclusions", voucher: "validity window", bundle_1for1: "which item" };

const TERMS_PRESETS = [
  "Not valid with any other promotion.",
  "One redemption per visit, at participating outlets only.",
  "Excludes retail merchandise and packaged goods.",
  "Subject to availability; the merchant may withdraw the offer at any time.",
];

// ---------------------------------------------------------------------------------------------
// The one configuration surface in the build.
//
// Written as the RM's screen 3 and now also the merchant's "Reward Configuration" tab, reached
// from the sign-up action once the eligibility gate clears. There is deliberately no second
// implementation: two configuration pages drift, and this one is the record a result is explained
// from six months later.
//
// `campaignId` and `actor` are props with a route-param fallback, so the same component serves
// both mounts. `actor` is what every CONFIGURE and ADVANCE event is attributed to, which is the
// only thing that differs between them — the field-level permissions, the segment log and the
// change log are identical either way.
// ---------------------------------------------------------------------------------------------
export default function RewardConfiguration({ campaignId: campaignIdProp, actor = "ocbc", backTo, backLabel }) {
  const params = useParams();
  const campaignId = campaignIdProp ?? params.campaignId;
  const { data } = useDemoData();
  const { floor, rounding, floorBasis } = usePrivacyRules();
  const m = useMobiusState();
  const [terms, setTerms] = useState(null);
  // The change log is collapsed by default. It is the longest block on the page and it grows with
  // every edit, so by the time a campaign is configured it pushes the submit button off the
  // screen. Declared here with the other hooks, above the early returns.
  const [logOpen, setLogOpen] = useState(false);
  if (!m) return null;
  const { state, dispatch, display, displayOf } = m;
  const c = state.campaigns[campaignId];
  if (!c) return <NotFound id={campaignId} />;

  const profile = merchantById(data.merchantProfiles, c.merchant_id);
  const ranked = data.rewardRecommendations?.[c.merchant_id]?.ranked ?? [];
  const cfg = c.configuration ?? {};
  const seg = c.segment;
  const prefill = c.prefill?.fields ?? {};
  const editable = c.status === "draft";
  const set = (field, value, note) => dispatch({ type: "CONFIGURE", campaign_id: c.id, field, value, by: actor, note });
  // A field is still the Mobius draft when nothing has been written over it since the prefill.
  const isPrefilled = (field) => field in prefill && JSON.stringify(cfg[field]) === JSON.stringify(prefill[field]);
  const changedFrom = (field) => (field in prefill && !isPrefilled(field) ? prefill[field] : null);
  const resetSection = (fields) => fields.forEach((f) => {
    if (f in prefill && !isPrefilled(f)) set(f, prefill[f], "reset to the Mobius draft");
  });

  const engagement = { low: CONSTANTS.BASE_ENGAGEMENT_RATE, high: CONSTANTS.UPSIDE_ENGAGEMENT_RATE };
  const outcome = useMemo(() => expectedOutcome({ segment: seg, configuration: cfg, profile, ranked, engagement }), [seg, cfg, profile, ranked]);
  const load = useMemo(() => windowLoad(profile, cfg.days_of_week, cfg.hours), [profile, cfg.days_of_week, cfg.hours]);
  const troughLoad = useMemo(() => windowLoad(profile, prefill.days_of_week, prefill.hours), [profile, c.prefill]);
  const missing = REQUIRED_TO_SUBMIT.filter((f) => cfg[f] == null || (Array.isArray(cfg[f]) && cfg[f].length === 0) || cfg[f] === "");
  // Whether submitting would start the programme or queue it. Date-only against the clock's own
  // day, matching isQueued() in the state module — the two must agree, or the button promises one
  // thing and the dashboard shows another the moment it is clicked.
  const startsLater = Boolean(cfg.window_start) && String(cfg.window_start).slice(0, 10) > String(state.clock).slice(0, 10);
  const lastRejection = [...state.ledger].reverse().find((e) => e.type === "REJECTED" && e.detail?.campaign_id === c.id);
  const reward = ranked.find((r) => r.type === cfg.reward_type) ?? null;
  const durationDays = cfg.window_start && cfg.window_end
    ? Math.round((Date.parse(cfg.window_end) - Date.parse(cfg.window_start)) / 86_400_000) : null;
  // Does the configured window include the demo clock's own day and hour? The same question the
  // customer view asks before enabling Redeem, asked here where the window is chosen.
  const clockParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date(state.clock));
  const clockDay = WEEKDAYS.indexOf(clockParts.find((p) => p.type === "weekday").value);
  const clockHour = Number(clockParts.find((p) => p.type === "hour").value);
  const windowIncludesToday =
    (cfg.days_of_week ?? []).includes(clockDay) &&
    (!cfg.hours || cfg.hours.length !== 2 || (clockHour >= cfg.hours[0] && clockHour < cfg.hours[1]));
  // ------------------------------------------------------------------------------------------
  // Reach follows the selection, in one place, and everything on the page reads it from here.
  //
  // The target-group checkboxes write `configuration.target_segments`; the segment itself is
  // pipeline-set and narrowed only, which is a control worth keeping — nobody authors a segment on
  // this screen. But the reach cap and the summary used to read `segment.reach` directly, so
  // picking "Loyal Customers" left both of them reporting the acquisition pool the merchant had
  // just deselected: the cap slider ran to 550 against a pool of 250, and the summary agreed with
  // it. Two panels on one page disagreeing about who qualifies.
  //
  // So the selection is resolved once, here, and the cap, the summary and the cost all read the
  // same object. The floor and the rounding are applied to the combination, not just to the parts:
  // two pools that each clear the floor can still be reported only as a rounded total.
  // ------------------------------------------------------------------------------------------
  const reachSel = useMemo(
    () => reachFromSelection(c, floor, rounding),
    [c, floor, rounding]
  );
  const perOutlet = useMemo(() => perOutletFromSelection(c, floor, rounding), [c, floor, rounding]);
  const qualifying = reachSel.total;
  // What the cap is a cap ON. Contactable, not qualifying: consent and the frequency cap have
  // already removed people the campaign can never reach, and a cap set above that number would be
  // a cap on nobody — the panel below says as much ("the cap cannot raise that figure"), so the
  // control has to honour it.
  const contactable = reachSel.contactable ?? qualifying;
  // A stored cap can also outlive the selection that justified it — switch from a 550 pool to a
  // 250 one and the old cap is above the whole group. Clamped for display either way; the reducer
  // clamps again on submit.
  const reachCap = cfg.reach_cap == null ? null : (contactable == null ? cfg.reach_cap : Math.min(cfg.reach_cap, contactable));
  const contacted = reachCap ?? contactable ?? null;

  // An application with nothing configured against it yet.
  //
  // The applied → draft transition used to belong to the RM's pending brief, which is the only
  // place that fired it. With that screen off the nav the merchant mount has to open its own
  // draft, or the configuration tab it was just sent to is a dead end.
  //
  // It stays an explicit click rather than something a page view does behind the reducer's back:
  // opening configuration is a logged, attributed transition, and a screen that mutates the
  // ladder just by being rendered would put an event in the log that nobody performed.
  if (c.status === "applied") {
    return (
      <div className="max-w-container mx-auto px-6 py-16 text-center">
        <h2 className="text-[16px] font-bold text-ink">Nothing is configured yet</h2>
        <p className="text-[13px] text-ink-secondary mt-1 max-w-lg mx-auto">
          {actor === "merchant"
            ? "Your application is in. Opening configuration is what moves it to a draft — nothing is sent to any cardholder by this, or by anything on the next screen."
            : "Configuration starts from the pending brief, with the owner on the phone. Opening it there is what moves this to a draft — that order is the product, not a formality."}
        </p>
        {actor === "merchant" ? (
          <button
            onClick={() => dispatch({ type: "ADVANCE", campaign_id: c.id, to: "draft", by: "merchant", note: "merchant opened configuration" })}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover"
          >
            Start configuring this reward
          </button>
        ) : (
          <Link to={`/rm/pending/${c.id}`} className="inline-block mt-3 text-[13px] font-semibold text-brand hover:underline">Open the brief →</Link>
        )}
      </div>
    );
  }

  const previewOffer = {
    company: c.merchant_name,
    // The same reading of "nature" the cardholder's own list uses — see natureOf().
    nature: natureOf(data, c.merchant_id),
    reward_type: cfg.reward_type,
    offer_headline: cfg.offer_headline,
    offer_terms: cfg.offer_terms,
    days_of_week: cfg.days_of_week,
    hours: cfg.hours,
    outlets_label: (cfg.outlets ?? []).length ? `${(cfg.outlets ?? []).length} outlet${cfg.outlets.length > 1 ? "s" : ""}` : null,
    expires_at: cfg.window_end ? `${cfg.window_end}T23:59:59+08:00` : null,
    status: "delivered",
  };

  // The back link and the title follow the mount. The merchant is not "configuring with the
  // owner" — it *is* the owner — and it has no portfolio to go back to.
  const back = backTo ?? (actor === "merchant" ? "/target-customer" : "/rm");
  const backText = backLabel ?? (actor === "merchant" ? "Back to your customer profile" : "Back to the portfolio");

  return (
    <div className="max-w-container mx-auto px-6 py-8">
      <Link to={back} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink mb-3">
        <ArrowLeft size={13} /> {backText}
      </Link>
      <SectionTitle
        eyebrow={`Screen ${actor === "merchant" ? screenNum("reward-configuration") : 3} · Reward configuration`}
        title={actor === "merchant" ? `${c.merchant_name} — configure your reward` : `${c.merchant_name} — configure with the owner`}
        subtitle="Prefilled from the Mobius recommendation and editable except the segment definition, which cannot be authored here. Every change is recorded, attributed and timestamped."
        right={<StatusPill campaign={c} display={display} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* ============================================================ the form */}
        <div className="min-w-0 space-y-5">

          {/* ---------------------------------------------------------- 5.1 target customer group */}
          <Section
            title="Target customer group"
            note="Choose among the pools the analysis produced. Selecting one is choosing a proposed pool, not authoring one — there is no screen in this product where a segment can be written from scratch or widened."
          >
            {/* The recommendation, labelled as such. It is the one figure in this section that does
                not move with the checkboxes — it is what Mobius proposed, kept visible so a
                merchant can see what they are departing from. The live number is the combined
                reach below, and the reach cap and summary read that one too. */}
            <div className="rounded-lg border border-border bg-canvas/50 px-4 py-3 mb-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-light mb-0.5">Mobius recommends</div>
                  <div className="text-[13px] font-semibold text-ink">{seg?.label ?? "Non-customers from the lookalike pool"}</div>
                  <p className="text-[12px] text-ink-secondary max-w-xl mt-0.5">{seg?.description}</p>
                </div>
                <div className="text-right">
                  <div className="font-num text-[28px] font-extrabold text-ink tabular-nums leading-none">{num(seg?.reach)}</div>
                  <div className="text-[11px] text-ink-light">in this pool</div>
                </div>
              </div>
            </div>

            <div className="text-[12px] font-semibold text-ink mb-1.5">The merchant's own customers, by RFM segment</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(data.allocationSummary?.retention_pools ?? {}).filter(([k]) => !k.startsWith("_")).map(([name, cell]) => {
                const suppressed = cell.suppressed !== false;
                const on = (cfg.target_segments ?? []).includes(name);
                return (
                  <label key={name} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${suppressed ? "border-dashed bg-canvas/60 text-ink-light" : on ? "border-brand/40 bg-[#FDECEC]/40" : "border-border"}`}>
                    <input type="checkbox" disabled={!editable || suppressed} checked={on}
                           onChange={() => set("target_segments", on ? cfg.target_segments.filter((x) => x !== name) : [...(cfg.target_segments ?? []), name],
                                                on ? `${name} removed from the target group` : `${name} added to the target group`)} />
                    <span className="flex-1 text-ink">{name}</span>
                    <span className="font-num tabular-nums text-[12px]">{suppressed ? <Lock size={11} className="inline" /> : num(cell.count)}</span>
                  </label>
                );
              })}
              <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${(cfg.target_segments ?? []).includes("Non-customers") ? "border-brand/40 bg-[#FDECEC]/40" : "border-border"}`}>
                <input type="checkbox" disabled={!editable} checked={(cfg.target_segments ?? []).includes("Non-customers")}
                       onChange={() => {
                         const on = (cfg.target_segments ?? []).includes("Non-customers");
                         set("target_segments", on ? cfg.target_segments.filter((x) => x !== "Non-customers") : [...(cfg.target_segments ?? []), "Non-customers"],
                             on ? "non-customer pool removed" : "non-customer pool added — the lift cohort");
                       }} />
                <span className="flex-1 text-ink font-semibold">Non-customers</span>
                <span className="font-num tabular-nums text-[12px]">{num(seg?.reach)}</span>
              </label>
            </div>

            <CombinedReach reach={reachSel} rounding={rounding} />
            <BasisNote>
              Counts are the pipeline's, already floored and rounded — a pool below the floor ships with no count at all, so this screen cannot render one.
              {" "}{floorBasis}
            </BasisNote>
          </Section>

          {/* ---------------------------------------------------------- 5.2 location */}
          <Section
            title="Outlets"
            prefilled={isPrefilled("outlets")}
            changedFrom={changedFrom("outlets")}
            onReset={editable ? () => resetSection(["outlets"]) : null}
            note="How many of the target group you have selected are reachable at each outlet. An outlet that does not clear the floor on its own is unavailable rather than shown as a small number — group it with another."
          >
            <div className="space-y-2">
              {/* The count beside each outlet follows the target group, and is location-aware in
                  the way that pool allows: catchment for people who have never been here, and the
                  outlets they actually use for people who already come in. It used to be the
                  acquisition pool's catchment figure whatever the merchant had selected. */}
              {perOutlet.map((o) => {
                const unavailable = o.state === "suppressed" || o.state === "not_computed";
                const on = (cfg.outlets ?? []).includes(o.outlet_id);
                // Selecting an outlet is choosing where the reward can be redeemed, which stays
                // possible even when its count cannot be reported. Only a cell the floor
                // suppressed takes the outlet off the table.
                const locked = o.state === "suppressed";
                return (
                  <label key={o.outlet_id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${locked ? "border-dashed bg-canvas/60" : "border-border"}`}>
                    <input type="checkbox" checked={on} disabled={!editable || locked}
                           onChange={() => set("outlets", on ? cfg.outlets.filter((x) => x !== o.outlet_id) : [...(cfg.outlets ?? []), o.outlet_id])} />
                    <span className="flex-1 text-[13px] text-ink">{o.name} <span className="text-ink-light">· District {o.district}</span></span>
                    {o.state === "ok" && (
                      <span className="font-num text-[13px] font-semibold text-ink tabular-nums">
                        {num(o.count)}{o.partial && <span className="ml-1 text-[11px] font-normal text-ink-light">at least</span>}
                      </span>
                    )}
                    {o.state === "suppressed" && (
                      <span className="inline-flex items-center gap-1 text-[12px] text-ink-light">
                        <Lock size={12} /> Below the reporting floor on its own — group it with another outlet.
                      </span>
                    )}
                    {o.state === "not_computed" && (
                      <span className="text-[12px] text-ink-light text-right max-w-[16rem] leading-snug">
                        Per-outlet counts for {o.missing.join(", ")} are not computed yet — the outlet can still be selected.
                      </span>
                    )}
                    {o.state === "none_selected" && (
                      <span className="text-[12px] text-ink-light">choose a target group above</span>
                    )}
                  </label>
                );
              })}
            </div>
            <p className="text-[11.5px] text-ink-light mt-2">
              These overlap and do not add up to your reach: someone within reach of two outlets, or who uses both, is counted at
              each. Ticking a second outlet widens where the reward can be redeemed, not how many people receive it.
            </p>
          </Section>

          {/* ---------------------------------------------------------- 5.3 timing */}
          <Section
            title="Timing"
            prefilled={isPrefilled("days_of_week") && isPrefilled("hours")}
            changedFrom={changedFrom("days_of_week") ? `${(changedFrom("days_of_week") ?? []).map((i) => WEEKDAYS[i]).join("/")}` : null}
            onReset={editable ? () => resetSection(["days_of_week", "hours"]) : null}
            note="Prefilled to the detected trough. Moving it is the main way this campaign goes wrong, so the expected value recomputes while you move it."
          >
            <div className="flex flex-wrap gap-1.5 mb-3">
              {WEEKDAYS.map((d, i) => {
                const on = (cfg.days_of_week ?? []).includes(i);
                return (
                  <button key={d} type="button" disabled={!editable}
                          onClick={() => set("days_of_week", on ? cfg.days_of_week.filter((x) => x !== i) : [...(cfg.days_of_week ?? []), i].sort((a, b) => a - b))}
                          className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium border ${on ? "bg-ink text-white border-ink" : "bg-white text-ink-secondary border-border"} disabled:opacity-60`}>
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <select value={cfg.hours?.[0] ?? ""} disabled={!editable} onChange={(e) => set("hours", [Number(e.target.value), cfg.hours?.[1] ?? Number(e.target.value) + 1])} className={selectCls}>
                  {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </Field>
              <Field label="To">
                <select value={cfg.hours?.[1] ?? ""} disabled={!editable} onChange={(e) => set("hours", [cfg.hours?.[0] ?? 7, Number(e.target.value)])} className={selectCls}>
                  {HOURS.filter((h) => h > (cfg.hours?.[0] ?? 7)).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </Field>
            </div>
            {/* The window the RM sets is the window the till applies. A window that excludes today
                means the cardholders reached today hold a card they cannot use yet — worth saying
                out loud on the page that sets it, rather than leaving it to be discovered. */}
            {!windowIncludesToday && (cfg.days_of_week ?? []).length > 0 && (
              <div className="mt-3 rounded-lg border border-info/50 bg-info-bg/50 px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle size={15} className="text-info shrink-0 mt-0.5" />
                <p className="text-[12.5px] text-ink-secondary">
                  <span className="font-semibold text-ink">This window does not include today.</span> The demo clock is{" "}
                  {new Date(state.clock).toLocaleString("en-SG", { timeZone: "Asia/Singapore", weekday: "long", hour: "2-digit", minute: "2-digit" })}, and the
                  window is {(cfg.days_of_week ?? []).map((i) => WEEKDAYS[i]).join("/")} {fmtHours(cfg.hours)}. Cardholders reached today will hold a card
                  they cannot use until the window opens. That is correct for a trough campaign — the trough is when the merchant wants them — but if you
                  need a redemption today, add today to the days above.
                </p>
              </div>
            )}
            {load.is_peak && (
              <div className="mt-3 rounded-lg border border-warning/50 bg-warning-bg/50 px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle size={15} className="text-warning shrink-0 mt-0.5" />
                <p className="text-[12.5px] text-ink-secondary">
                  <span className="font-semibold text-ink">This window is already busy.</span> It carries {pctOf(load.share_pct, 1)} of the merchant's weekly
                  transactions against {pctOf(load.typical_pct, 1)} for the same number of average slots — the recommended trough carries{" "}
                  {pctOf(troughLoad.share_pct, 1)}. A reward here mostly discounts trade the merchant was going to take anyway.
                </p>
              </div>
            )}
            {/* The expected-incremental-value box is off this screen. It was a forecast built from
                an engagement band and an incremental share — OCBC's method narrated to a merchant
                who has no way to check any of it, which is the same objection that took the
                incrementality block off Customer Profile. The busy-window warning above stays:
                that one tells the merchant something about their own trade, from their own
                transactions, and it is the warning that stops a bad window being chosen. */}
          </Section>

          {/* ---------------------------------------------------------- 5.4 reward */}
          <Section
            title="Reward — one type for this campaign"
            prefilled={isPrefilled("reward_type")}
            changedFrom={changedFrom("reward_type")}
            onReset={editable ? () => resetSection(["reward_type", "discount_pct", "max_reward_value_sgd"]) : null}
            note="All six ranked, the rejected one shown with its reason. Selecting a type reveals its own configuration and nothing else's."
          >
            <div className="space-y-2">
              {ranked.map((r) => (
                <label key={r.type} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${r.disabled ? "border-dashed bg-canvas/60 opacity-70" : cfg.reward_type === r.type ? "border-brand/40 ring-1 ring-brand/10" : "border-border"}`}>
                  <input type="radio" name="reward" className="mt-1" disabled={!editable || r.disabled} checked={cfg.reward_type === r.type}
                         onChange={() => set("reward_type", r.type, `${r.label} chosen from the ranked list`)} />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[13px] font-semibold ${r.disabled ? "text-ink-light" : "text-ink"}`}>{r.rank}. {r.label}</span>
                      {r.disabled
                        ? <Badge tone="neutral"><Ban size={10} /> ranked and rejected — {r.rejected_reason}</Badge>
                        : /* The ranking stays; the incremental share behind it does not. The rank
                             and the reason are what a merchant chooses on — the share is the
                             model's working, and a percentage they cannot audit reads as precision
                             they are being asked to take on trust. It still ranks the list. */
                          <Badge tone={r.new_or_returning === "New customer" ? "success" : "info"}>{r.new_or_returning}</Badge>}
                    </div>
                    {!r.disabled && <p className="text-[12px] text-ink-secondary mt-0.5">{r.reason}</p>}
                  </div>
                </label>
              ))}
            </div>

            {cfg.reward_type && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {(TYPE_FIELDS[cfg.reward_type] ?? []).map((f) => (
                  <Field key={f.field} label={f.label} prefilled={isPrefilled(f.field)}>
                    <NumberInput value={cfg[f.field]} disabled={!editable} onCommit={(v) => set(f.field, v)} prefix={f.prefix} suffix={f.suffix} />
                  </Field>
                ))}
                {TEXT_FIELDS[cfg.reward_type] && (
                  <Field label={TEXT_FIELDS[cfg.reward_type]} className="col-span-2">
                    <input value={cfg.type_detail ?? ""} disabled={!editable} onChange={(e) => set("type_detail", e.target.value)} className={selectCls} />
                  </Field>
                )}
              </div>
            )}

            {/* --------------------------------------------------- redemption limit + maximum cost */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 mb-2">
                  <input type="checkbox" className="mt-0.5" disabled={!editable} checked={cfg.redemption_limit != null}
                         onChange={(e) => set("redemption_limit", e.target.checked ? (c.prefill?.fields?.redemption_limit ?? 100) : null,
                                              e.target.checked ? "redemption limit on" : "redemption limit off")} />
                  <span className="text-[12.5px] text-ink">
                    <span className="font-semibold">Available to the first N customers</span>
                    <span className="block text-[11.5px] text-ink-secondary">The merchant's real cost control. Off means an open-ended cost.</span>
                  </span>
                </label>
                <Field label="N — redemptions available" prefilled={isPrefilled("redemption_limit")}>
                  <NumberInput value={cfg.redemption_limit} disabled={!editable || cfg.redemption_limit == null} onCommit={(v) => set("redemption_limit", v)} />
                </Field>
              </div>
              <div className="rounded-xl border-2 border-ink px-4 py-3 self-start">
                <div className="text-[12px] font-medium text-ink-secondary">Maximum cost to the merchant — its whole cost</div>
                <div className="font-num text-[32px] font-extrabold text-ink leading-tight tabular-nums">{sgd(outcome.max_cost_sgd)}</div>
                <div className="text-[12px] text-ink-secondary">
                  {num(cfg.redemption_limit)} redemptions × {sgd(cfg.max_reward_value_sgd, 2)} maximum value each
                </div>
                <BasisNote>
                  OCBC supplies targeting, delivery and measurement; the merchant pays for the reward. Make sure the owner has heard this number before the
                  campaign goes live — it is the figure you are accountable for having made clear.
                </BasisNote>
              </div>
            </div>
          </Section>

          {/* ---------------------------------------------------------- 5.5 reach cap */}
          <Section title="Reach cap — and the two numbers it is not">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
              <Distinction icon={Users} label="Segment" value={qualifying == null ? "—" : num(qualifying)} text="Who qualifies, for the target groups selected above. Proposed by Mobius and narrowed — never authored here." />
              <Distinction icon={Radio} label="Reach cap" value={reachCap == null ? "not capped" : num(reachCap)} text="How many of them get contacted — for when the budget will not stretch to the whole recommendation." emphasis />
              <Distinction icon={Ticket} label="Redemption limit" value={cfg.redemption_limit == null ? "off" : num(cfg.redemption_limit)} text="How many can actually claim it once contacted." />
            </div>
            {qualifying == null ? (
              <p className="text-[12.5px] text-ink-secondary">
                {reachSel.refused
                  ? "The selected groups are too small to run, so there is nothing to cap. Add a pool above."
                  : "Choose a target customer group above and the cap applies to it."}
              </p>
            ) : (
              <>
                {/* The slider's ceiling is the current selection, not the segment the pipeline
                    proposed. A cap above the pool it caps is not a cap. */}
                {/* The cap belongs to OCBC (FIELD_OWNERS). On the merchant's mount the slider was
                    live but every move was refused by the reducer and logged as a rejection at the
                    bottom of the page — a control that looks available and silently is not. It is
                    disabled here with the reason said out loud instead. The permission itself is
                    unchanged; this only stops the screen implying otherwise. */}
                <Field label={`Contact at most — rounded to ${rounding}, never below ${floor}`}>
                  <input
                    type="range" min={floor} max={contactable} step={rounding}
                    disabled={!editable || !FIELD_OWNERS.reach_cap.includes(actor)}
                    value={reachCap ?? contactable}
                    onChange={(e) => set("reach_cap", Number(e.target.value), "reach cap moved — narrowing by another name, so the floor and the rounding apply")}
                    className="w-full accent-[#ED1C24] disabled:opacity-50"
                  />
                </Field>
                {editable && !FIELD_OWNERS.reach_cap.includes(actor) && (
                  <p className="text-[11.5px] text-ink-light -mt-1 mb-1">
                    Your relationship manager sets the contact cap. Your own cost control is the redemption limit above, which
                    bounds what you can spend however many people are contacted.
                  </p>
                )}
                {/* Counted against who can be reached, with qualifying named beside it. Saying
                    "N of the 550 who qualify" while the other 150 were never reachable made the
                    cap look like it was excluding people it had nothing to do with. */}
                <p className="font-num text-[13px] text-ink tabular-nums">
                  Contacting <span className="font-bold">{num(contacted)}</span> of the {num(contactable)} who can be reached
                  {qualifying != null && contactable != null && contactable < qualifying && (
                    <span className="text-ink-secondary"> ({num(qualifying)} qualify)</span>
                  )}
                  {reachCap != null && contactable != null && reachCap < contactable && (
                    <span className="text-ink-secondary"> — {num(contactable - reachCap)} reachable and will not be contacted</span>
                  )}
                </p>
              </>
            )}
            {/* Qualifying versus contactable, for the groups actually selected.
                This read `seg.reach` and `c.reach` directly, so it went on reporting the
                acquisition pool's 550 and 400 whatever the merchant had picked — the third place
                on this page to keep answering for a selection nobody had made any more.
                Both numbers now come from the same derivation as the cap and the summary.

                The removals underneath are the allocation's own, so they are only named when the
                selection is still the pool the pipeline allocated for. A retention pool arrives
                consent-filtered but has never been through the frequency cap, and saying
                otherwise would be borrowing one pool's arithmetic for another's. */}
            {qualifying != null && reachSel.contactable != null && reachSel.contactable < qualifying && (
              <div className="mt-2 rounded-lg border border-info/40 bg-info-bg/40 px-3 py-2.5">
                <p className="text-[12.5px] text-ink-secondary">
                  <span className="font-semibold text-ink">
                    Of the {num(qualifying)} who qualify, {num(reachSel.contactable)} can actually be contacted.{" "}
                  </span>
                  {onAllocatedPool(c) ? (
                    <>
                      Consent filtering runs before segmentation, not after it: {num(c.allocation?.removed?.consent)} of them have offers
                      turned off, and {num(c.allocation?.removed?.frequency_cap)} are already holding the maximum concurrent offers the
                      portfolio frequency cap allows ({c.allocation?.frequency_cap?.offers_per_30_days} per cardholder per 30 days
                      {c.allocation?.frequency_cap?.provisional ? ", provisional" : ""}). The cap below cannot raise that figure — it can
                      only tighten it further.
                    </>
                  ) : (
                    <>
                      The difference is consent: cardholders with offers turned off are filtered out before a segment is formed. The cap
                      below cannot raise this figure — it can only tighten it further.
                    </>
                  )}
                  {!reachSel.contactable_exact && (
                    <> This selection includes existing-customer pools, which are consent-filtered but have not been run against the
                      portfolio frequency cap — so the figure above is an upper bound on what a send would reach.</>
                  )}
                </p>
              </div>
            )}
            <div className="mt-2 rounded-lg border border-border bg-canvas/50 px-3 py-2.5">
              <p className="text-[12.5px] text-ink-secondary">
                <span className="font-semibold text-ink">Who gets left out, and how they were chosen: </span>
                {data.allocationSummary?.ranking_rule}. You will be asked this, so it is stated rather than implied. The slider cannot go below the floor and
                moves in steps of {rounding}; a cap is a narrowing by another name and carries the same two rules.
              </p>
            </div>
          </Section>

          {/* ---------------------------------------------------------- 5.6 frequency and dates */}
          <Section title="Frequency and dates" note="Two different things are called frequency in the source spec. They are labelled apart here because they will otherwise be confused on stage.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Redemption frequency — how often one customer may claim">
                <select value={cfg.per_customer_limit ?? ""} disabled={!editable} onChange={(e) => set("per_customer_limit", e.target.value)} className={selectCls}>
                  {PER_CUSTOMER_OPTIONS.map((k) => <option key={k} value={k}>{PER_CUSTOMER_LIMITS[k].label}</option>)}
                </select>
              </Field>
              <Field label="Promotion frequency — how often the offer resurfaces in the feed">
                <select value={cfg.promotion_frequency ?? "once"} disabled={!editable} onChange={(e) => set("promotion_frequency", e.target.value)} className={selectCls}>
                  <option value="once">Once, when the campaign opens</option>
                  <option value="weekly">Weekly while the campaign runs</option>
                </select>
              </Field>
            </div>
            <p className="text-[11.5px] text-ink-light mt-1.5">
              Promotion frequency is bounded by the global cap of {state.caps.push_per_week} pushes per cardholder per week
              {state.caps.provisional.push_per_week && <span className="ml-1 rounded bg-canvas border border-border px-1 py-0.5 text-ink-secondary">provisional</span>}
              {" "}across every merchant — resurfacing in the feed is not a push and is not capped the same way.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Start date" prefilled={isPrefilled("window_start")}>
                <input type="date" value={cfg.window_start ?? ""} disabled={!editable} onChange={(e) => set("window_start", e.target.value)} className={selectCls} />
              </Field>
              <Field label="Expiry date" prefilled={isPrefilled("window_end")}>
                <input type="date" value={cfg.window_end ?? ""} disabled={!editable} onChange={(e) => set("window_end", e.target.value)} className={selectCls} />
              </Field>
            </div>
            <p className="font-num text-[12.5px] text-ink-secondary mt-1.5 tabular-nums">Duration {durationDays === null ? "—" : `${durationDays} days`}</p>
            {durationDays !== null && durationDays < 14 && (
              <div className="mt-2 rounded-lg border border-warning/50 bg-warning-bg/50 px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                <p className="text-[12.5px] text-ink-secondary">
                  <span className="font-semibold text-ink">Too short to measure.</span> {durationDays} days will not accumulate enough redemptions to separate
                  the treated group from the control, so the result will be a redemption count with no incrementality behind it — the one number this product
                  exists to avoid reporting alone.
                </p>
              </div>
            )}
          </Section>

          {/* ---------------------------------------------------------- 5.7 terms, message, channel */}
          <Section title="Terms, message and channel">
            <Field label="Terms and exclusions">
              <textarea
                rows={3} disabled={!editable}
                value={terms ?? cfg.offer_terms ?? ""}
                onChange={(e) => setTerms(e.target.value)}
                onBlur={() => { if (terms !== null && terms !== cfg.offer_terms) set("offer_terms", terms); setTerms(null); }}
                className={`${selectCls} leading-snug`}
              />
            </Field>
            <p className="text-[11.5px] text-ink-light mt-1">
              The window you have set is{" "}
              <span className="font-medium text-ink-secondary">{(cfg.days_of_week ?? []).map((i) => WEEKDAYS[i]).join("/") || "—"} {fmtHours(cfg.hours)}</span>.
              The terms above are printed on the cardholder's card next to it — if they name a different window, the card contradicts itself.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TERMS_PRESETS.map((t) => (
                <button key={t} type="button" disabled={!editable}
                        onClick={() => set("offer_terms", `${cfg.offer_terms ? `${cfg.offer_terms} ` : ""}${t}`, "preset term inserted")}
                        className="rounded-md border border-border bg-white px-2 py-1 text-[11.5px] text-ink-secondary hover:text-ink disabled:opacity-50">
                  + {t}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 mt-4">
              <Field label="Notification headline" prefilled={isPrefilled("offer_headline")} budget={{ used: (cfg.offer_headline ?? "").length, max: HEADLINE_BUDGET }}>
                <input value={cfg.offer_headline ?? ""} disabled={!editable} maxLength={HEADLINE_BUDGET}
                       onChange={(e) => set("offer_headline", e.target.value)} className={selectCls} />
              </Field>
              <Field label="Notification body — the push copy, written separately from the feed card" budget={{ used: (cfg.push_body ?? "").length, max: BODY_BUDGET }}>
                <input value={cfg.push_body ?? ""} disabled={!editable} maxLength={BODY_BUDGET}
                       onChange={(e) => set("push_body", e.target.value)} className={selectCls}
                       placeholder="What the cardholder reads on the lock screen" />
              </Field>
            </div>

            {/* ------------------------------------------------------- how it reaches the cardholder */}
            {/* The push grant control is gone. Whether a cardholder receives a push is that
                cardholder's own consent, filtered upstream in the allocator before this campaign
                has a recipient list at all — it was never the merchant's to give, and a checkbox on
                a merchant's screen saying "grant push notification" implied they could give it on
                somebody else's behalf. What is left is a statement of how delivery works, which is
                true and which the merchant does need to know when writing the copy above.

                The reducer still carries `push_granted` and the RM-side flow can still set it; only
                this merchant-facing control and its summary line are gone. */}
            <div className="mt-4 rounded-lg border border-border px-3 py-2.5 text-[13px] text-ink">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked readOnly disabled /> In-app offer feed <span className="text-ink-light">— always included</span>
              </div>
              <p className="text-[12px] text-ink-secondary mt-1.5">
                Some cardholders will also get a phone notification. That is their own notification setting and OCBC's
                frequency cap — no more than {state.caps.push_per_week} pushes per cardholder per week across every merchant on the
                platform — so it is decided per person at send time, not here. Everyone in the segment gets the offer in their
                feed either way, which is why the copy above matters more than the notification does.
              </p>
            </div>
          </Section>

          {/* ---------------------------------------------------------- 5.9 submit */}
          <Card className="p-6 border-ink/20">
            <h3 className="text-[15px] font-bold text-ink mb-3">Summary — read this back to the owner before anything happens</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-[13px]">
              {/* Segment and reach follow the target groups ticked above, through the same
                  derivation the reach cap reads. This row used to print the pipeline's original
                  recommendation whatever the merchant had since selected, which made the summary
                  they are asked to read back to the owner the one part of the page that was out
                  of date. Both components are shown when both are selected: swapping an
                  acquisition pool for an existing-customer one is the change most worth seeing
                  here, and a single total hides it. */}
              <Row
                k="Segment and reach"
                v={reachSel.selected.length === 0
                  ? "no target group selected"
                  : reachSel.refused
                    ? `${reachSel.label} · too small to run`
                    : `${reachSel.label} · ${num(qualifying)} qualify, contacting ${num(contacted)}`}
              />
              {reachSel.prospective != null && reachSel.existing != null && (
                <Row k="— of which" v={`${num(reachSel.prospective)} prospective, ${num(reachSel.existing)} existing customers`} />
              )}
              <Row k="Reward" v={reward ? `${reward.label} — ${cfg.discount_pct ?? "—"}% up to ${sgd(cfg.max_reward_value_sgd, 2)}` : "not chosen"} />
              <Row k="Window" v={`${(cfg.days_of_week ?? []).map((i) => WEEKDAYS[i]).join("/") || "—"} ${fmtHours(cfg.hours)}`} />
              <Row k="Dates" v={`${cfg.window_start ?? "—"} to ${cfg.window_end ?? "—"} (${durationDays ?? "—"} days)`} />
              <Row k="Outlets" v={(cfg.outlets ?? []).map((id) => seg?.per_outlet?.find((o) => o.outlet_id === id)?.name ?? id).join(", ") || "none"} />
              {/* No push line. Whether a cardholder gets a notification is their setting and the
                  frequency cap, decided per person at send time — not a thing the merchant is
                  agreeing to here, so it does not belong in what they read back to the owner. */}
              <Row k="Channel" v="In-app offer feed" />
              <Row k="Limit" v={cfg.redemption_limit == null ? "no redemption limit" : `first ${num(cfg.redemption_limit)} customers, ${PER_CUSTOMER_LIMITS[cfg.per_customer_limit]?.label ?? "no per-customer rule"}`} />
              <Row k="Maximum cost to the merchant" v={`${sgd(outcome.max_cost_sgd)} — its whole cost`} strong />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {/* Submit starts the programme. Approval was a separate step with a separate owner
                  until it came out of the workflow; what is left is one act by one party, so the
                  button says what it does and nothing promises a review that will not happen.
                  The completeness check that used to guard the `pending` edge now guards this one
                  — see the reducer — so an incomplete configuration is still refused. */}
              {c.status === "draft" && (
                <button disabled={missing.length > 0}
                        onClick={() => dispatch({ type: "ADVANCE", campaign_id: c.id, to: "active", by: actor,
                                                  push_granted: Boolean(cfg.push_granted),
                                                  note: actor === "merchant" ? "configured and submitted by the merchant" : "configured with the owner and submitted" })}
                        className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">
                  <Send size={15} /> Submit
                </button>
              )}
              {c.status === "draft" && missing.length === 0 && (
                <span className="text-[12px] text-ink-secondary">
                  {startsLater
                    ? `Starts ${cfg.window_start} — it will sit in the queue until then.`
                    : "Starts today — it goes live on your dashboard as soon as you submit."}
                </span>
              )}
              {c.status === "pending" && (
                <div className="w-full rounded-lg border-2 border-brand/40 bg-[#FDECEC]/40 px-4 py-3">
                  <p className="text-[13px] font-semibold text-ink">Submitted — awaiting approval.</p>
                  <p className="text-[12.5px] text-ink-secondary mt-0.5 mb-3">
                    This campaign was submitted into the approval step, which is no longer part of the workflow. Nothing new arrives here; the control is
                    kept so a campaign already sitting in this state can still be moved on rather than stranded.
                  </p>
                  <button
                    onClick={() => dispatch({ type: "ADVANCE", campaign_id: c.id, to: "active", by: "ocbc", push_granted: Boolean(cfg.push_granted), note: "approved by OCBC" })}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover">
                    <CheckCircle2 size={15} /> Set the campaign live
                  </button>
                </div>
              )}
              {/* Where "watch the result" points depends on who is reading. The merchant goes to
                  their own Reward Dashboard; only the RM is sent to an /rm route. This used to
                  send everyone to the RM's campaign detail, which mattered little while the RM
                  was the one submitting and matters a great deal now that the merchant is. */}
              {["active", "capped", "stopped", "completed"].includes(c.status) && (
                <p className="text-[12.5px] text-ink-secondary">
                  {displayOf(c)}. Configuration is frozen; watch the result on{" "}
                  {actor === "merchant"
                    ? <Link to="/results" className="font-semibold text-brand hover:underline">your Reward Dashboard</Link>
                    : <Link to={`/rm/campaign/${c.id}`} className="font-semibold text-brand hover:underline">the campaign detail</Link>}.
                </p>
              )}
              {missing.length > 0 && c.status === "draft" && <span className="text-[12px] text-ink-secondary">Missing: {missing.map((f) => f.replace(/_/g, " ")).join(", ")}</span>}
              {lastRejection && <span className="text-[12px] text-brand">Refused: {lastRejection.reason}</span>}
            </div>
          </Card>

          {/* ---------------------------------------------------------- the record */}
          {/* Collapsed, not hidden.
              The record used to say of itself that it was "on the page, not behind a tab", and the
              point behind that is worth keeping: a merchant must never have to go looking to find
              out whether their configuration was logged. So what collapses is the rows, never the
              fact — the header states the promise and counts the entries whether it is open or
              shut, and a log with something in it says so before anyone clicks. */}
          <Card className={logOpen ? "border-ink/20" : ""}>
            <button
              type="button"
              onClick={() => setLogOpen((v) => !v)}
              aria-expanded={logOpen}
              className="w-full flex items-start gap-3 px-6 py-4 text-left rounded-xl hover:bg-canvas/50 transition-colors"
            >
              <ChevronRight size={16} className={`shrink-0 mt-0.5 text-ink-light transition-transform ${logOpen ? "rotate-90" : ""}`} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold text-ink">Every change, attributed and timestamped</span>
                  {/* Neutral either way. An empty log on a campaign nobody has configured yet is
                      the normal state, not a fault, and an amber badge would say otherwise. */}
                  <Badge tone="neutral">
                    {c.changes.length ? `${num(c.changes.length)} recorded` : "nothing recorded yet"}
                  </Badge>
                </span>
                <span className="block text-[12.5px] text-ink-secondary mt-0.5">
                  This record is the reason a result can be explained in six months.{" "}
                  {logOpen ? "Every edit, who made it and when." : "Open it to read every edit, who made it and when."}
                </span>
              </span>
            </button>

            {logOpen && (
              <div className="px-6 pb-6 pt-1 border-t border-border">
                {c.changes.length === 0 ? (
                  <p className="text-[12.5px] text-ink-light pt-3">
                    Nothing has been changed yet. Every edit from here on is recorded with its field, its old and new value,
                    who made it and when.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-border"><Th>When</Th><Th>By</Th><Th>Field</Th><Th>Change</Th><Th>Basis / note</Th></tr></thead>
                      <tbody>
                        {c.changes.map((ch, i) => (
                          <tr key={i} className="border-b border-border/60">
                            <Td className="font-num text-ink-secondary tabular-nums whitespace-nowrap">{fmtAt(ch.at)}</Td>
                            <Td><Badge tone={ch.by === "mobius" ? "analytics" : ch.by === "ocbc" ? "info" : "neutral"}>{ch.by}</Badge></Td>
                            <Td className="text-ink">{ch.field.replace(/_/g, " ")}</Td>
                            <Td className="font-num text-ink tabular-nums">{fmtVal(ch.from)} <span className="text-ink-light">→</span> {fmtVal(ch.to)}</Td>
                            <Td className="text-ink-secondary">{ch.note}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* ============================================================ 5.8 the live preview */}
        <aside className="lg:sticky lg:top-24 self-start">
          <div className="text-[12px] font-semibold text-ink mb-2">What the cardholder sees</div>
          <PhoneFrame caption="The same component the customer view renders. If this drifts from the real card, the preview is lying — so there is only one of it.">
            {/* Shown as delivered on the merchant's mount. With the grant control gone,
                `push_granted` is false for every merchant-configured campaign, so keying the
                preview to it would have printed "withheld" on every single one — a certainty
                where the truth is "some of them, decided per cardholder at send time". The RM's
                mount still previews the withheld state, because there it reflects a decision
                somebody actually made. */}
            <PushNotificationCard
              headline={cfg.offer_headline}
              body={cfg.push_body}
              merchantName={c.merchant_name}
              suppressed={actor !== "merchant" && !cfg.push_granted}
            />
            <RewardFeedCard offer={previewOffer} clock={state.clock} highlight />
          </PhoneFrame>
          <p className="text-[11px] text-ink-light mt-3 leading-snug">
            Two surfaces, previewed separately because they are different artefacts: the feed card everyone in the segment gets, and the phone
            notification, which reaches only those cardholders whose own settings allow it and who are under the weekly cap.
            {actor !== "merchant" && !cfg.push_granted && " Push is not granted, so the notification above is shown as it would be withheld."}
          </p>
        </aside>
      </div>
    </div>
  );
}

// A form section with the prefill marker and its own reset — RM §5 asks for both per section.
function Section({ title, note, prefilled, changedFrom, onReset, children }) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h3 className="text-[15px] font-bold text-ink">{title}</h3>
        <div className="flex items-center gap-2">
          {prefilled && <Badge tone="analytics"><Sparkles size={10} /> Mobius draft</Badge>}
          {changedFrom !== null && changedFrom !== undefined && (
            <Badge tone="warning">changed from the draft ({fmtVal(changedFrom)})</Badge>
          )}
          {onReset && (
            <button onClick={onReset} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-secondary hover:text-ink">
              <RotateCcw size={11} /> Reset to the Mobius draft
            </button>
          )}
        </div>
      </div>
      {note && <p className="text-[12.5px] text-ink-secondary mb-3 max-w-3xl">{note}</p>}
      {children}
    </Card>
  );
}

// Live combined reach across the selected pools, floored and rounded — RM §5.1. A selection that
// lands below the floor is refused and the count is not reported, because the count is the leak.
function CombinedReach({ reach, rounding }) {
  const selected = reach.selected;
  const shown = reach.total;

  return (
    <div className={`mt-3 rounded-lg border px-4 py-3 ${selected.length && shown === null ? "border-warning/50 bg-warning-bg/50" : "border-border bg-canvas/50"}`}>
      {selected.length === 0 ? (
        <p className="text-[12.5px] text-ink-secondary">No pool selected yet — combined reach appears here and updates as you choose.</p>
      ) : shown === null ? (
        <p className="text-[12.5px] text-ink">
          <span className="font-semibold">That selection is too small to run.</span> It falls below the reporting floor, so it is refused — and the size it
          would have been is not reported, because reporting it is the leak the floor exists to close. Add a pool.
        </p>
      ) : (
        <p className="font-num text-[13px] text-ink tabular-nums">
          Combined reach <span className="text-[20px] font-extrabold">{num(shown)}</span>{" "}
          <span className="text-ink-secondary">cardholders across {selected.length} pool{selected.length > 1 ? "s" : ""}, rounded to {rounding}</span>
          {reach.prospective != null && reach.existing != null && (
            <span className="block text-[12px] text-ink-secondary mt-0.5">
              {num(reach.prospective)} prospective · {num(reach.existing)} existing customers
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function Distinction({ icon: Icon, label, value, text, emphasis }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${emphasis ? "border-ink/30 bg-canvas" : "border-border"}`}>
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
        <Icon size={12} /> {label}
      </div>
      <div className="font-num text-[19px] font-bold text-ink tabular-nums leading-tight mt-1">{value}</div>
      <p className="text-[11.5px] text-ink-secondary mt-0.5 leading-snug">{text}</p>
    </div>
  );
}

const selectCls = "w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-[13px] text-ink disabled:bg-canvas disabled:text-ink-secondary focus:outline-none focus:ring-2 focus:ring-brand/30";

function Field({ label, prefilled, budget, className = "", children }) {
  return (
    <label className={`block ${className}`}>
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-secondary mb-1">
        {label}
        {prefilled && <Sparkles size={10} className="text-analytics" title="Prefilled by Mobius and unchanged" />}
        {budget && (
          <span className={`ml-auto font-num tabular-nums ${budget.used > budget.max * 0.9 ? "text-warning" : "text-ink-light"}`}>
            {budget.used}/{budget.max}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function NumberInput({ value, disabled, onCommit, prefix, suffix }) {
  const [draft, setDraft] = useState(null);
  return (
    <div className="flex items-center rounded-lg border border-border bg-white px-2.5 text-[13px] focus-within:ring-2 focus-within:ring-brand/30">
      {prefix && <span className="text-ink-light mr-1">{prefix}</span>}
      <input type="number" min="0" step="any" value={draft ?? (value ?? "")} disabled={disabled}
             onChange={(e) => setDraft(e.target.value)}
             onBlur={() => { if (draft !== null && draft !== "" && Number(draft) !== Number(value)) onCommit(Number(draft)); setDraft(null); }}
             onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
             className="w-full py-1.5 font-num tabular-nums text-ink bg-transparent focus:outline-none disabled:text-ink-secondary" />
      {suffix && <span className="text-ink-light ml-1">{suffix}</span>}
    </div>
  );
}

function Row({ k, v, strong }) {
  return (
    <div className="flex gap-3 py-1 border-b border-border/60">
      <span className="w-48 shrink-0 text-ink-secondary">{k}</span>
      <span className={`font-num tabular-nums ${strong ? "font-bold text-ink" : "text-ink"}`}>{v}</span>
    </div>
  );
}

function NotFound({ id }) {
  return (
    <div className="max-w-container mx-auto px-6 py-16 text-center">
      <p className="text-[14px] font-semibold text-ink">No campaign with the id {id}.</p>
      <Link to="/rm" className="text-[13px] font-medium text-brand hover:underline">Back to the portfolio</Link>
    </div>
  );
}

const fmtHours = (h) => (h && h.length === 2 ? `${String(h[0]).padStart(2, "0")}:00–${String(h[1]).padStart(2, "0")}:00` : "—");
const fmtAt = (at) => (at ? new Date(at).toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtVal = (v) => (v === null || v === undefined ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
