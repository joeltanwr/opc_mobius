// The event bus — one for all three views, and for a second browser tab showing another view.
//
// The append-only event log in localStorage is the source of truth. Every tab derives its state
// as seed + replay(log), and re-derives it whenever the log changes — its own dispatch, another
// tab's dispatch (BroadcastChannel, with the `storage` event as the fallback), or a reset. No tab
// ever applies an event twice or out of order, and a page opened late sees the same state as one
// that was open all along. Replay is cheap: a demo produces dozens of events, not thousands.
//
// Timestamps: the demo clock is fixed (2026-09-11 15:12 SGT), so live events are stamped demo
// clock + time elapsed since this tab loaded. Ordering across tabs comes from the log, not the
// stamp.

import { reduce } from "./store.js";

const CHANNEL = "mobius-state";
const LOG_KEY = "mobius.events.v1";

function readLog(storage) {
  try {
    const raw = storage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLog(storage, log) {
  try {
    storage.setItem(LOG_KEY, JSON.stringify(log));
    return true;
  } catch {
    return false;
  }
}

export function replay(seed, log) {
  let state = seed;
  for (const event of log) state = reduce(state, event);
  return state;
}

export function createBus({ seed, storage = globalThis.localStorage, channelFactory = (name) => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(name)) }) {
  const loadedAt = Date.now();
  const clockBase = seed.clock ? Date.parse(seed.clock) : loadedAt;
  const listeners = new Set();
  let log = storage ? readLog(storage) : [];
  let state = replay(seed, log);

  const notify = () => listeners.forEach((fn) => fn(state));
  const rederive = () => {
    log = storage ? readLog(storage) : log;
    state = replay(seed, log);
    notify();
  };

  const channel = channelFactory(CHANNEL);
  if (channel) channel.onmessage = (msg) => { if (msg?.data?.kind === "log-changed") rederive(); };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => { if (e.key === LOG_KEY) rederive(); });
  }

  const stamp = () => new Date(clockBase + (Date.now() - loadedAt)).toISOString().replace("Z", "+00:00");

  return {
    getState: () => state,
    getLog: () => log,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispatch(event) {
      const stamped = { ...event, seq: log.length + 1, at: event.at ?? stamp() };
      log = [...log, stamped];
      if (storage) writeLog(storage, log);
      state = reduce(state, stamped);
      notify();
      if (channel) channel.postMessage({ kind: "log-changed", seq: stamped.seq });
      return stamped;
    },
    reset() {
      log = [];
      if (storage) storage.removeItem(LOG_KEY);
      state = seed;
      notify();
      if (channel) channel.postMessage({ kind: "log-changed", seq: 0 });
    },
    stamp,
  };
}
