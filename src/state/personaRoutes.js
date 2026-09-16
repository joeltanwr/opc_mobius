import { PERSONAS, DEFAULT_PERSONA } from "../data/constants";

// ----------------------------------------------------------------------------------------------
// Where each persona was left.
//
// The switcher moves between three route trees, and changing tree unmounts the shell that holds
// the switcher — so this record cannot live in React state or it would be gone at exactly the
// moment it is needed. It is module-level for the life of the page, which is also the life of the
// demo: a presenter who steps into the RM view mid-configuration and comes back lands on the
// screen they left, not on the persona's front door.
//
// Everything that is actually *in progress* — the campaign, its configuration, the ledger — lives
// on the bus above the router and was never at risk. This only restores the vantage point.
// ----------------------------------------------------------------------------------------------

const ENTRY = Object.fromEntries(PERSONAS.map((p) => [p.key, p.entry]));

export function personaOf(pathname) {
  const hit = PERSONAS.find(
    (p) => p.prefix && (pathname === p.prefix || pathname.startsWith(`${p.prefix}/`))
  );
  return hit?.key ?? DEFAULT_PERSONA;
}

export function personaBy(key) {
  return PERSONAS.find((p) => p.key === key) ?? PERSONAS[0];
}

const lastPath = { ...ENTRY };

export function rememberPath(pathname) {
  // "/" is only the redirect into the overview tab; the tab itself is a merchant screen and is
  // remembered like any other. Recording the redirect would send the merchant switch to a path
  // that immediately bounces, which reads as a flicker mid-pitch.
  if (pathname === "/") return;
  lastPath[personaOf(pathname)] = pathname;
}

export function pathFor(key) {
  return lastPath[key] ?? ENTRY[key] ?? PERSONAS[0].entry;
}
