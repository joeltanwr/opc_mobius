// THROWAWAY test page — no styling, no real UI. Proves the customer side of the shared state
// module against TestRM open in another tab. Delete once the customer view exists.
import React, { useState } from "react";
import { useMobiusState } from "../../state/StateProvider";

export default function TestCustomer() {
  const m = useMobiusState();
  const [who, setWho] = useState("bernice");
  if (!m) return <pre>loading</pre>;
  const { state, dispatch, offersFor } = m;
  const ch = state.cardholders[who];
  const feed = offersFor(who);
  const weights = Object.entries(ch.profile.category_weights).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={{ fontFamily: "monospace", padding: 16 }}>
      <h1>TEST · customer side</h1>
      <p>
        cardholder{" "}
        <select data-testid="who" value={who} onChange={(e) => setWho(e.target.value)}>
          {Object.keys(state.cardholders).map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>{" "}
        · offers {ch.consent.offers ? "on" : "off"} · push {ch.consent.push ? "on" : "off"} · pushes this week{" "}
        <b data-testid="pushes-this-week">{ch.pushes_this_week}</b> / {state.caps.push_per_week}
        {state.caps.provisional.push_per_week ? " (provisional)" : ""} · notifications <b data-testid="notifications">{ch.notifications.length}</b>
      </p>
      <p>
        <button data-testid="offers-off" onClick={() => dispatch({ type: "OFFERS_OFF", cardholder_id: who })} disabled={!ch.consent.offers}>turn offers off</button>{" "}
        <button data-testid="offers-on" onClick={() => dispatch({ type: "OFFERS_ON", cardholder_id: who })} disabled={ch.consent.offers}>turn offers on</button>{" "}
        <button onClick={() => dispatch({ type: "PUSH_PREF", cardholder_id: who, push: !ch.consent.push })}>toggle push</button>
      </p>
      <h2>notifications (push arrived)</h2>
      <pre data-testid="notification-list">{JSON.stringify(ch.notifications, null, 1)}</pre>
      <h2>feed ({feed.length})</h2>
      <ul data-testid="feed">
        {feed.map((o) => (
          <li key={o.id} data-testid={`offer-${o.id}`}>
            {o.id} · {o.merchant_name} · {o.offer_headline ?? o.reward_type} · status <b>{o.status}</b> · via {o.via} · expires {o.expires_at}
            {o.status === "delivered" && <button data-testid={`redeem-${o.id}`} onClick={() => dispatch({ type: "REDEEMED", offer_id: o.id })}>redeem</button>}
            {o.code && <b> code {o.code}</b>}
          </li>
        ))}
      </ul>
      <h2>every card this cardholder has ever held (incl. expired / closed / withdrawn / redeemed)</h2>
      <pre data-testid="all-offers">
        {JSON.stringify(Object.values(state.offers).filter((o) => o.cardholder_id === who).map((o) => ({ id: o.id, status: o.status, via: o.via, closed: o.closed ?? null, withdrawn: o.withdrawn ?? null, code: o.code ?? null })), null, 1)}
      </pre>
      <h2>profile weights (top 5) — move on redemption</h2>
      <pre data-testid="weights">{JSON.stringify(Object.fromEntries(weights), null, 1)}</pre>
      <pre data-testid="last-redemption">{JSON.stringify(ch.profile.last_redemption, null, 1)}</pre>
      <h2>the other side, from this tab: C-SJ-03 counters</h2>
      <pre data-testid="campaign-counters">{JSON.stringify({ status: state.campaigns["C-SJ-03"]?.status, ...state.campaigns["C-SJ-03"]?.counters }, null, 1)}</pre>
    </div>
  );
}
