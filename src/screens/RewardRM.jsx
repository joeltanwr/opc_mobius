import React, { useState } from "react";
import { Check, ShieldAlert, ArrowRight, CircleUserRound } from "lucide-react";
import { useDemoData, merchantById } from "../data/DataProvider";
import { HERO_MERCHANT_ID, HERO_RIVAL_MERCHANT_ID, CONSTANTS } from "../data/constants";
import { sgd, num, pct, humanize } from "../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../components/ui";

const MECHANICS = [
  {
    id: "fixed",
    name: "Fixed-dollar cashback",
    example: "S$2 off any drink, 2–5pm",
    pro: "Simple to communicate, fully predictable cost per redemption — easiest to reason about in a first pilot.",
    con: "Less compelling on already-high tickets.",
    recommended: true,
  },
  {
    id: "pct",
    name: "Percentage cashback",
    example: "10% off the bill",
    pro: "Scales naturally with basket size.",
    con: "Cost is less predictable — a few large baskets can move the bill sharply.",
  },
  {
    id: "voucher",
    name: "Return voucher",
    example: "Visit 3×, 4th on us",
    pro: "Built for habit formation — the actual off-peak goal, not just a single visit.",
    con: "Redemption is delayed and harder to attribute to one campaign window.",
  },
  {
    id: "bundle",
    name: "Bundle",
    example: "Coffee + pastry, S$1 off combo",
    pro: "Lifts basket size, not just visit count.",
    con: "Needs merchant-side menu/ops coordination — heavier to launch.",
  },
];

export default function RewardRM() {
  const { data } = useDemoData();
  const merchant = merchantById(data.merchantDirectory, HERO_MERCHANT_ID);
  const rival = merchantById(data.merchantDirectory, HERO_RIVAL_MERCHANT_ID);
  const campaign = data.campaignResults;
  const segment = data.segments[HERO_MERCHANT_ID].find((s) => s.candidate_merchant === HERO_RIVAL_MERCHANT_ID);
  const charles = data.showcasePersonas.find((p) => p.id === "charles");
  const [confirmed, setConfirmed] = useState(false);

  const requiresReview = segment.size > CONSTANTS.AUTO_APPROVE_MAX_REACH.value;
  const organicRedeemers = Math.round(campaign.treated_size * campaign.control_organic_conversion_rate);
  const incrementalRedeemers = campaign.redemption_count - organicRedeemers;

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow="Screen 4 · Reward & RM handoff"
        title="Turning the gap into an offer — and who has to sign off"
        subtitle={`Targeting the ${num(segment.size)}-cardholder ${rival.canonical_name} lookalike segment identified on the previous screen.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {MECHANICS.map((m) => (
          <Card key={m.id} className={`p-5 ${m.recommended ? "border-brand/30 ring-1 ring-brand/10" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[14px] font-bold text-ink">{m.name}</h3>
              {m.recommended && <Badge tone="brand">Recommended & piloted</Badge>}
            </div>
            <p className="text-[12px] font-medium text-ink-secondary mb-2">"{m.example}"</p>
            <p className="text-[12.5px] text-success mb-1">+ {m.pro}</p>
            <p className="text-[12.5px] text-ink-light">– {m.con}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6 mb-6">
        <h3 className="text-[15px] font-bold text-ink mb-4">Incrementality — the part a mailing list can't do</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <IncrementalityBlock
            label="Excluded before targeting"
            value="Price-insensitive customers"
            detail={`Someone like ${charles.name} — average ticket ${humanize(charles.signature_pattern, data.merchantDirectory).match(/S\$\d+/)?.[0] ?? "S$180"}, never used a voucher — never enters this segment. His behaviour doesn't move with an incentive, so crediting his visits would overstate the campaign.`}
            icon={<CircleUserRound size={16} />}
            tone="warning"
          />
          <IncrementalityBlock
            label="Redeemed, but would have converted anyway"
            value={`${num(organicRedeemers)} of ${num(campaign.redemption_count)} redemptions`}
            detail={`Measured from the held-out control group's organic conversion rate (${pct(campaign.control_organic_conversion_rate)}), applied to the treated group.`}
            tone="neutral"
          />
          <IncrementalityBlock
            label="Real incremental transactions"
            value={num(campaign.incremental_transactions, 1)}
            detail={`${sgd(campaign.incremental_sales_sgd)} in incremental sales — the number this campaign is actually judged on.`}
            tone="success"
          />
        </div>
        <BasisNote>
          incremental_transactions and control_organic_conversion_rate: campaign_results.json (test-vs-control, not before-vs-after — full breakdown on the next screen).
        </BasisNote>
      </Card>

      <Card className="p-6 mb-6">
        <h3 className="text-[15px] font-bold text-ink mb-3">Funding split — arithmetic, not negotiation</h3>
        <div className="font-num text-[15px] text-ink bg-canvas border border-border rounded-lg px-4 py-3 inline-block">
          {sgd(campaign.reward_cost_total_sgd)} total reward cost = {sgd(campaign.reward_cost_ocbc_funded_sgd)} OCBC{" "}
          <span className="text-ink-light">+</span> {sgd(campaign.reward_cost_merchant_funded_sgd)} {merchant.canonical_name}
        </div>
        <BasisNote>{CONSTANTS.FUNDING_SPLIT_OCBC_SHARE.basis}</BasisNote>
      </Card>

      <Card className={`p-5 mb-6 flex items-start gap-3 ${requiresReview ? "border-warning/40 bg-warning-bg/40" : "border-success/40 bg-success-bg/40"}`}>
        <ShieldAlert size={18} className={requiresReview ? "text-warning shrink-0 mt-0.5" : "text-success shrink-0 mt-0.5"} />
        <div>
          <p className="text-[13px] font-semibold text-ink">
            {requiresReview ? "Above auto-approve threshold — routed to manual review" : "Within auto-approve threshold"}
          </p>
          <p className="text-[12.5px] text-ink-secondary mt-0.5">
            Reach of {num(segment.size)} cardholders exceeds the {num(CONSTANTS.AUTO_APPROVE_MAX_REACH.value)}-cardholder
            auto-approve limit, so an OCBC reviewer signs off on segment, offer and cost share before anything sends. A
            portfolio-level frequency cap ({CONSTANTS.FREQUENCY_CAP_PER_WEEK.display}) applies underneath every approval, enforced by OCBC at
            the send layer — no single reviewer can see every other campaign reaching the same cardholder that week.
          </p>
        </div>
      </Card>

      <Card className="p-6 border-navy/10 bg-navy text-white">
        {!confirmed ? (
          <>
            <h3 className="text-[16px] font-bold mb-1">Your OCBC relationship manager receives:</h3>
            <ul className="text-[13px] text-white/80 mt-3 space-y-1.5">
              <li>• A qualified demand gap: {num(segment.size)} cardholders, {sgd(segment.size * CONSTANTS.BASE_ENGAGEMENT_RATE.value * data.merchantProfiles[HERO_MERCHANT_ID].ticket_p50_sgd)} projected value</li>
              <li>• Recommended mechanic: {MECHANICS.find((m) => m.recommended).name} ({MECHANICS.find((m) => m.recommended).example})</li>
              <li>• Funding split: {sgd(campaign.reward_cost_ocbc_funded_sgd)} / {sgd(campaign.reward_cost_merchant_funded_sgd)}</li>
              <li>• This review gate, already applied</li>
            </ul>
            <button
              onClick={() => setConfirmed(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover active:bg-brand-active transition-colors"
            >
              Discuss with your OCBC relationship manager
              <ArrowRight size={15} />
            </button>
            <p className="text-[11px] text-white/50 mt-2">Simulated for this demo — no message is actually sent.</p>
          </>
        ) : (
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-success flex items-center justify-center shrink-0">
              <Check size={16} className="text-white" />
            </div>
            <div>
              <p className="text-[14px] font-semibold">Sent to your relationship manager.</p>
              <p className="text-[12.5px] text-white/70 mt-1">
                They'll follow up to structure the reward and confirm the review. Nothing launches without that
                sign-off — there is no one-click send in this product.
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function IncrementalityBlock({ label, value, detail, tone }) {
  const toneClass = { success: "text-success", warning: "text-warning", neutral: "text-ink" }[tone] ?? "text-ink";
  return (
    <div className="rounded-lg border border-border bg-canvas/50 p-4">
      <div className="text-[11px] font-medium text-ink-secondary mb-1">{label}</div>
      <div className={`text-[16px] font-bold mb-1.5 ${toneClass}`}>{value}</div>
      <p className="text-[12px] text-ink-secondary leading-snug">{detail}</p>
    </div>
  );
}
