import React, { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useDemoData } from "../data/DataProvider";
import { buildSeed } from "./seed.js";
import { createBus } from "./bus.js";
import { liveReach } from "./store.js";

// The one shared state for all three views: seeded from public/data, mutated only through the
// bus, rendered through display() so status keys never leak onto a screen as raw strings.

const StateContext = createContext(null);

export function StateProvider({ children }) {
  const { status, data } = useDemoData();
  const busRef = useRef(null);
  if (status === "ready" && !busRef.current) busRef.current = createBus({ seed: buildSeed(data) });
  const bus = busRef.current;

  const state = useSyncExternalStore(
    (onChange) => (bus ? bus.subscribe(onChange) : () => {}),
    () => (bus ? bus.getState() : null),
    () => null
  );

  const value = useMemo(() => {
    if (!bus || !state) return null;
    const rounding = state.caps.reach_rounding;
    return {
      state,
      dispatch: bus.dispatch,
      reset: bus.reset,
      log: bus.getLog,
      // The display map from constants.json, applied here and nowhere else.
      display: (statusKey) => state.status_display[statusKey] ?? statusKey,
      reachOf: (campaign) => liveReach(campaign, rounding),
      offersFor: (cardholderId) => (state.cardholders[cardholderId]?.feed ?? []).map((id) => state.offers[id]).filter(Boolean),
      offersOf: (campaignId) => Object.values(state.offers).filter((o) => o.campaign_id === campaignId),
    };
  }, [bus, state]);

  useEffect(() => () => { /* the bus outlives route changes; nothing to tear down per render */ }, []);

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

export function useMobiusState() {
  const ctx = useContext(StateContext);
  if (ctx === undefined) throw new Error("useMobiusState must be used within a StateProvider");
  return ctx; // null until the dataset has loaded
}
