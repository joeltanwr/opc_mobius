import React, { createContext, useContext, useEffect, useState } from "react";

// Every file the pipeline writes to public/data/. This list is the app's whole data contract:
// pipeline/run_all.py is the only writer, and nothing here is hand-maintained. The old standalone
// merchant directory file is gone for good — merchant names, districts and categories live in
// merchant_profiles.json, and names for merchants OCBC does not bank come with the segment or
// affinity row that references them (see merchantName below).
const FILES = {
  constants: "constants.json",
  taxonomy: "taxonomy.json",
  merchantProfiles: "merchant_profiles.json",
  demandGaps: "demand_gaps.json",
  affinity: "affinity.json",
  segments: "segments.json",
  benchmarks: "benchmarks.json",
  rewardRecommendations: "reward_recommendations.json",
  merchantPriority: "merchant_priority.json",
  allocationSummary: "allocation_summary.json",
  campaignResults: "campaign_results.json",
  rationales: "rationales.json",
  showcasePersonas: "showcase_personas.json",
  depositFlows: "deposit_flows.json",
};

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          Object.entries(FILES).map(async ([key, file]) => {
            const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
            if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
            return [key, await res.json()];
          })
        );
        if (!cancelled) {
          setState({ status: "ready", data: Object.fromEntries(entries), error: null });
        }
      } catch (err) {
        if (!cancelled) setState({ status: "error", data: null, error: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

export function useDemoData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useDemoData must be used within a DataProvider");
  return ctx;
}

// Convenience helper: find a merchant's taxonomy category record.
export function categoryFor(taxonomy, categoryId) {
  return taxonomy?.categories?.find((c) => c.id === categoryId) ?? null;
}

// A merchant's profile — name, district, category, its own trading data. Present only for
// merchants OCBC banks; everyone else is a name on a segment or affinity row, nothing more.
export function merchantById(profiles, merchantId) {
  return profiles?.[merchantId] ?? null;
}

// A display name for any merchant id, including one with no profile (a lift-pair candidate such
// as Brew & Co. is a comparable merchant, not an OCBC customer). Falls back to the id.
export function merchantName(data, merchantId) {
  const profile = data?.merchantProfiles?.[merchantId];
  if (profile) return profile.name;
  for (const list of Object.values(data?.segments ?? {})) {
    const hit = list.find((s) => s.candidate_merchant === merchantId);
    if (hit?.candidate_name) return hit.candidate_name;
  }
  for (const entry of Object.values(data?.affinity ?? {})) {
    const hit = (entry?.pairs ?? []).find((p) => p.merchant_id === merchantId);
    if (hit?.name) return hit.name;
  }
  for (const persona of data?.showcasePersonas ?? []) {
    const hit = (persona.top_merchants ?? []).find((m) => m.merchant_id === merchantId);
    if (hit?.canonical_name) return hit.canonical_name;
  }
  return merchantId;
}

// The privacy floor and the reach rounding, from the pipeline manifest, which is their only
// source. Every screen that states either number reads it here rather than typing it, because a
// floor that moves in the pipeline while the copy still says 250 is a promise the build no longer
// keeps. Returns the bases too, so a component can attribute the rule as well as quote it.
export function usePrivacyRules() {
  const { data } = useDemoData();
  const floor = data?.constants?.constants?.MIN_SEGMENT_SIZE ?? null;
  const rounding = data?.constants?.constants?.REACH_ROUNDING ?? null;
  return {
    floor: floor?.value ?? null,
    rounding: rounding?.value ?? null,
    floorBasis: floor?.basis ?? null,
    roundingBasis: rounding?.basis ?? null,
  };
}

// The pipeline's own constants manifest: every figure with its basis and provisional flag.
export function constantOf(data, key) {
  return data?.constants?.constants?.[key] ?? null;
}
