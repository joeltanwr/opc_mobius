// ----------------------------------------------------------------------------------------------
// The pull channel — what the cardholder finds when they ask, rather than what gets pushed at them.
//
// THE DELIBERATE DIFFERENCE, and the line the talk track has to say out loud:
//
//   Push  OCBC decides who hears about a programme. Target-segment matching, consent, and the
//         portfolio frequency cap all apply, because the cardholder did not ask.
//   Pull  The cardholder decides. They asked for coffee deals, so they get coffee deals — from
//         every live programme that fits the need and the place, whether or not the allocator
//         would ever have picked them for it.
//
// Everything else in this build is about not spraying offers. This channel skips target-segment
// matching on purpose, and that is only defensible if it is stated: unsolicited contact is capped
// and consent-gated, a direct request is answered. Left unsaid it reads as the targeting engine
// not mattering, which is the opposite of the argument the rest of the product makes.
//
// WHAT IS CANNED AND WHAT IS NOT. The language understanding is scripted — a fixed table of
// intents with the phrasings the demo will actually use. The matching is not: it runs over the
// live campaigns in shared state, by category and location, and returns whatever genuinely fits.
// So the chatbot can be wrong about what you meant, but it cannot be wrong about what is on offer,
// and the funnel it reports (searched → in category → near you) is a real count every time.
//
// If the recording script changes, the phrasings below change with it. That is the whole contract:
// this is built to answer the questions the demo asks, not to be a search engine.
// ----------------------------------------------------------------------------------------------

// The taxonomy categories each intent covers. Category ids are the pipeline's own (taxonomy.json),
// never invented here — a category that stops existing should match nothing rather than silently
// mean something else.
export const INTENTS = [
  {
    id: "coffee",
    label: "Coffee deals near me",
    phrasings: ["coffee", "cafe", "café", "latte", "flat white", "espresso", "brew"],
    categories: ["cafe", "bubble_tea", "bakery_dessert"],
    reply: "Here's what's running near you for coffee and drinks.",
    empty: "Nothing on coffee near you right now.",
  },
  {
    id: "food",
    label: "Somewhere to eat",
    phrasings: ["eat", "food", "lunch", "dinner", "hungry", "meal", "restaurant", "sushi", "zichar"],
    categories: ["cafe", "hawker_kopitiam", "zichar_chinese_casual", "japanese", "fast_food", "bakery_dessert"],
    reply: "Here's what's running near you to eat.",
    empty: "Nothing on food near you right now.",
  },
  {
    id: "fitness",
    label: "Gym and fitness",
    phrasings: ["gym", "fitness", "workout", "train", "exercise"],
    categories: ["gym_fitness"],
    reply: "Here's what's running near you for fitness.",
    empty: "Nothing on fitness near you right now.",
  },
  {
    id: "grooming",
    label: "Hair and nails",
    phrasings: ["hair", "nails", "salon", "barber", "manicure"],
    categories: ["hair_nail_salon", "beauty_cosmetics"],
    reply: "Here's what's running near you for hair and nails.",
    empty: "Nothing on hair or nails near you right now.",
  },
];

// What the assistant says when it does not recognise the ask. It names what it can do rather than
// guessing: a canned matcher that bluffs is the one failure mode that would embarrass this on
// stage, because the follow-up question is always "what else can it do".
export const FALLBACK = "I can look up live rewards near you by what you're after — try coffee, somewhere to eat, fitness, or hair and nails.";

export function matchIntent(text) {
  const q = String(text ?? "").toLowerCase();
  if (!q.trim()) return null;
  return INTENTS.find((i) => i.phrasings.some((p) => q.includes(p))) ?? null;
}

// Which of the intent's phrasings the question actually hit — the System Trace shows it, so the
// match is visible as a keyword match rather than implied to be understanding.
export function matchedPhrase(text, intent) {
  const q = String(text ?? "").toLowerCase();
  return intent?.phrasings.find((p) => q.includes(p)) ?? null;
}

// ----------------------------------------------------------------------------------------------
// Near me — the allocator's own catchment rule, asked of the cardholder instead of the segment.
//
// in_catchment() in pipeline/config.py: an outlet is reachable if the cardholder's home or work
// district is that district or adjacent to it. The adjacency table is shipped in constants.json
// (run_all.py) rather than rewritten here, so the "nearby" a cardholder is shown is the same
// "nearby" the targeting engine works to.
//
// Without that table — a build made before the pipeline was re-run — this falls back to exact
// home/work district matches. That is the stricter half of the same rule, so it can only ever
// show fewer results, never wrong ones; `exact_only` says which rule produced the list so the
// screen can be honest about it. Inventing a distance between two district numbers, which are not
// ordered geographically, is the one thing it must not do.
// ----------------------------------------------------------------------------------------------
export function districtsOf(profile) {
  const home = profile?.home_district ?? null;
  const work = profile?.work_district ?? null;
  return [home, work].filter((d) => d != null);
}

export function catchmentOf(profile, adjacency) {
  const own = districtsOf(profile);
  if (!adjacency) return { districts: new Set(own), exact_only: true };
  const set = new Set(own);
  for (const d of own) for (const n of adjacency[String(d)] ?? []) set.add(Number(n));
  return { districts: set, exact_only: false };
}

function outletDistricts(merchantProfile) {
  return (merchantProfile?.outlets ?? []).map((o) => o.district).filter((d) => d != null);
}

// ----------------------------------------------------------------------------------------------
// The search itself, over live campaigns in shared state.
//
// No target-segment test anywhere in here, by design — see the header. Consent and the frequency
// cap are not applied either: both exist to bound unsolicited contact, and this is the cardholder
// asking. What it does respect is the campaign being genuinely live and genuinely redeemable: a
// programme whose window has not opened, or has closed, is not an offer.
//
// Returns the funnel as well as the results, because the count is what shows the rules working —
// "11 live, 4 in this category, 1 near you" is the whole demonstration in one line.
// ----------------------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------------------
// Which campaigns a search can find.
//
// `active` plus one kind of `capped`, and the distinction is the reducer's own (store.js cap()):
//
//   capped, "reach cap reached"        the allocation is spent — nobody else gets CONTACTED. The
//                                      programme is still running and still redeemable, and cards
//                                      already delivered stay valid. The merchant capped how many
//                                      people OCBC approaches, which is a statement about the push
//                                      channel and says nothing about somebody who came looking.
//   capped, "redemption limit reached" nobody can redeem at all; the reducer closes every card it
//                                      already delivered. Surfacing it would be offering something
//                                      that cannot be claimed.
//
// This mattered immediately: firing the allocator delivers the whole allocation, so the demo
// campaign trips its reach cap on the first fire and leaves `active` the instant it is pushed.
// Filtering on `active` alone made the one programme the pitch is built around vanish from search
// at exactly the moment the presenter had just sent it.
// ----------------------------------------------------------------------------------------------
export function isFindable(campaign) {
  if (campaign?.status === "active") return true;
  return campaign?.status === "capped" && campaign?.capped?.why === "reach cap reached";
}

// Is the programme's own redemption window open at this instant? Days and hours are the
// merchant's own configuration and "now" is the demo clock read in Singapore time, the same rule
// and the same parsing the feed card uses for "Available now" — a programme cannot be offered as
// findable-right-now on one screen and closed on another.
export function openNow(campaign, clock) {
  if (!clock) return true;
  const cfg = campaign?.configuration ?? {};
  const days = cfg.days_of_week, hours = cfg.hours;
  if (!days?.length && !(hours?.length === 2)) return true;   // no window configured constrains nothing
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", weekday: "short", hour: "2-digit", hour12: false })
    .formatToParts(new Date(Date.parse(clock)));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.find((p) => p.type === "weekday").value);
  const hour = Number(parts.find((p) => p.type === "hour").value);
  if (days?.length && !days.includes(weekday)) return false;
  if (hours?.length === 2 && !(hour >= hours[0] && hour < hours[1])) return false;
  return true;
}

export function searchPull({ intent, campaigns, profiles, holderProfile, clock, adjacency }) {
  const live = Object.values(campaigns ?? {}).filter(isFindable);
  const today = String(clock ?? "").slice(0, 10);
  // --------------------------------------------------------------------------------------------
  // THE PULL FILTER. It narrows on exactly two things, and this comment is the reason the list is
  // not narrowed on anything else:
  //
  //     1. WHERE  the merchant has an outlet the cardholder can reach (catchmentOf, above)
  //     2. WHEN   the programme's own window is open at the demo clock (openNow, above)
  //
  // DO NOT ADD the push channel's gates here. Specifically, NONE of these belongs in this filter:
  //
  //     RFM segment            what the merchant's own history says about this cardholder
  //     target-segment fit     whether the allocator would have picked them for this programme
  //     marketing consent      whether they agreed to be marketed at
  //     portfolio frequency cap   how many unsolicited offers they have already had this week
  //
  // Every one of those exists to bound contact OCBC initiates. This list is the cardholder
  // asking. A search that answered "you are not in the target segment" would be refusing to tell
  // somebody what is publicly on offer near them, and a frequency cap applied to a question the
  // customer asked is not a frequency cap, it is a broken search. Wiring any of them in here
  // would also quietly break the demo's whole point: Charles finds the Soujourner programme he
  // was never targeted for, and that is the moment the two channels are shown to be different.
  //
  // What DOES belong: isFindable() above, which drops a programme whose N are all claimed —
  // offering something nobody can claim is the one dishonest result this list could return.
  // --------------------------------------------------------------------------------------------
  // --------------------------------------------------------------------------------------------
  // HOW "WHEN" IS APPLIED, and why it labels rather than hides.
  //
  // A programme whose run has not started or has already ended is not an offer, so it is dropped
  // outright. A programme that is running but is outside its redemption hours right now is a
  // different thing: it is real, it is claimable, and the cardholder can lock a voucher in today
  // and use it tomorrow. Those stay in the list, ranked below the ones open now and labelled with
  // when they come back.
  //
  // This is deliberate and it is load-bearing for the demo. The hero programme's window is
  // Tue-Thu 14:00-17:00 and the demo clock is Friday 15:12, so hiding what is shut right now
  // would take Soujourner Coffee out of the pull list at exactly the moment the pitch searches
  // for coffee. To hide them instead, move openNow() into the filter below and drop `open_now`
  // from the sort — one line each, and the funnel line already reports both counts either way.
  // --------------------------------------------------------------------------------------------
  const open = live.filter((c) => {
    const start = c.window?.start ?? c.configuration?.window_start ?? null;
    const end = c.window?.end ?? c.configuration?.window_end ?? null;
    if (start && today && start > today) return false;   // not started
    if (end && today && end < today) return false;       // already closed
    return true;
  });
  if (!intent) return { searched: live.length, open: open.length, in_category: 0, results: [] };

  const inCategory = open.filter((c) => intent.categories.includes(profiles?.[c.merchant_id]?.category));
  const { districts: catchment, exact_only } = catchmentOf(holderProfile, adjacency);
  const results = inCategory
    .map((c) => {
      const mp = profiles?.[c.merchant_id] ?? null;
      const districts = outletDistricts(mp);
      const near = districts.filter((d) => catchment.has(d));
      return { campaign: c, merchant: mp, districts, near, nearest: near[0] ?? null,
               open_now: openNow(c, clock) };            // 2. WHEN — see the filter note above
    })
    .filter((r) => r.near.length > 0)                    // 1. WHERE — see the filter note above
    // Open right now first, then most outlets the cardholder can reach, then by name so the order
    // is stable between renders. Nothing here is ranked by propensity: that is the push channel's
    // question.
    .sort((a, b) => Number(b.open_now) - Number(a.open_now)
                    || b.near.length - a.near.length
                    || String(a.merchant?.name).localeCompare(String(b.merchant?.name)));

  return {
    searched: live.length, open: open.length, in_category: inCategory.length, results,
    open_now: results.filter((r) => r.open_now).length,
    districts: districtsOf(holderProfile), exact_only,
  };
}
