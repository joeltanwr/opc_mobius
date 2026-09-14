// THROWAWAY test page — no styling, no real UI. Proves the RM side of the shared state module
// against a second page (TestCustomer) open in another tab. Delete once the RM view exists.
import React, { useState } from "react";
import { useMobiusState } from "../../state/StateProvider";

const DEMO = "C-SJ-03";
const CONFIG = {
  reward_type: "discount", offer_headline: "20% off any drink, weekday afternoons",
  offer_terms: "20% off, capped at S$5 per transaction. Tue–Thu 14:00–17:00. One redemption per visit.",
  days_of_week: [1, 2, 3], hours: [14, 17],
};
const WINDOW = { start: "2026-09-14", end: "2026-10-11" };
const NEXT = { applied: "draft", draft: "pending", pending: "active" };
const BY = { draft: "rm", pending: "rm", active: "ocbc" };

export default function TestRM() {
  const m = useMobiusState();
  const [limit, setLimit] = useState(2);
  const [recipients, setRecipients] = useState("bernice,edwin");
  if (!m) return <pre>loading</pre>;
  const { state, dispatch, reset, display, reachOf, offersOf } = m;
  const c = state.campaigns[DEMO];
  const next = NEXT[c.status];
  const ids = recipients.split(",").map((s) => s.trim()).filter(Boolean);
  const atCap = ids.filter((id) => state.cardholders[id] && state.cardholders[id].pushes_this_week >= state.caps.push_per_week);
  const offersOff = ids.filter((id) => state.cardholders[id] && !state.cardholders[id].consent.offers);

  return (
    <div style={{ fontFamily: "monospace", padding: 16 }}>
      <h1>TEST · RM side · {DEMO}</h1>
      <p>
        status key: <b data-testid="status">{c.status}</b> · display (render time only): <b data-testid="status-display">{display(c.status)}</b> · live reach:{" "}
        <b data-testid="reach">{String(reachOf(c))}</b>
      </p>
      <p>
        {next ? (
          <button
            data-testid="advance"
            onClick={() =>
              dispatch({
                type: "ADVANCE", campaign_id: DEMO, to: next, by: BY[next],
                ...(next === "pending" ? { configuration: { ...CONFIG, redemption_limit: Number(limit) } } : {}),
                ...(next === "active" ? { window: WINDOW } : {}),
              })
            }
          >
            advance {c.status} → {next}
          </button>
        ) : (
          <span>terminal or active</span>
        )}{" "}
        limit <input data-testid="limit" value={limit} onChange={(e) => setLimit(e.target.value)} size={3} />{" "}
        <button data-testid="stop" onClick={() => dispatch({ type: "STOPPED", campaign_id: DEMO, by: "merchant", reason: "test stop" })}>stop</button>{" "}
        <button data-testid="reset" onClick={reset}>reset demo</button>
      </p>
      <p>
        recipients <input data-testid="recipients" value={recipients} onChange={(e) => setRecipients(e.target.value)} size={30} />{" "}
        <button data-testid="push" onClick={() => dispatch({ type: "PUSH_FIRED", campaign_id: DEMO, recipients: ids, by: "rm" })}>fire push</button>
        <br />
        confirmation preview: {ids.length} recipients · {atCap.length} already at the weekly cap ({atCap.join(", ") || "none"}) will get the feed card and no push ·{" "}
        {offersOff.length} have offers off ({offersOff.join(", ") || "none"}) and are excluded
      </p>
      <h2>counters (merchant dashboard + RM detail read these)</h2>
      <pre data-testid="counters">{JSON.stringify(c.counters, null, 1)}</pre>
      <p>
        redemptions <b data-testid="redemptions">{c.counters.redemptions}</b> · pushes sent <b data-testid="sent">{c.counters.pushes_sent}</b> · pushes suppressed{" "}
        <b data-testid="suppressed">{c.counters.pushes_suppressed}</b> · feed delivered <b data-testid="delivered">{c.counters.feed_delivered}</b> · post-freeze redemptions{" "}
        <b data-testid="post-freeze">{c.post_freeze.redemptions}</b>
      </p>
      <h2>pushes</h2>
      <pre data-testid="pushes">{JSON.stringify(c.pushes, null, 1)}</pre>
      <h2>offers for this campaign</h2>
      <pre data-testid="offers">{JSON.stringify(offersOf(DEMO).map((o) => ({ id: o.id, status: o.status, via: o.via, code: o.code ?? null })), null, 1)}</pre>
      <h2>frozen / capped / stopped</h2>
      <pre>{JSON.stringify({ frozen: c.frozen, capped: c.capped, stopped: c.stopped, segment_departures: c.segment_departures }, null, 1)}</pre>
      <h2>ledger ({state.ledger.length})</h2>
      <pre data-testid="ledger">{JSON.stringify(state.ledger.slice(-8), null, 1)}</pre>
    </div>
  );
}
