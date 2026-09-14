// The reward manager agent — merchant prompt §7.1 — as a deterministic rule set.
//
// It runs inside the reducer so every tab replays the same decision, and under node so
// validate.py can prove the refusals. It narrows and does nothing else: never widens, never
// redefines the base segment, never sees a cardholder, never returns a list. The only counts it
// can ever report are the pre-computed cells in the segment's narrowing table, and a constraint
// set with no cell is refused without a count — absence is the refusal.
//
// Brief §8 leaves open whether this could be a live LLM call with a canned fallback. This is the
// canned path; a live call would only be allowed to map language to the same constraint keys.

const DAYPART_WORDS = {
  morning: ["morning", "mornings", "breakfast", "early"],
  lunch: ["lunch", "lunchtime", "midday", "noon"],
  afternoon: ["afternoon", "afternoons", "tea time", "teatime"],
  evening: ["evening", "evenings", "dinner", "after work", "after-work"],
  late: ["late night", "late-night", "night", "nights", "supper"],
};
const WEEK_WORDS = ["weekday", "weekdays", "weekend", "weekends", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WIDEN_WORDS = ["widen", "broaden", "expand", "include", "add", "also", "everyone", "everybody", "all cardholders", "more people", "extend", "plus"];
const STOP = new Set(["only", "just", "around", "near", "the", "outlet", "kiosk", "branch", "at", "in", "to", "for", "our", "my", "customers", "people", "cardholders", "regulars", "ones", "who", "are", "and", "with"]);

// Whole-word match, tolerating a plural: "Malaysians" must trip "malaysian".
const hasWord = (text, word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(e?s)?([^a-z0-9]|$)`).test(text);

function parseAgeBand(text, bands) {
  const range = text.match(/(\d{2})\s*(?:-|–|to|and)\s*(\d{2})/);
  if (range) {
    const lo = Number(range[1]), hi = Number(range[2]);
    const exact = bands.find((b) => b === `${lo}-${hi}`);
    if (exact) return { band: exact };
    const containing = bands.find((b) => { const [a, z] = b.replace("+", "-120").split("-").map(Number); return lo >= a && hi <= z; });
    return containing ? { band: containing } : { unmatched: `${lo}–${hi}` };
  }
  const under = text.match(/(?:under|below|younger than)\s*(\d{2})/);
  if (under) { const b = bands.find((x) => Number(x.split("-")[0]) < Number(under[1]) && Number(x.split("-")[1] ?? 999) < Number(under[1])); return b ? { band: b } : { unmatched: `under ${under[1]}` }; }
  const over = text.match(/(?:over|above|older than)\s*(\d{2})|(\d{2})\s*\+/);
  if (over) { const n = Number(over[1] ?? over[2]); const b = bands.find((x) => x.endsWith("+") && Number(x.replace("+", "")) <= n + 1 && Number(x.replace("+", "")) >= n - 1); return b ? { band: b } : { unmatched: `over ${n}` }; }
  return null;
}

function parseOutlet(text, outlets) {
  for (const o of outlets) {
    const tokens = o.name.toLowerCase().replace(/[()]/g, " ").split(/\s+/).filter((t) => t.length >= 4 && !STOP.has(t));
    if (tokens.some((t) => hasWord(text, t))) return { outlet: o };
    if (hasWord(text, `district ${o.district}`) || hasWord(text, `d${o.district}`)) return { outlet: o };
  }
  const mentioned = text.match(/(?:around|near|at|the)\s+([a-z][a-z ]{2,30}?)\s*(?:outlet|kiosk|branch)/);
  return mentioned ? { unmatched: mentioned[1].trim() } : null;
}

function parseDaypart(text) {
  for (const [id, words] of Object.entries(DAYPART_WORDS)) if (words.some((w) => hasWord(text, w))) return id;
  return null;
}

export function lookupReach(narrowing, constraints) {
  const keys = Object.keys(constraints).sort();
  const hit = (narrowing?.cells ?? []).find((c) => {
    const ck = Object.keys(c.constraints).sort();
    return ck.length === keys.length && ck.every((k, i) => k === keys[i] && c.constraints[k] === constraints[k]);
  });
  return hit && hit.reach && hit.reach.suppressed === false ? hit.reach.count : null;
}

// decideNarrowing(segment, request) → { outcome, code, message, constraints, reach, consumes }
//   outcome  "applied" | "refused"
//   consumes whether this attempt counts against the five-refinement cap: applied narrowings and
//            floor refusals do (a refusal is still a query about the data); refusals that reveal
//            nothing about the data — protected characteristic, widening, unparsed — do not.
export function decideNarrowing(segment, request) {
  const text = String(request ?? "").toLowerCase().trim();
  const outlets = segment.narrowing?.dimensions?.outlet ?? [];
  const bands = segment.narrowing?.dimensions?.age_band ?? [];
  const current = segment.constraints ?? {};
  const base = { constraints: current, reach: segment.reach, consumes: false, outcome: "refused" };

  if (!text) return { ...base, code: "empty", message: "Tell me how to narrow: by outlet, time of day or age band." };

  for (const [characteristic, terms] of Object.entries(segment.protected_terms ?? {})) {
    const hit = terms.find((t) => hasWord(text, t));
    if (hit) {
      return { ...base, code: "protected", message:
        `Refused: "${hit}" narrows by ${characteristic}, and Mobius does not make differential offers by nationality, race, religion, gender, marital status or health. ` +
        `Age band and location are available because they are ordinary commercial targeting. The segment is unchanged.` };
    }
  }
  if (WIDEN_WORDS.some((w) => hasWord(text, w))) {
    return { ...base, code: "widen", message: "Refused: I can only narrow the segment Mobius proposed, never widen it or add people to it. Use Reset to return to the full segment." };
  }

  const outlet = parseOutlet(text, outlets);
  const daypart = parseDaypart(text);
  const age = parseAgeBand(text, bands);
  const weekWord = WEEK_WORDS.find((w) => hasWord(text, w));

  if (outlet?.unmatched) return { ...base, code: "unknown_outlet", message: `No outlet called "${outlet.unmatched}". Your outlets are ${outlets.map((o) => o.name).join(", ")}.` };
  if (age?.unmatched) return { ...base, code: "unknown_age", message: `"${age.unmatched}" is not one of the age bands I can use: ${bands.join(", ")}.` };
  if (!outlet && !daypart && !age) {
    if (weekWord) return { ...base, code: "window_not_segment", message: `Weekday or weekend is the campaign window, not a property of who is in the segment — set it under Timing. The segment is unchanged.` };
    return { ...base, code: "unrecognised", message: "I can narrow by outlet, time of day or age band — for example \"only the Tanjong Pagar outlet\", \"afternoon only\" or \"25–34 only\"." };
  }

  const proposed = { ...current };
  const changes = [];
  for (const [key, value] of [["outlet", outlet?.outlet?.id], ["daypart", daypart], ["age_band", age?.band]]) {
    if (!value) continue;
    if (current[key] && current[key] !== value) {
      return { ...base, code: "already_narrowed", message: `The segment is already narrowed by ${key.replace("_", " ")} (${current[key]}); changing it would be a different segment, not a narrower one. Reset first.` };
    }
    if (current[key] === value) continue;
    proposed[key] = value;
    changes.push(`${key.replace("_", " ")} = ${outlet?.outlet && key === "outlet" ? outlet.outlet.name : value}`);
  }
  if (!changes.length) return { ...base, code: "no_change", message: "That narrowing is already applied. The segment is unchanged." };
  if ((segment.refinements_used ?? 0) >= (segment.max_refinements ?? Infinity)) {
    return { ...base, code: "cap", message: `Refused: this campaign has used all ${segment.max_refinements} of its narrowings. Reset returns to the full segment but does not restore refinements.` };
  }

  const reach = lookupReach(segment.narrowing, proposed);
  if (reach === null) {
    return { ...base, code: "floor", consumes: true, message:
      `Refused: narrowing to ${changes.join(", ")} would leave fewer than ${segment.floor} cardholders, so it cannot be offered. ` +
      `Below the floor no count is given — reporting one is the leak the floor exists to close. The segment is unchanged.` };
  }
  return { outcome: "applied", code: "applied", consumes: true, constraints: proposed, reach,
           message: `Narrowed to ${changes.join(", ")}: about ${reach.toLocaleString()} cardholders, rounded to the nearest ${segment.rounding}.` };
}
