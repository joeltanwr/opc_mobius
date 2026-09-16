import React, { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useDemoData } from "../data/DataProvider";
import { buildSeed } from "./seed.js";
import { createBus } from "./bus.js";
import { liveReach, isQueued } from "./store.js";
import { QUEUED_DISPLAY } from "../data/constants";

// The one shared state for all three views: seeded from public/data, mutated only through the
// bus, rendered through display() so status keys never leak onto a screen as raw strings.

const StateContext = createContext(null);

// ----------------------------------------------------------------------------------------------
// The hero merchant's application is seeded, not clicked.
//
// The RM's pending queue is the RM view's first screen, and it must not be empty because nobody
// walked the merchant screen first — a demo that depends on being driven in one order breaks the
// first time a judge asks to see something out of sequence. So on a cold load the application is
// replayed into the log as a real, attributed APPLY event stamped with the date the pipeline ships
// (DEMO_APPLICATION_DATE), which is exactly what the merchant's click would have written. It is a
// logged event with provenance, not a field quietly set behind the reducer's back.
//
// The click itself stays demonstrable: `rewind()` clears the log and suppresses the bootstrap for
// the life of the page, so the merchant screen goes back to offering the button and the handoff
// can be performed live. A reload starts from the seeded application again.
// ----------------------------------------------------------------------------------------------
const DEMO_CAMPAIGN = "C-SJ-03";
let skipBootstrap = false;

function bootstrapApplication(bus, data) {
  if (skipBootstrap || bus.getLog().length > 0) return;
  const at = data?.constants?.constants?.DEMO_APPLICATION_DATE?.value;
  const campaign = bus.getState().campaigns[DEMO_CAMPAIGN];
  if (!at || !campaign || campaign.status !== "applied" || campaign.applied_at) return;
  bus.dispatch({ type: "APPLY", campaign_id: DEMO_CAMPAIGN, by: "merchant", at,
                 rm_message: "A relationship manager will be in touch within the week." });
}

export function StateProvider({ children }) {
  const { status, data } = useDemoData();
  const busRef = useRef(null);
  if (status === "ready" && !busRef.current) {
    busRef.current = createBus({ seed: buildSeed(data) });
    bootstrapApplication(busRef.current, data);
  }
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
      // Demo control: back to before the merchant applied, so the handoff can be clicked live.
      rewind: () => { skipBootstrap = true; bus.reset(); },
      // ----------------------------------------------------------------------------------------
      // Reset the demo to a cold load — the general utility, not a fix for one programme.
      //
      // What actually caches a configuration between sessions is the append-only event log in
      // localStorage (bus.js, "mobius.events.v1"). State is seed + replay(log), so a campaign
      // configured on Tuesday is still configured on Wednesday: the CONFIGURE events are replayed
      // over a fresh seed. Nothing is wrong with the seed; the log is the memory.
      //
      // `rewind()` clears that log too, but it also sets skipBootstrap for the life of the page,
      // which suppresses the seeded application — useful for demonstrating the handoff live,
      // wrong for "give me this programme back the way it shipped". This does the other thing:
      // drop the log and reload, so the bootstrap runs again and every view starts from the
      // pipeline's own state. The reload is deliberate — it clears any per-page React state the
      // bus does not own, which is the other half of "reset" that a bus.reset() alone misses.
      // ----------------------------------------------------------------------------------------
      resetDemoData: () => {
        bus.reset();
        if (typeof window !== "undefined") window.location.reload();
      },
      log: bus.getLog,
      // The display map from constants.json, applied here and nowhere else. `capped` takes the
      // refinement keyed by the reason the reducer recorded, so a campaign closed by its reach cap
      // is not labelled as one that was fully redeemed.
      display: (statusKey, capReason = null) =>
        (statusKey === "capped" && capReason && state.capped_display?.[capReason]) ||
        state.status_display[statusKey] ||
        statusKey,
      // The campaign-aware form. Two refinements on top of the shipped map, both of which need
      // the campaign and not just its status key: a capped campaign is labelled by the reason it
      // capped, and an active one whose window has not opened yet reads "In queue" rather than
      // "Live". Screens that only hold a status string keep using display() and get the plain map.
      displayOf: (campaign) => {
        const key = campaign?.status;
        if (isQueued(campaign, state.clock)) return QUEUED_DISPLAY;
        return (key === "capped" && state.capped_display?.[campaign?.capped?.why]) || state.status_display[key] || key;
      },
      isQueued: (campaign) => isQueued(campaign, state.clock),
      reachOf: (campaign) => liveReach(campaign, rounding),
      offersFor: (cardholderId) => (state.cardholders[cardholderId]?.feed ?? []).map((id) => state.offers[id]).filter(Boolean),
      // Every card this cardholder has ever held, feed or not. The rewards list needs the expired
      // and redeemed ones too: a status that never has a negative case is decoration.
      allOffersFor: (cardholderId) => Object.values(state.offers).filter((o) => o.cardholder_id === cardholderId),
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
