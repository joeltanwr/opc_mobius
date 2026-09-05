import React, { createContext, useContext, useEffect, useState } from "react";

const FILES = {
  taxonomy: "taxonomy.json",
  merchantProfiles: "merchant_profiles.json",
  demandGaps: "demand_gaps.json",
  affinity: "affinity.json",
  segments: "segments.json",
  benchmarks: "benchmarks.json",
  campaignResults: "campaign_results.json",
  rationales: "rationales.json",
  showcasePersonas: "showcase_personas.json",
  depositFlows: "deposit_flows.json",
  merchantDirectory: "merchant_directory.json",
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

// Convenience helper: look up a merchant's public directory entry (name,
// category, district — never cardholder-level data) by id.
export function merchantById(directory, merchantId) {
  return directory?.find((m) => m.merchant_id === merchantId) ?? null;
}
