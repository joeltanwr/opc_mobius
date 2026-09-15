import React from "react";
import { Routes, Route } from "react-router-dom";
import { DataProvider, useDemoData } from "./data/DataProvider";
import { StateProvider } from "./state/StateProvider";
import AppShell from "./components/AppShell";
import Landing from "./screens/Landing";
import TargetCustomer from "./screens/TargetCustomer";
import DemandGap from "./screens/DemandGap";
import OpportunityPanel from "./screens/OpportunityPanel";
import CampaignResults from "./screens/CampaignResults";
import PreviewMode from "./screens/PreviewMode";
import RewardSetup from "./screens/RewardSetup";
import PortfolioDashboard from "./screens/rm/PortfolioDashboard";
import PendingProgramme from "./screens/rm/PendingProgramme";
import RewardConfiguration from "./screens/rm/RewardConfiguration";
import RMCampaignDetail from "./screens/rm/CampaignDetail";
import AppFrame from "./screens/app/AppFrame";
import BankingHome from "./screens/app/BankingHome";
import Rewards from "./screens/app/Rewards";
import RewardDetail from "./screens/app/RewardDetail";
import Redeem from "./screens/app/Redeem";
import Preferences from "./screens/app/Preferences";

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
        </Route>

        {/* The OCBC relationship manager's four screens. Same shell, slate "OCBC internal" chrome,
            its own nav — one platform, two sides, and a judge can tell which is which at a glance. */}
        <Route
          element={
            <LoadGate>
              <AppShell variant="rm" />
            </LoadGate>
          }
        >
          <Route path="/rm" element={<PortfolioDashboard />} />
          <Route path="/rm/pending/:campaignId" element={<PendingProgramme />} />
          <Route path="/rm/configure/:campaignId" element={<RewardConfiguration />} />
          <Route path="/rm/campaign/:campaignId" element={<RMCampaignDetail />} />
        </Route>

        {/* The cardholder's own app. Its own frame and its own chrome — this is the only screen in
            the system a member of the public would ever see, and it must not look like the bank's
            internal tooling with a phone drawn around it. */}
        <Route
          element={
            <LoadGate>
              <AppFrame />
            </LoadGate>
          }
        >
          <Route path="/app" element={<BankingHome />} />
          <Route path="/app/rewards" element={<Rewards />} />
          <Route path="/app/rewards/:offerId" element={<RewardDetail />} />
          <Route path="/app/redeem/:offerId" element={<Redeem />} />
          <Route path="/app/profile" element={<Preferences />} />
        </Route>
      </Routes>
      </StateProvider>
    </DataProvider>
  );
}
