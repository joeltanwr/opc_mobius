import React, { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Lock, ChevronRight, Radio } from "lucide-react";
import { useDemoData, merchantById, usePrivacyRules } from "../data/DataProvider";
import { useMobiusState } from "../state/StateProvider";
import { HERO_MERCHANT_ID, screenNum, SHOW_BASIS_NOTES } from "../data/constants";
import { sgd, num, pctOf, cellText, cellCount } from "../data/format";
import { Card, SectionTitle, Badge, BasisNote, InfoTip } from "../components/ui";
import ProgrammeCharts, { buildBeforeAfter } from "../components/BeforeAfterCharts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CampaignResults() {
  const { data } = useDemoData();
  const m = useMobiusState();
  const profile = merchantById(data.merchantProfiles, HERO_MERCHANT_ID);
  const measured = data.campaignResults.completed.filter((c) => c.measured && c.merchant_id === HERO_MERCHANT_ID);
  // From the shared state rather than the shipped JSON — the merchant's half of the propagation
  // contract: when a cardholder redeems in the customer app, these counters move here without a
  // reload, in whatever tab this page is open in.
  //
  // Everything submitted and not yet finished, whether its window has opened or not. It used to
  // take only a campaign that had already been pushed to somebody; a merchant who has just
  // submitted has a programme and expects to see it, and "nothing here yet" while their own
  // dashboard is open is the wrong answer.
  const ongoing = m
    ? Object.values(m.state.campaigns).filter((c) => c.merchant_id === HERO_MERCHANT_ID && c.status === "active")
        .sort((a, b) => Number(m.isQueued(a)) - Number(m.isQueued(b)))
    : [];

  // Sales uplift across every programme this merchant has run with OCBC, not just the one being
  // read. The headline a merchant actually wants: what the whole relationship has been worth.
  //
  // It is a sum of the measured incremental figures, so the test-vs-control measurement behind it
  // is unchanged — that methodology still runs, still feeds the OCBC KPI view and still backs any
  // pitch claim. What changed is that this screen no longer puts the control arm on screen: a
  // held-out group is how OCBC knows the number is real, and it is not what an SME reads.
  const withIncremental = measured.filter((c) => c.incremental);
  const upliftSgd = withIncremental.reduce((a, c) => a + (c.incremental.incremental_sales_sgd ?? 0), 0);
  const upliftTxns = withIncremental.reduce((a, c) => a + (c.incremental.incremental_transactions ?? 0), 0);

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow={`Screen ${screenNum("results")} · Reward dashboard`}
        title="What your reward programmes have been worth"
        subtitle={`${profile.name}'s completed programmes, and the trade they added.`}
      />

      {withIncremental.length > 0 && (
        <Card className="p-6 mb-6">
          <div className="flex flex-wrap items-end gap-10">
            <div>
              <div className="text-[12px] text-ink-secondary mb-1">Sales uplift across all your reward programmes</div>
              <div className={`font-num text-[44px] font-extrabold leading-none ${upliftSgd >= 0 ? "text-success" : "text-brand"}`}>
                {sgd(upliftSgd)}
              </div>
            </div>
            <div>
              <div className="text-[12px] text-ink-secondary mb-1">Added transactions</div>
              <div className="font-num text-[28px] font-bold text-ink leading-none">{num(upliftTxns, 1)}</div>
            </div>
            <div>
              <div className="text-[12px] text-ink-secondary mb-1">Programmes measured</div>
              <div className="font-num text-[28px] font-bold text-ink leading-none">{num(withIncremental.length)}</div>
            </div>
          </div>

        </Card>
      )}

      {/* ------------------------------------------------------------------ not yet completed */}
      {/* Live and In queue share a section because they are one thing to a merchant — a programme
          they have committed to — and the row says which it is. Completed is its own section
          because it is the only one with a result to read. */}
      <Section
        title="Live / In queue reward programmes"
        note="Submitted and not yet finished."
        count={ongoing.length}
        empty="Nothing running. Submit one on Reward Configuration."
      >
        {ongoing.map((c) => (
          <OngoingProgramme
            key={c.id}
            campaign={c}
            profile={profile}
            queued={m.isQueued(c)}
            label={m.displayOf(c)}
            display={m.display}
            reachOf={m.reachOf}
          />
        ))}
      </Section>

      {/* ------------------------------------------------------------------ completed */}
      <Section
        title="Completed reward programmes"
        note="Finished and measured."
        count={measured.length}
        empty="No programme has finished yet."
      >
        {/* Every measured programme, not just the best and worst. The section's count is the
            length of this list, and a count that does not match the rows under it is the kind of
            small wrongness a banker notices and then stops trusting the rest of the screen for. */}
        {measured.map((c) => (
          <CompletedProgramme
            key={c.campaign_id}
            campaign={c}
            profile={profile}
            rationale={data.rationales[c.campaign_id]}
            merchantName={profile.name}
          />
        ))}
      </Section>

      <BasisNote>{data.campaignResults.basis}</BasisNote>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// A section of the dashboard, and one collapsed programme row inside it.
//
// Collapsed by default. Two charts and a full result block per programme is more than a projector
// can hold at once, and a merchant opening this screen wants the list first — which programmes do
// I have, and how are they doing — before any one of them in depth. Opening a row is what asks
// for the depth, and it is also what keeps the charts to one programme at a time so there is no
// question which set belongs to which.
// ---------------------------------------------------------------------------------------------
function Section({ title, note, count, empty, children }) {
  return (
    <section className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="text-[17px] font-bold text-ink">{title}</h2>
        <span className="font-num text-[12px] text-ink-light">{num(count)}</span>
      </div>
      <p className="text-[12.5px] text-ink-secondary mb-3 max-w-3xl">{note}</p>
      {count === 0 ? (
        <Card className="p-5 border-dashed">
          <p className="text-[13px] text-ink-light">{empty}</p>
        </Card>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

function ProgrammeRow({ headline, sub, right, badge, children }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className={open ? "border-ink/20" : ""}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex flex-wrap items-center gap-3 px-6 py-4 text-left hover:bg-canvas/50 transition-colors rounded-xl"
      >
        <ChevronRight size={16} className={`shrink-0 text-ink-light transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            {badge}
            <span className="text-[15px] font-bold text-ink">{headline}</span>
          </span>
          {sub && <span className="block text-[12.5px] text-ink-secondary mt-0.5">{sub}</span>}
        </span>
        {right && <span className="shrink-0 text-right">{right}</span>}
      </button>
      {open && <div className="px-6 pb-6 pt-1 border-t border-border">{children}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// How many whole weeks a programme ran, used to size both sides of its before-and-after charts.
// Null when the window is unknown, which is what stops the charts rendering at all.
function durationWeeks(start, end) {
  if (!start || !end) return null;
  return Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / (7 * 86_400_000)));
}

function windowLabel(daysOfWeek, hours) {
  const d = Array.isArray(daysOfWeek) && daysOfWeek.length ? daysOfWeek.map((i) => WEEKDAYS[i]).join("/") : null;
  const h = Array.isArray(hours) && hours.length === 2
    ? `${String(hours[0]).padStart(2, "0")}:00–${String(hours[1]).padStart(2, "0")}:00` : null;
  return [d, h].filter(Boolean).join(" ") || "—";
}

// ---------------------------------------------------------------------------------------------
// A programme that has been submitted and has not finished.
//
// Two readings. One whose window has opened and has at least a week of trading behind it gets the
// running counters and the before-and-after charts. One that has not — either queued for a future
// start, or launched so recently that there is no post-launch week to compare — gets what it
// actually has: the configuration it was submitted with, and the date it starts. There is no
// honest "after launch" for either, and an empty right half of a chart is not a result.
// ---------------------------------------------------------------------------------------------
function OngoingProgramme({ campaign, profile, queued, label, display, reachOf }) {
  const c = campaign;
  const cfg = c.configuration ?? {};
  const start = c.window?.start ?? cfg.window_start ?? null;
  const end = c.window?.end ?? cfg.window_end ?? null;
  const weeks = durationWeeks(start, end);

  // Whether there is anything on the far side of the launch to chart. Asked of the data rather
  // than of the status: a programme can be Live in the ladder and still have no trading week
  // after its start date, which is exactly the demo campaign's own situation on stage.
  const charted = useMemo(
    () => (queued ? null : buildBeforeAfter((profile?.series?.daily ?? []).map(([d, , s]) => [d, s]), start, weeks)),
    [queued, profile, start, weeks]
  );
  const hasAfter = Boolean(charted && charted.after_weeks > 0);

  return (
    <ProgrammeRow
      headline={c.name}
      sub={cfg.offer_headline ?? "Configured with your relationship manager"}
      badge={<Badge tone={queued ? "neutral" : "success"}>{queued ? label : <><Radio size={11} /> {label}</>}</Badge>}
      right={
        <>
          <span className="block font-num text-[12px] text-ink">{start ?? "—"}{end ? ` → ${end}` : ""}</span>
          <span className="block text-[11px] text-ink-light">{windowLabel(cfg.days_of_week, cfg.hours)}</span>
        </>
      }
    >
      {hasAfter ? (
        <>
          <LiveCampaign campaign={c} display={display} reachOf={reachOf} />
          <ProgrammeCharts
            profile={profile}
            launchDate={start}
            durationWeeks={weeks}
            hours={cfg.hours}
            weekdayLabel={Array.isArray(cfg.days_of_week) ? cfg.days_of_week.map((i) => WEEKDAYS[i]).join("/") : null}
          />
        </>
      ) : (
        <PreLaunch campaign={c} queued={queued} start={start} end={end} reachOf={reachOf} />
      )}
    </ProgrammeRow>
  );
}

// What a programme has before it has a result: what was set up, and when it opens. No counters
// that would all read zero, and no charts — the point of saying "in queue" is that nothing has
// happened yet, and a row of zeros says something different and worse.
function PreLaunch({ campaign, queued, start, end, reachOf }) {
  const cfg = campaign.configuration ?? {};
  return (
    <div className="pt-4">
      <div className="rounded-lg border border-border bg-canvas/50 px-4 py-3 mb-4">
        <p className="text-[13px] font-semibold text-ink">
          {queued ? `Starts ${start ?? "on a date not yet set"}.` : "Launched today — no trading week after launch yet."}
          <InfoTip title="When the charts appear" className="ml-1">
            {queued
              ? "Nothing has been sent and nothing can be redeemed until the window opens. The before-and-after charts appear once it has run for a week."
              : "The before-and-after charts compare whole weeks either side of launch, so they appear once the first full week has been traded."}
          </InfoTip>
        </p>
      </div>
      <h4 className="text-[13px] font-bold text-ink mb-2">What was set up</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12.5px]">
        <ConfigItem label="Reward" value={cfg.offer_headline ?? "—"} />
        <ConfigItem label="Window" value={windowLabel(cfg.days_of_week, cfg.hours)} />
        <ConfigItem label="Dates" value={start ? `${start} to ${end ?? "—"}` : "—"} />
        <ConfigItem label="Outlets" value={`${(cfg.outlets ?? []).length} included`} />
        <ConfigItem label="Cardholders in the allocation" value={num(reachOf(campaign) ?? campaign.reach)} />
        <ConfigItem label="Redemption limit" value={cfg.redemption_limit == null ? "none" : num(cfg.redemption_limit)} />
        <ConfigItem label="Maximum cost (whole cost)" value={cfg.max_reward_value_sgd == null || cfg.redemption_limit == null ? "—" : sgd(cfg.max_reward_value_sgd * cfg.redemption_limit)} />
        <ConfigItem label="Channel" value={`Feed${cfg.push_granted ? " + push" : ", no push"}`} />
      </div>
    </div>
  );
}

function CompletedProgramme({ campaign, profile, rationale, merchantName }) {
  const c = campaign;
  const cleared = c.cost.net_sign === "positive";
  const start = String(c.window ?? "").slice(0, 10) || null;
  const end = String(c.window ?? "").slice(-10) || null;

  return (
    <ProgrammeRow
      headline={c.name}
      sub={c.configuration?.offer_headline ?? c.configuration?.offer_terms}
      badge={<Badge tone={cleared ? "success" : "warning"}>{cleared ? "Cleared its reward cost" : "Did not clear its reward cost"}</Badge>}
      right={
        <>
          <span className={`block font-num text-[15px] font-bold ${cleared ? "text-success" : "text-brand"}`}>
            {sgd(c.cost.net_contribution_sgd)}
          </span>
          <span className="block text-[11px] text-ink-light">net contribution</span>
        </>
      }
    >
      <div className="pt-4">
        <ProgrammeCharts
          profile={profile}
          launchDate={start}
          durationWeeks={durationWeeks(start, end)}
          hours={c.configuration?.hours}
          weekdayLabel={Array.isArray(c.configuration?.days_of_week) ? c.configuration.days_of_week.map((i) => WEEKDAYS[i]).join("/") : null}
          measured
        />
      </div>
      <CampaignDetail campaign={c} rationale={rationale} merchantName={merchantName} />
    </ProgrammeRow>
  );
}

// The live campaign, as the merchant sees it while it runs. Deliberately four counters and a
// sentence: there is no incremental figure here because there cannot be one until the window
// closes and the control arm has been observed, and a redemption count presented as a result is
// the exact confusion this whole product exists to avoid.
// Rendered inside an expanded programme row now, so it carries no card of its own: a card nested
// in a card reads as two separate things, and this is one thing.
function LiveCampaign({ campaign, display, reachOf }) {
  const c = campaign;
  const cfg = c.configuration ?? {};
  const maxValue = cfg.max_reward_value_sgd ?? cfg.cap_per_txn_sgd ?? null;
  const redemptions = c.counters.redemptions + c.post_freeze.redemptions;
  return (
    <div className="pt-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <Badge tone={c.status === "active" ? "success" : "neutral"}>
            <Radio size={11} /> {display(c.status, c.capped?.why ?? null)}
          </Badge>
          <h3 className="text-[16px] font-bold text-ink mt-2">{c.name}</h3>
          <p className="text-[12.5px] text-ink-secondary">{cfg.offer_headline ?? "Configured with your relationship manager"}</p>
        </div>
        <div className="text-right text-[11px] text-ink-light">
          {c.window ? `${c.window.start} to ${c.window.end}` : ""}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniFigure label="Cardholders reached" value={num(reachOf(c) ?? c.counters.feed_delivered)} />
        <MiniFigure label="Pushes sent" value={num(c.counters.pushes_sent)} />
        <MiniFigure label="Redemptions so far" value={num(redemptions)} />
        <MiniFigure label="Reward cost to date, at most" value={maxValue == null ? "—" : sgd(redemptions * maxValue)} />
      </div>
      <BasisNote>
        Live from the shared state — these move as redemptions happen, with no reload. Cost to date is the ceiling on what you have
        spent so far (redemptions × the maximum value of one reward) and it is your whole cost. Incremental sales and net contribution
        appear when the window closes: they need the held-out control group, and a redemption count on its own measures popularity,
        not trade you would not otherwise have had.
      </BasisNote>
    </div>
  );
}

function CampaignDetail({ campaign, rationale, merchantName }) {
  const { floor } = usePrivacyRules();
  const c = campaign;
  const cleared = c.cost.net_sign === "positive";

  // No card and no header of its own. The row that expanded to show this already carries the
  // programme's name, its verdict badge and its net contribution; repeating them here would say
  // the same thing twice and push the result itself below the fold.
  return (
    <div>
      <p className="text-[12.5px] text-ink-secondary mb-4">{c.configuration.offer_terms}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {/* The treated-vs-held-out conversion chart is off this screen. It is the clearest
              picture of how the number was proved, and it is a picture of OCBC's method rather
              than of the merchant's trade — the same reason the incrementality box left Customer
              Profile. `c.conversion` and `c.cohort` are untouched in campaign_results.json and
              still render on the RM's campaign detail, which is where that argument belongs. */}
          <div className="rounded-lg border border-border bg-canvas/40 p-4">
            <div className="text-[12px] text-ink-secondary mb-1">Cardholders who redeemed</div>
            <div className="font-num text-[30px] font-extrabold text-ink leading-none">{num(c.redemption.redeemers)}</div>
            <div className="text-[12.5px] text-ink-secondary mt-2">
              {num(c.redemption.redeemed_transactions)} redeemed transactions, at an average ticket of{" "}
              {sgd(c.redemption.avg_ticket_sgd, 2)}.
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <ResultLine
            label="Redemptions"
            value={`${num(c.redemption.redeemers)} cardholders, ${num(c.redemption.redeemed_transactions)} transactions (${pctOf(c.redemption.redemption_rate_pct, 1)} of cardholders reached)`}
          />
          <ResultLine label="Average redeemed ticket" value={sgd(c.redemption.avg_ticket_sgd, 2)} />
          <ResultLine
            label="Added transactions"
            value={num(c.incremental.incremental_transactions, 1)}
            tone={cleared ? "success" : "warning"}
          />
          <ResultLine
            label="Sales added"
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
              Changed from the Mobius recommendation
              <InfoTip title="Why edits are recorded" className="ml-1">
                Every edit is attributed and timestamped, so this result can still be explained.
              </InfoTip>
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
          <h4 className="text-[14px] font-bold text-ink mb-1">
            Who redeemed
            <InfoTip title="About the floor" className="ml-1">
              The {floor} floor applies to breakdowns of people: age bands, RFM segments, card mix.
            </InfoTip>
          </h4>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <MiniFigure label="New to the business" value={num(c.redeemer_profile.new_to_business)} />
            <MiniFigure label="Already returning" value={num(c.redeemer_profile.returning)} />
          </div>
          {SHOW_BASIS_NOTES && <p className="text-[11.5px] text-ink-light mb-3">{c.redeemer_profile.new_vs_returning_basis}</p>}
          <CompositionBlock title="Age bands" composition={c.redeemer_profile.age_bands} redeemers={c.redemption.redeemers} floor={floor} />
          <CompositionBlock title="RFM segment at redemption" composition={c.redeemer_profile.rfm_at_redemption} redeemers={c.redemption.redeemers} floor={floor} />
        </div>

        <div>
          <h4 className="text-[14px] font-bold text-ink mb-1">Did they come back</h4>
          <div className="space-y-3">
            <ResultLine
              label="Returned within 30 days"
              value={`${num(c.repeat.returned_within_30d)} of ${num(c.redemption.redeemers)} (${pctOf(c.repeat.return_rate_pct, 1)})`}
            />
            <ResultLine
              label="Further visits: 1 / 2 / 3+"
              value={`${num(c.repeat.further_visits_distribution["1"])} / ${num(c.repeat.further_visits_distribution["2"])} / ${num(c.repeat.further_visits_distribution["3+"])}`}
            />
          </div>
          <BasisNote>{c.repeat.basis}</BasisNote>

        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-border flex items-start gap-3">
        {cleared ? (
          <CheckCircle2 size={20} className="text-success shrink-0 mt-0.5" />
        ) : (
          <XCircle size={20} className="text-warning shrink-0 mt-0.5" />
        )}
        <div>
          {/* The written verdict is off this screen. Both the pipeline's `verdict` and the
              generated one open on the treated-versus-control comparison — "16% of treated
              cardholders against 4% of the matched control" — which is the thing this screen
              stopped showing. They are pipeline-written strings, so the fix is to have reward
              measurement emit a merchant-facing verdict without the control clause, not to
              split a generated sentence in a component.

              Nothing the verdict concluded is lost from the page: the badge above says whether
              the programme cleared its reward cost, net contribution is in the column beside
              it, and "Returned within 30 days" carries the repeat figure. The losing campaign
              still visibly says it lost money, which is the part that must never be cut. */}
          <p className="text-[13px] font-semibold text-ink">
            {cleared ? "This programme cleared its reward cost." : "This programme did not clear its reward cost."}
          </p>
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
            {new Date(c.operating_account.date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.
          </p>
        </div>
      )}
    </div>
  );
}

// A composition breakdown as the pipeline ships it: floored cells, the population it declined to
// break down, and the copy naming that population. Never a bare column of suppressed rows.
// A withheld breakdown says so in one line built from the figures beside it. The pipeline's longer
// note still ships, and still renders for any breakdown that is not all withheld.
function CompositionBlock({ title, composition, redeemers, floor }) {
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
      <p className="text-[11.5px] text-ink-light leading-snug">
        {composition.all_suppressed ? `Withheld — ${num(redeemers)} redeemers, below the ${num(floor)} floor.` : composition.note}
      </p>
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
