// The campaign status ladder — brief §4. One set of keys, used by all three views. The display
// map (constants.json status_display, e.g. capped → "Fully redeemed") is applied at render time by
// StateProvider's display(); nothing in state ever holds a display string.
//
//   applied → draft → active → capped | stopped | completed
//            (draft → pending → active remains legal and unused)
//
// Merchant §9 and RM §9 disagree on whether a merchant stopping a campaign lands on `stopped` or
// `completed`; the brief's ladder settles it as its own terminal state, and the reducer freezes
// results on both.
//
// `active` covers two things a merchant distinguishes and the ladder does not: a programme whose
// window is open, and one approved with a start date still ahead of it. That difference is a
// display refinement (QUEUED_DISPLAY, "In queue") applied at render time, not a ladder state —
// see isQueued() in store.js. A state that is only ever a label is not a state.

export const STATUSES = ["applied", "draft", "pending", "active", "capped", "stopped", "completed"];

export const TRANSITIONS = {
  applied: ["draft"],
  // draft → active is the path the demo walks: the merchant submits and the programme starts,
  // with no approval step in between. `pending` is still a legal state and still reachable — the
  // reducer, the display map and this audit all continue to handle it — but nothing in the demo
  // script puts a campaign there any more. Kept rather than deleted because approval is a phase
  // question, not a modelling error: the edge comes back by pointing the submit button at
  // `pending` again, and nothing else has to be rebuilt.
  draft: ["pending", "active"],
  pending: ["active"],
  active: ["capped", "stopped", "completed"],
  capped: [],
  stopped: [],
  completed: [],
};

// Who moves a campaign along each edge. The reducer records `by` on every move; a view can use
// this to hide a control from the wrong actor, but the reducer never trusts the view.
export const ACTORS = {
  "applied→draft": "rm",        // RM opens the application and starts configuring
  "draft→pending": "rm",        // set-up page submitted with the configuration attached
  "draft→active": "merchant",   // merchant submits; the programme starts, or queues until its start date
  "pending→active": "ocbc",     // OCBC approval; retained for the edge the demo no longer walks
  "active→capped": "system",    // redemption limit or reach cap reached
  "active→stopped": "merchant", // merchant stops it; results freeze
  "active→completed": "system", // window ended
};

export const TERMINAL = STATUSES.filter((s) => TRANSITIONS[s].length === 0);

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminal(status) {
  return TERMINAL.includes(status);
}

export function reachableFrom(start = "applied") {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const next of TRANSITIONS[queue.shift()] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// Everything validate.py asserts about the ladder, computed from the ladder itself.
export function ladderAudit(statusDisplay = {}) {
  const reachable = reachableFrom("applied");
  const displayKeys = Object.keys(statusDisplay);
  return {
    states: STATUSES,
    terminal: TERMINAL,
    unreachable: STATUSES.filter((s) => !reachable.has(s)),
    transitions_to_unknown: Object.entries(TRANSITIONS).flatMap(([from, tos]) => tos.filter((t) => !STATUSES.includes(t)).map((t) => `${from}→${t}`)),
    missing_display: STATUSES.filter((s) => !displayKeys.includes(s)),
    extra_display: displayKeys.filter((k) => !STATUSES.includes(k)),
    every_edge_has_actor: Object.entries(TRANSITIONS).every(([from, tos]) => tos.every((t) => ACTORS[`${from}→${t}`])),
  };
}
