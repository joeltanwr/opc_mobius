import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { CheckCircle2, XCircle, Lock, ShieldCheck } from "lucide-react";
import { useDemoData, merchantById } from "../data/DataProvider";
import { HERO_MERCHANT_ID, screenNum } from "../data/constants";
import { sgd, num, pctOf, cellText, cellCount } from "../data/format";
import { Card, SectionTitle, Badge, BasisNote } from "../components/ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CampaignResults() {
  const { data } = useDemoData();
  const profile = merchantById(data.merchantProfiles, HERO_MERCHANT_ID);
  const measured = data.campaignResults.completed.filter((c) => c.measured && c.merchant_id === HERO_MERCHANT_ID);
  const winner = measured.find((c) => c.cost.net_sign === "positive");
  const loser = measured.find((c) => c.cost.net_sign === "negative");

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow={`Screen ${screenNum("results")} · Campaign results`}
        title="Test vs. control — not before vs. after"
        subtitle={`${profile.name}'s completed campaigns, each measured against a held-out group from the same segment, not against its own pre-campaign baseline.`}
      />

      {winner && <CampaignDetail campaign={winner} rationale={data.rationales[winner.campaign_id]} merchantName={profile.name} />}
      {loser && <CampaignDetail campaign={loser} rationale={data.rationales[loser.campaign_id]} merchantName={profile.name} />}

      <BasisNote>{data.campaignResults.basis}</BasisNote>
    </div>
  );
}

function CampaignDetail({ campaign, rationale, merchantName }) {
  const c = campaign;
  const cleared = c.cost.net_sign === "positive";
  const conversionChart = [
    { group: "Treated (got the offer)", rate: c.conversion.treated_rate_pct },
    { group: "Control (held out)", rate: c.conversion.control_rate_pct },
  ];

  return (
    <Card className={`p-6 mb-6 ${cleared ? "" : "border-ink-light/30"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <Badge tone={cleared ? "success" : "warning"}>
            {cleared ? "Cleared its reward cost" : "Did not clear its reward cost"}
          </Badge>
          <h3 className="text-[16px] font-bold text-ink mt-2">{c.name}</h3>
          <p className="text-[12.5px] text-ink-secondary">{c.configuration.offer_terms}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-ink-light">{c.window}</div>
          <div className="text-[12px] text-ink-secondary">{c.status_display}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={conversionChart} margin={{ left: -10 }}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="group" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => pctOf(v, 1)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }} />
              <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={64}>
                <Cell fill="#ED1C24" />
                <Cell fill="#94A3B8" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <BasisNote>
            {num(c.cohort.treated)} treated vs. {num(c.cohort.control)} held-out control ({c.cohort.basis}).{" "}
            {c.conversion.definition}. Lift: {c.conversion.lift_points} points.
          </BasisNote>
        </div>

        <div className="space-y-3">
          <ResultLine
            label="Redemptions"
            value={`${num(c.redemption.redeemers)} cardholders, ${num(c.redemption.redeemed_transactions)} transactions (${pctOf(c.redemption.redemption_rate_pct, 1)} of treated)`}
          />
          <ResultLine label="Average redeemed ticket" value={sgd(c.redemption.avg_ticket_sgd, 2)} />
          <ResultLine
            label="Incremental transactions"
            value={num(c.incremental.incremental_transactions, 1)}
            tone={cleared ? "success" : "warning"}
          />
          <ResultLine
            label="Incremental sales"
            value={sgd(c.incremental.incremental_sales_sgd)}
            tone={cleared ? "success" : "warning"}
          />
          <ResultLine label={`Reward cost (funded by ${c.cost.funded_by})`} value={sgd(c.cost.reward_cost_sgd)} />
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Net contribution</span>
            <span className={`font-num text-[20px] font-bold ${cleared ? "text-success" : "text-brand"}`}>
              {sgd(c.cost.net_contribution_sgd)}
            </span>
          </div>
          <BasisNote>
            Net = incremental sales × {pctOf(c.cost.gross_margin_assumed * 100)} assumed gross margin − reward cost.
            {c.cost.gross_margin_provisional && (
              <span className="ml-1 rounded bg-warning-bg px-1 py-0.5 text-warning font-medium">margin provisional</span>
            )}{" "}
            {c.cost.basis}
          </BasisNote>
        </div>
      </div>

      {/* ------------------------------------------------------------------ drill-down */}
      <div className="mt-6 pt-6 border-t border-border">
        <h4 className="text-[14px] font-bold text-ink mb-3">What was set up</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12.5px]">
          <ConfigItem label="Reward" value={c.configuration.offer_headline} />
          <ConfigItem
            label="Window"
            value={`${c.configuration.days_of_week.map((d) => WEEKDAYS[d]).join("/")} ${String(c.configuration.hours[0]).padStart(2, "0")}:00–${String(c.configuration.hours[1]).padStart(2, "0")}:00`}
          />
          <ConfigItem label="Outlets" value={`${c.configuration.outlets.length} included`} />
          <ConfigItem
            label="Channel"
            value={`Feed${c.configuration.channel.push_granted ? " + push" : ", no push"}`}
          />
          <ConfigItem label="Target" value={c.configuration.new_or_returning} />
          <ConfigItem label="Redemption limit" value={num(c.configuration.redemption_limit)} />
          <ConfigItem label="Per customer" value={String(c.configuration.per_customer_limit).replace(/_/g, " ")} />
          <ConfigItem label="Maximum cost (whole cost)" value={sgd(c.configuration.max_cost_sgd)} />
        </div>
        {c.configuration.changes_from_recommendation.length > 0 && (
          <div className="mt-3 rounded-lg border border-warning/40 bg-warning-bg/40 px-3 py-2.5">
            <div className="text-[12.5px] font-semibold text-ink mb-1.5">
              Changed from the Mobius recommendation — every edit attributed and timestamped, which is why this
              result can still be explained
            </div>
            <ul className="space-y-1.5">
              {c.configuration.changes_from_recommendation.map((change, i) => (
                <li key={i} className="text-[12.5px] text-ink-secondary">
                  <span className="font-medium text-ink">{String(change.field).replace(/_/g, " ")}: </span>
                  {change.from} <span className="text-ink-light">→</span> {change.to}
                  <span className="text-ink-light">
                    {" "}
                    · by {change.by}
                    {change.at ? ` · ${new Date(change.at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  </span>
                  {change.note && <div className="text-[11.5px] text-ink-light">{change.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-[14px] font-bold text-ink mb-1">Who redeemed</h4>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <MiniFigure label="New to the business" value={num(c.redeemer_profile.new_to_business)} />
            <MiniFigure label="Already returning" value={num(c.redeemer_profile.returning)} />
          </div>
          <p className="text-[11.5px] text-ink-light mb-3">{c.redeemer_profile.new_vs_returning_basis}</p>
          <CompositionBlock title="Age bands" composition={c.redeemer_profile.age_bands} />
          <CompositionBlock title="RFM segment at redemption" composition={c.redeemer_profile.rfm_at_redemption} />
        </div>

        <div>
          <h4 className="text-[14px] font-bold text-ink mb-1">Did they come back</h4>
          <div className="space-y-3">
            <ResultLine
              label="Returned within 30 days"
              value={`${num(c.repeat.returned_within_30d)} of ${num(c.redemption.redeemers)} (${pctOf(c.repeat.return_rate_pct, 1)})`}
            />
            <ResultLine
              label="Control group, same measure"
              value={c.repeat.control_return_rate_pct === null ? "—" : `${num(c.repeat.control_returned)} (${pctOf(c.repeat.control_return_rate_pct, 1)})`}
            />
            <ResultLine
              label="Further visits: 1 / 2 / 3+"
              value={`${num(c.repeat.further_visits_distribution["1"])} / ${num(c.repeat.further_visits_distribution["2"])} / ${num(c.repeat.further_visits_distribution["3+"])}`}
            />
          </div>
          <BasisNote>{c.repeat.basis}</BasisNote>

          <div className="mt-4 rounded-lg border border-border bg-canvas/50 px-3 py-2.5 flex items-start gap-2">
            <ShieldCheck size={14} className="text-ink-light shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-ink-secondary">{c.floor_policy.note}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-border flex items-start gap-3">
        {cleared ? (
          <CheckCircle2 size={20} className="text-success shrink-0 mt-0.5" />
        ) : (
          <XCircle size={20} className="text-warning shrink-0 mt-0.5" />
        )}
        <div>
          <p className="text-[13px] text-ink-secondary">{c.verdict}</p>
          {rationale?.verdict && rationale.verdict !== c.verdict && (
            <p className="text-[12.5px] text-ink-light mt-1">{rationale.verdict}</p>
          )}
          <BasisNote>
            Written from the figures above (campaign_results.json verdict) — the same method produced both results,
            and the one that lost money says so.
          </BasisNote>
        </div>
      </div>

      {c.operating_account?.opened && (
        <div className="mt-4 pt-4 border-t border-border flex items-center gap-3">
          <CheckCircle2 size={20} className="text-success shrink-0" />
          <p className="text-[13px] text-ink-secondary">
            <span className="font-semibold text-ink">{merchantName} opened an OCBC operating account</span> on{" "}
            {new Date(c.operating_account.date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} —
            the flywheel closing, not just the campaign.
          </p>
        </div>
      )}
    </Card>
  );
}

// A composition breakdown as the pipeline ships it: floored cells, the population it declined to
// break down, and the copy naming that population. Never a bare column of suppressed rows.
function CompositionBlock({ title, composition }) {
  if (!composition) return null;
  const entries = Object.entries(composition.cells);
  const shown = entries.filter(([, cellValue]) => cellCount(cellValue) !== null);

  return (
    <div className="mb-3 rounded-lg border border-border bg-white p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12.5px] font-semibold text-ink">{title}</span>
        {composition.all_suppressed && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-light">
            <Lock size={11} /> Withheld
          </span>
        )}
      </div>
      {shown.length > 0 && (
        <ul className="space-y-1 mb-2">
          {entries.map(([label, cellValue]) => (
            <li key={label} className="flex items-center justify-between text-[12.5px]">
              <span className="text-ink-secondary">{label}</span>
              <span className={`font-num ${cellCount(cellValue) === null ? "text-ink-light italic text-[11.5px]" : "text-ink font-semibold"}`}>
                {cellText(cellValue)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11.5px] text-ink-light leading-snug">{composition.note}</p>
    </div>
  );
}

function ConfigItem({ label, value }) {
  return (
    <div className="rounded-lg bg-canvas border border-border px-3 py-2">
      <div className="text-[11px] text-ink-secondary">{label}</div>
      <div className="text-[12.5px] font-medium text-ink leading-snug">{value}</div>
    </div>
  );
}

function MiniFigure({ label, value }) {
  return (
    <div className="rounded-lg bg-canvas border border-border px-3 py-2.5">
      <div className="font-num text-[20px] font-bold text-ink leading-none">{value}</div>
      <div className="text-[11px] text-ink-secondary mt-1">{label}</div>
    </div>
  );
}

function ResultLine({ label, value, tone = "default" }) {
  const toneClass = { success: "text-success", warning: "text-warning", default: "text-ink" }[tone];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-ink-secondary">{label}</span>
      <span className={`font-num text-[13px] font-semibold text-right ${toneClass}`}>{value}</span>
    </div>
  );
}
