import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { sgd, pct } from "../data/format";
import { BasisNote, InfoTip } from "./ui";

// ----------------------------------------------------------------------------------------------
// Weekly sales before and after a reward programme launched.
//
// One engine, two charts: overall weekly sales, and weekly sales inside the daypart the programme
// actually targets. They differ only in which daily series they are handed, which is the point —
// a merchant comparing the two is comparing like with like, and the targeted-window chart is the
// one that says whether the trough the programme was aimed at actually filled.
//
// Equal spans on both sides, the length of the programme's own window. A four-week campaign is
// charted against the four weeks before it, not against a year of trading: unequal spans make the
// longer side look bigger, and a merchant reading two bars of different widths as a result is the
// failure mode this whole screen exists to avoid. Where the data runs out before the span is
// filled, the shorter side is stated rather than padded.
//
// Weeks start Monday and are labelled by that Monday. The launch week is the first "after" week —
// a programme launched on a Wednesday gets credit for that Wednesday, not for the Monday before.
// ----------------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const MIN_WEEKS_PER_SIDE = 4;

// The Monday of the week containing this date, as YYYY-MM-DD. UTC throughout: these are calendar
// days from the pipeline, never instants, and a local-timezone shift would move a Sunday's trade
// into the previous week for anyone west of Singapore.
function weekStart(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

function addWeeks(iso, n) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 7 * DAY_MS).toISOString().slice(0, 10);
}

// rows: [[date, sales], ...] already reduced to the one figure being charted.
export function buildBeforeAfter(rows, launchDate, durationWeeks) {
  if (!Array.isArray(rows) || !rows.length || !launchDate) return null;
  const span = Math.max(MIN_WEEKS_PER_SIDE, Math.round(durationWeeks || 0) || MIN_WEEKS_PER_SIDE);
  const launchWeek = weekStart(launchDate);
  const from = addWeeks(launchWeek, -span);
  const to = addWeeks(launchWeek, span);

  const byWeek = new Map();
  for (const [date, sales] of rows) {
    const w = weekStart(date);
    if (w < from || w >= to) continue;
    byWeek.set(w, (byWeek.get(w) ?? 0) + (Number(sales) || 0));
  }
  if (!byWeek.size) return null;

  // Only whole weeks are charted. A part week at either edge — the series starting mid-week, or
  // ending on the demo clock — would plot a short week as a collapse in trade.
  const lastDate = rows[rows.length - 1][0];
  const firstDate = rows[0][0];
  // A week counts only if the series covers all seven of its days: its Monday is on or after the
  // first date, and the following Monday is on or before the last. Comparing against the *week* of
  // the first date instead would have admitted the opening part-week — the series starts on a
  // Wednesday — and drawn two thirds of a week's trade as a slump.
  const weeks = [...byWeek.keys()].sort().filter((w) => w >= firstDate && addWeeks(w, 1) <= lastDate);
  if (!weeks.length) return null;

  const data = weeks.map((w) => ({ week: w, sales: byWeek.get(w), phase: w < launchWeek ? "before" : "after" }));
  const before = data.filter((d) => d.phase === "before");
  const after = data.filter((d) => d.phase === "after");
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b.sales, 0) / xs.length : null);
  const beforeMean = mean(before), afterMean = mean(after);

  return {
    data, launchWeek, span,
    before_weeks: before.length, after_weeks: after.length,
    before_mean: beforeMean, after_mean: afterMean,
    change: beforeMean && afterMean != null ? (afterMean - beforeMean) / beforeMean : null,
    complete: before.length === span && after.length === span,
  };
}

export function WeeklyBeforeAfter({ title, subtitle, info, series, basis, emptyNote }) {
  const fmtWeek = (w) => new Date(`${w}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  if (!series) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-canvas/40 p-4">
        <div className="text-[13px] font-semibold text-ink mb-1">{title}</div>
        <p className="text-[12px] text-ink-secondary">{emptyNote}</p>
      </div>
    );
  }

  const up = (series.change ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="text-[13px] font-semibold text-ink">
        {title}
        {info && <InfoTip title="What these charts show" className="ml-1">{info}</InfoTip>}
      </div>
      {subtitle && <div className="text-[11.5px] text-ink-light mt-0.5 leading-snug">{subtitle}</div>}

      {/* The headline the merchant actually reads. The bars underneath are the evidence for it. */}
      <div className="flex flex-wrap items-end gap-6 mt-3 mb-3">
        <Figure label={`Weekly average, ${series.before_weeks}w before`} value={sgd(series.before_mean)} />
        <Figure label={`Weekly average, ${series.after_weeks}w after`} value={sgd(series.after_mean)} tone={up ? "success" : "brand"} />
        {series.change != null && (
          <div className={`font-num text-[20px] font-bold leading-none ${up ? "text-success" : "text-brand"}`}>
            {up ? "+" : ""}{pct(series.change, 1)}
          </div>
        )}
      </div>

      <div style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series.data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v) => sgd(v)} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} width={64} />
            <Tooltip
              cursor={{ fill: "#F8FAFC" }}
              labelFormatter={(w) => `Week of ${fmtWeek(w)}`}
              formatter={(v, _n, p) => [sgd(v), p?.payload?.phase === "before" ? "Before launch" : "After launch"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
            />
            {/* The launch itself, drawn where it happened rather than left to the colour change. */}
            <ReferenceLine x={series.launchWeek} stroke="#0F172A" strokeDasharray="3 3"
                           label={{ value: "launch", position: "top", fontSize: 10, fill: "#0F172A" }} />
            <Bar dataKey="sales" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {series.data.map((d) => (
                <Cell key={d.week} fill={d.phase === "before" ? "#94A3B8" : up ? "#10B981" : "#ED1C24"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {!series.complete && (
        <p className="text-[11px] text-ink-light mt-1">
          {series.before_weeks} complete weeks before and {series.after_weeks} after — fewer than the {series.span} each side the
          programme's own length asks for, because the acquiring series does not reach that far. The averages are over the weeks shown.
        </p>
      )}
      <BasisNote>{basis}</BasisNote>
    </div>
  );
}

function Figure({ label, value, tone = "default" }) {
  const toneClass = { default: "text-ink", success: "text-success", brand: "text-brand" }[tone];
  return (
    <div>
      <div className="text-[11px] text-ink-secondary mb-1">{label}</div>
      <div className={`font-num text-[20px] font-bold leading-none ${toneClass}`}>{value}</div>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------
// The pair of charts for one programme.
//
// `profile.series.daily` is overall sales; `profile.series.daily_by_daypart` is the same days split
// into the pipeline's dayparts, and the second chart reads whichever of those the programme's own
// configured hours fall in. The mapping is exact or it is refused: a window of 14:00–17:00 is the
// afternoon daypart, and a window of 15:00–16:00 is not any daypart, so rather than round it into
// the nearest bucket and label the result as the programme's window, the chart says it cannot
// resolve it. A chart captioned with the wrong hours is worse than no chart.
// ----------------------------------------------------------------------------------------------
export function resolveDaypart(basis, hours) {
  if (!basis?.hours || !Array.isArray(hours) || hours.length !== 2) return null;
  const [lo, hi] = hours.map(Number);
  const hit = Object.entries(basis.hours).find(([, [a, b]]) => Number(a) === lo && Number(b) === hi);
  return hit ? { key: hit[0], hours: hit[1], index: (basis.dayparts ?? []).indexOf(hit[0]) } : null;
}

export default function ProgrammeCharts({ profile, launchDate, durationWeeks, hours, weekdayLabel, measured = false }) {
  const daily = profile?.series?.daily ?? null;
  const byDaypart = profile?.series?.daily_by_daypart ?? null;
  const basis = profile?.series?.daypart_basis ?? null;

  const overall = useMemo(
    () => buildBeforeAfter((daily ?? []).map(([d, , s]) => [d, s]), launchDate, durationWeeks),
    [daily, launchDate, durationWeeks]
  );

  const daypart = useMemo(() => resolveDaypart(basis, hours), [basis, hours]);
  const windowed = useMemo(() => {
    if (!byDaypart || !daypart || daypart.index < 0) return null;
    return buildBeforeAfter(byDaypart.map((row) => [row[0], row[1 + daypart.index]]), launchDate, durationWeeks);
  }, [byDaypart, daypart, launchDate, durationWeeks]);

  const hoursLabel = Array.isArray(hours)
    ? `${String(hours[0]).padStart(2, "0")}:00–${String(hours[1]).padStart(2, "0")}:00`
    : "the targeted window";

  return (
    <div className="space-y-2">
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <WeeklyBeforeAfter
        title="Weekly sales — before and after launch"
        subtitle="All trade at your terminals, every hour of every day."
        info="These compare trade either side of launch; seasons, weather and everything else moved too. They are not what the programme added."
        series={overall}
        emptyNote="Weekly sales need the daily acquiring series, which is not loaded for this merchant in the demo."
        basis="merchant_profiles.json series.daily — your own acquiring records, summed into Monday-start weeks. Equal spans either side of launch."
      />

      <WeeklyBeforeAfter
        title={`Sales in the targeted window — ${weekdayLabel ? `${weekdayLabel} ` : ""}${hoursLabel}`}
        subtitle="Only the hours this programme targeted."
        series={windowed}
        emptyNote={
          !byDaypart
            ? "This chart needs series.daily_by_daypart, which the pipeline has not written yet. Run the generator and pipeline (generate.py → run_all.py) to populate it; nothing here is estimated in the meantime."
            : !daypart
              ? `This programme's window (${hoursLabel}) does not line up with a single daypart, so sales cannot be attributed to it exactly. Rather than round it into the nearest one and label the result as your window, the chart is withheld.`
              : "No weekly figures fall inside the comparison span for this window."
        }
        basis="merchant_profiles.json series.daily_by_daypart — the same acquiring records, restricted to the daypart this programme's configured hours fall in."
      />
    </div>

    {/* Before-and-after is not incrementality, and on this dataset the difference is stark: the
        campaign that made money reads +0.4% on overall weekly sales and the one that lost money
        reads -16%. That caveat now sits behind the first chart's ⓘ; the control-group sentence that
        followed it is off the merchant's screen (round 7 — OCBC's method, not the merchant's trade). */}
    </div>
  );
}
