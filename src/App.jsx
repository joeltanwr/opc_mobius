import React from "react";
import { Routes, Route } from "react-router-dom";
import { DataProvider, useDemoData } from "./data/DataProvider";
import { StateProvider } from "./state/StateProvider";
import AppShell from "./components/AppShell";
import TestRM from "./screens/_test/TestRM";
import TestCustomer from "./screens/_test/TestCustomer";
import Landing from "./screens/Landing";
import TargetCustomer from "./screens/TargetCustomer";
import DemandGap from "./screens/DemandGap";
import OpportunityPanel from "./screens/OpportunityPanel";
import CampaignResults from "./screens/CampaignResults";
import PreviewMode from "./screens/PreviewMode";
import ConsumerView from "./screens/ConsumerView";
import RewardSetup from "./screens/RewardSetup";

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
      <StateProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        {/* Throwaway propagation test pages — no chrome, no styling. Delete with src/screens/_test/. */}
        <Route path="/_test/rm" element={<LoadGate><TestRM /></LoadGate>} />
        <Route path="/_test/customer" element={<LoadGate><TestCustomer /></LoadGate>} />
        <Route
          element={
            <LoadGate>
              <AppShell />
            </LoadGate>
          }
        >
          <Route path="/demand-gap" element={<DemandGap />} />
          <Route path="/target-customer" element={<TargetCustomer />} />
          <Route path="/opportunity" element={<OpportunityPanel />} />
          <Route path="/results" element={<CampaignResults />} />
          <Route path="/preview" element={<PreviewMode />} />
          <Route path="/reward-setup" element={<RewardSetup />} />
          <Route path="/consumer" element={<ConsumerView />} />
        </Route>
      </Routes>
      </StateProvider>
    </DataProvider>
  );
}
