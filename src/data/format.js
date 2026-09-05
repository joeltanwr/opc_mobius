// Swap raw merchant codes (M0001) for their real business name wherever
// hand-authored copy (e.g. showcase persona signature_pattern) quotes one.
export function humanize(text, directory) {
  if (!text || !directory) return text;
  return text.replace(/\bM\d{4}\b/g, (code) => {
    const m = directory.find((d) => d.merchant_id === code);
    return m ? m.canonical_name : code;
  });
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

export function pct(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(Number(value) * 100).toFixed(decimals)}%`;
}

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// Aggregate a daily {date, txn_count, total_sales_sgd} series into monthly buckets.
export function aggregateMonthly(series) {
  const buckets = new Map();
  for (const row of series) {
    const key = row.date.slice(0, 7);
    const cur = buckets.get(key) ?? { month: key, txn_count: 0, total_sales_sgd: 0 };
    cur.txn_count += row.txn_count;
    cur.total_sales_sgd += row.total_sales_sgd;
    buckets.set(key, cur);
  }
  return Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
}
