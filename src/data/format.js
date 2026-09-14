// Swap raw merchant codes (M0001) for their real business name wherever hand-authored copy
// (e.g. a showcase persona's signature_pattern) quotes one. Takes the whole data object because
// a name may live on a profile, a segment row, an affinity pair or a persona's top_merchants.
export function humanize(text, data, merchantName) {
  if (!text || !data || !merchantName) return text;
  return text.replace(/\bM\d{4}\b/g, (code) => merchantName(data, code));
}

export function sgd(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `S$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function num(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// A fraction (0.15) as a percentage. For a value the pipeline already ships in percent, use pctOf.
export function pct(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(Number(value) * 100).toFixed(decimals)}%`;
}

// A value the pipeline already expresses in percent (43.6 → "44%").
export function pctOf(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(decimals)}%`;
}

// ---------------------------------------------------------------------------------------------
// Privacy-floored count cells. The pipeline ships every composition count as
// {suppressed: false, count} or {suppressed: true, reason} with no count at all — so the UI can
// never render a below-floor number, because it never receives one.
// ---------------------------------------------------------------------------------------------

export function cellCount(cellValue) {
  return cellValue && cellValue.suppressed === false ? cellValue.count : null;
}

export function isSuppressed(cellValue) {
  return !cellValue || cellValue.suppressed !== false;
}

export function cellText(cellValue, suppressedLabel = "Below reporting threshold") {
  const n = cellCount(cellValue);
  return n === null ? suppressedLabel : num(n);
}

// Apply the privacy floor and the rounding to a count the pipeline shipped exactly. Returns null
// below the floor, so a caller renders a suppressed state rather than a small number. Both rules
// are arguments, never defaults: a silently wrong floor is worse than a loud missing one.
export function floorRound(n, floor, rounding) {
  if (n === null || n === undefined || floor === null || rounding === null) return null;
  return n < floor ? null : Math.round(n / rounding) * rounding;
}

export function monthLabel(monthKey) {
  if (!monthKey) return "";
  const [y, m] = String(monthKey).split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// merchant_profiles.json ships series.monthly as {month, txn_count, sales_sgd, avg_ticket_sgd,
// partial}. Complete months only, so a part-month never reads as a collapse in trade.
export function completeMonths(series) {
  return (series?.monthly ?? []).filter((m) => !m.partial);
}

