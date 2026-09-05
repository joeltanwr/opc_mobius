import React from "react";
import { Routes, Route } from "react-router-dom";
import { DataProvider, useDemoData } from "./data/DataProvider";
import AppShell from "./components/AppShell";
import Landing from "./screens/Landing";
import MerchantView from "./screens/MerchantView";
import DemandGap from "./screens/DemandGap";
import OpportunityPanel from "./screens/OpportunityPanel";
import RewardRM from "./screens/RewardRM";
import CampaignResults from "./screens/CampaignResults";
import PreviewMode from "./screens/PreviewMode";
import ConsumerView from "./screens/ConsumerView";

function LoadGate({ children }) {
  const { status, error } = useDemoData();
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-3 rounded-full border-2 border-border border-t-brand animate-spin" />
          <p className="text-[13px] text-ink-secondary">Loading demo dataset…</p>
        </div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
        <div className="max-w-md text-center">
          <p className="text-[14px] font-semibold text-ink mb-1">Couldn't load the demo dataset.</p>
          <p className="text-[13px] text-ink-secondary">{error}</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <DataProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          element={
            <LoadGate>
              <AppShell />
            </LoadGate>
          }
        >
          <Route path="/merchant-view" element={<MerchantView />} />
          <Route path="/demand-gap" element={<DemandGap />} />
          <Route path="/opportunity" element={<OpportunityPanel />} />
          <Route path="/reward-rm" element={<RewardRM />} />
          <Route path="/results" element={<CampaignResults />} />
          <Route path="/preview" element={<PreviewMode />} />
          <Route path="/consumer" element={<ConsumerView />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}
