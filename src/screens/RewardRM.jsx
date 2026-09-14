import React, { useState } from "react";
import { Check, ShieldAlert, ShieldCheck, ArrowRight, CircleUserRound, Ban } from "lucide-react";
import { useDemoData, merchantById, merchantName } from "../data/DataProvider";
import { HERO_MERCHANT_ID, HERO_RIVAL_MERCHANT_ID, CONSTANTS, screenNum } from "../data/constants";
import { sgd, num, pct, pctOf, cellText, cellCount, humanize } from "../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../components/ui";

export default function RewardRM() {
  const { data } = useDemoData();
  const profile = merchantById(data.merchantProfiles, HERO_MERCHANT_ID);
  const rivalName = merchantName(data, HERO_RIVAL_MERCHANT_ID);
  const recs = data.rewardRecommendations[HERO_MERCHANT_ID];
  const allocation = data.allocationSummary;
  const segment = data.segments[HERO_MERCHANT_ID].find((s) => s.candidate_merchant === HERO_RIVAL_MERCHANT_ID);
  const charles = data.showcasePersonas.find((p) => p.id === "charles");
  const [confirmed, setConfirmed] = useState(false);

  // The measured campaign that cleared its reward cost — real arms, real control group.
  const winner = data.campaignResults.completed.find((c) => c.measured && c.cost.net_sign === "positive");
  const reach = cellCount(segment.reach);

  // "Would have converted anyway": the held-out control group's own conversion rate, applied to
  // the treated arm. Everything here is counted, never assumed.
  const organicConverters = Math.round(winner.cohort.treated * (winner.conversion.control_rate_pct / 100));
  const topRanked = recs.ranked.find((r) => !r.disabled);

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow={`Screen ${screenNum("reward-rm")} · Reward & RM handoff`}
        title="Turning the gap into an offer — and who has to sign off"
        subtitle={`Targeting the ${cellText(segment.reach)}-cardholder ${rivalName} lookalike segment identified on the previous screen.`}
      />

      <Card className="p-5 mb-6 flex items-start gap-3 border-success/40 bg-success-bg/30">
        <ShieldCheck size={18} className="text-success shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-ink">
            Eligibility gate: {recs.eligibility.passed ? "cleared" : "not cleared"}
          </p>
          <p className="text-[12.5px] text-ink-secondary mt-0.5">
            Mean closing balance {sgd(recs.eligibility.avg_balance_6m_sgd)} over{" "}
            {recs.eligibility.balance_months} months against a {sgd(recs.eligibility.balance_threshold_sgd)}{" "}
            threshold; internal band {recs.eligibility.internal_score_band} and external band{" "}
            {recs.eligibility.external_score_band} against a maximum of {recs.eligibility.max_band}. Cleared by{" "}
            {recs.eligibility.cleared_by.join(" and ")}.
          </p>
          <BasisNote>reward_recommendations.json — the same gate refuses merchants who fail it, visibly.</BasisNote>
        </div>
      </Card>

      <h3 className="text-[15px] font-bold text-ink mb-1">
        Six reward types, ranked for this gap ({recs.gap_type.replace(/_/g, " ")})
      </h3>
      <p className="text-[12.5px] text-ink-secondary mb-4 max-w-2xl">
        {recs.gap_note} The ranking is deterministic — the gap type selects the order, and the rejected type stays on
        screen with its reason rather than disappearing.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {recs.ranked.map((r) => (
          <Card
            key={r.type}
            className={`p-5 ${r.disabled ? "border-dashed bg-canvas/60" : r.rank === 1 ? "border-brand/30 ring-1 ring-brand/10" : ""}`}
          >
            <div className="flex items-center justify-between mb-1 gap-2">
              <h4 className={`text-[14px] font-bold ${r.disabled ? "text-ink-light" : "text-ink"}`}>
                {r.rank}. {r.label}
              </h4>
              {r.disabled ? (
                <Badge tone="neutral">
                  <Ban size={10} /> Ranked and rejected
                </Badge>
              ) : r.rank === 1 ? (
                <Badge tone="brand">Recommended</Badge>
              ) : null}
            </div>
            <p className={`text-[12.5px] ${r.disabled ? "text-ink-light" : "text-ink-secondary"}`}>{r.reason}</p>
            {!r.disabled && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-light">
                <span>{r.new_or_returning}</span>
                <span>·</span>
                <span>
                  Expected incremental share {pct(r.expected_incremental_share, 0)}
                  {r.incremental_share_provisional && (
                    <span className="ml-1 rounded bg-warning-bg px-1 py-0.5 text-warning font-medium">provisional</span>
                  )}
                </span>
                {r.non_customer_reach && (
                  <>
                    <span>·</span>
                    <span>Non-customer reach {cellText(r.non_customer_reach)}</span>
                  </>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="p-6 mb-6">
        <h3 className="text-[15px] font-bold text-ink mb-1">Incrementality — the part a mailing list can't do</h3>
        <p className="text-[12.5px] text-ink-secondary mb-4">
          Measured on {winner.name} ({winner.window}): {num(winner.cohort.treated)} treated against{" "}
          {num(winner.cohort.control)} held out.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <IncrementalityBlock
            label="Excluded before targeting"
            value="Price-insensitive customers"
            detail={`Someone like ${charles.name} — "${humanize(charles.signature_pattern, data, merchantName)}" — never enters this segment. His behaviour doesn't move with an incentive, so crediting his visits would overstate the campaign.`}
            icon={<CircleUserRound size={16} />}
            tone="warning"
          />
          <IncrementalityBlock
            label="Redeemed, but would have converted anyway"
            value={`${num(organicConverters)} of ${num(winner.redemption.redeemers)} redeemers`}
            detail={`The held-out control group converted at ${pctOf(winner.conversion.control_rate_pct, 1)} without any offer. Applied to the treated arm, that is what this campaign would have got for free.`}
            tone="neutral"
          />
          <IncrementalityBlock
            label="Real incremental transactions"
            value={num(winner.incremental.incremental_transactions, 1)}
            detail={`${sgd(winner.incremental.incremental_sales_sgd)} in incremental sales — treated window sales minus control window sales, scaled by arm size. The number this campaign is judged on.`}
            tone="success"
          />
        </div>
        <BasisNote>{winner.incremental.basis} (campaign_results.json — full breakdown on the next screen).</BasisNote>
      </Card>

      <Card className="p-6 mb-6">
        <h3 className="text-[15px] font-bold text-ink mb-3">What it costs the merchant — the whole cost</h3>
        <div className="font-num text-[15px] text-ink bg-canvas border border-border rounded-lg px-4 py-3 inline-block">
          {sgd(winner.cost.reward_cost_sgd)} reward cost, funded by {profile.name}
        </div>
        <p className="text-[12.5px] text-ink-secondary mt-3 max-w-2xl">
          Every cost figure on every screen is the merchant's whole cost. OCBC supplies the targeting, the delivery
          and the measurement, and does not contribute to the reward. The configured limit caps it before anything
          launches: {sgd(winner.configuration.max_cost_sgd)} maximum, from a {num(winner.configuration.redemption_limit)}
          -redemption limit at {sgd(winner.configuration.cap_per_txn_sgd)} per transaction.
        </p>
        <BasisNote>{winner.cost.basis}</BasisNote>
      </Card>

      {/* There is no auto-approve threshold, and there used to be a panel here implying one: that a
          small enough reach would skip review. The ladder has no edge from draft to active that
          misses `pending`, and §2.4 forbids a one-click launch outright, so the concept is gone
          rather than reworded. Every campaign is reviewed. What survives is the part that was
          always true — the caps underneath the review, which bound exposure whatever a reviewer
          decides. */}
      <Card className="p-5 mb-6 flex items-start gap-3 border-info/40 bg-info-bg/40">
        <ShieldAlert size={18} className="text-info shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-ink">Every campaign is reviewed by OCBC before anything sends</p>
          <p className="text-[12.5px] text-ink-secondary mt-0.5">
            There is no size below which a campaign approves itself. An OCBC reviewer signs off on segment, offer and
            window, whatever the reach — {cellText(segment.reach)} cardholders here. Underneath that approval the send
            layer caps exposure independently, so the review is not the only thing standing between a merchant and a
            cardholder's attention: no more than {allocation.frequency_cap.offers_per_30_days} concurrent offers per
            cardholder in 30 days and {allocation.push.cap_per_week} pushes per week —{" "}
            {allocation.push.suppressed_count} recipient{allocation.push.suppressed_count === 1 ? "" : "s"} in this
            campaign already hit the push cap and received the feed card only.
          </p>
          <BasisNote>
            allocation_summary.json. Portfolio ceiling this week: {num(allocation.portfolio.contacted_this_week)}{" "}
            contacted of {num(allocation.portfolio.weekly_ceiling)} ({allocation.portfolio.ceiling_basis})
          </BasisNote>
        </div>
      </Card>

      <Card className="p-6 border-navy/10 bg-navy text-white">
        {!confirmed ? (
          <>
            <h3 className="text-[16px] font-bold mb-1">Your OCBC relationship manager receives:</h3>
            <ul className="text-[13px] text-white/80 mt-3 space-y-1.5">
              <li>
                • A qualified demand gap: {cellText(segment.reach)} cardholders,{" "}
                {sgd((reach ?? 0) * CONSTANTS.BASE_ENGAGEMENT_RATE.value * profile.trading_summary.avg_ticket_sgd)}{" "}
                projected value
              </li>
              <li>
                • Recommended reward: {topRanked.label} — {topRanked.reason}
              </li>
              <li>• Your whole cost, capped by the redemption limit you set</li>
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
