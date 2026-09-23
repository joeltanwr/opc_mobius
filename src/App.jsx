import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { DataProvider, useDemoData } from "./data/DataProvider";
import { StateProvider, useMobiusState } from "./state/StateProvider";
import { rewardConfigUnlocked } from "./state/store.js";
import { MERCHANT_EXTRA_SCREENS, RM_EXTRA_SCREENS, DEMO_CAMPAIGN_ID, DEMO_LAYER } from "./data/constants";
import AppShell from "./components/AppShell";
import { TraceProvider } from "./components/SystemTrace";
import Overview from "./screens/Overview";
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
import ConsolidatedHome from "./screens/app/ConsolidatedHome";
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

// ----------------------------------------------------------------------------------------------
// The set-up page's door.
//
// The merchant reaches this page by signing up and clearing the eligibility gate, and by no other
// route — so the guard has to refuse a typed URL and a stale bookmark as firmly as the missing tab
// refuses a click. A locked visit goes back to Customer profile, which is where the sign-up action
// lives, rather than to a dead end explaining what went wrong.
//
// The RM's own configuration screen is a separate route under /rm and is not gated here: the RM
// works the application after it arrives, which is the whole point of the handoff.
// ----------------------------------------------------------------------------------------------
function RequireRewardConfig({ children }) {
  const m = useMobiusState();
  if (!m) return null;
  if (!rewardConfigUnlocked(m.state, DEMO_CAMPAIGN_ID)) return <Navigate to="/target-customer" replace />;
  return children;
}

export default function App() {
  return (
    <DataProvider>
      <StateProvider>
      {/* The System Trace's memory (open or collapsed, a highlighted stage, the chatbot's last
          answer) sits above the router so it survives a hop between views. Demo layer only. */}
      <TraceProvider>
      <Routes>
        <Route
          element={
            <LoadGate>
              <AppShell />
            </LoadGate>
          }
        >
          {/* The overview is the merchant view's first tab, not a page outside the chrome. "/" still
              resolves to it so a cold load, a bookmark and the deployed root all land somewhere. */}
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/target-customer" element={<TargetCustomer />} />
          <Route path="/results" element={<CampaignResults />} />

          {/* Reward Configuration — the RM view's Configure screen, reused as the merchant's third
              tab rather than reimplemented, so there is one configuration surface instead of two
              that drift. Inaccessible, not merely hidden: the guard turns a typed URL away as
              firmly as the missing tab turns away a click. */}
          <Route
            path="/reward-configuration"
            element={
              <RequireRewardConfig>
                <RewardConfiguration campaignId={DEMO_CAMPAIGN_ID} actor="merchant" />
              </RequireRewardConfig>
            }
          />

          {/* Disconnected from the nav and the router, kept whole in the codebase: the Set-up page
              that Reward Configuration replaced, plus the demand-gap detector, the segment panel
              and the allocation preview. Their analysis still runs and still feeds Customer
              Profile. One flag in constants.js mounts them all again — nothing is commented out. */}
          {MERCHANT_EXTRA_SCREENS && (
            <>
              <Route path="/reward-setup" element={<RewardSetup />} />
              <Route path="/demand-gap" element={<DemandGap />} />
              <Route path="/opportunity" element={<OpportunityPanel />} />
              <Route path="/preview" element={<PreviewMode />} />
            </>
          )}
        </Route>

        {/* The OCBC relationship manager's screens. Same shell, slate "OCBC internal" chrome, its
            own nav — one platform, two sides, and a judge can tell which is which at a glance. */}
        <Route
          element={
            <LoadGate>
              <AppShell variant="rm" />
            </LoadGate>
          }
        >
          <Route path="/rm" element={<PortfolioDashboard />} />
          <Route path="/rm/campaign/:campaignId" element={<RMCampaignDetail />} />

          {/* Pending brief and the RM-side Configure route are disconnected from the nav and the
              router. The Configure component itself is not parked — it is the merchant's Reward
              Configuration tab above — so only this entry point is gone. One flag restores both. */}
          {RM_EXTRA_SCREENS && (
            <>
              <Route path="/rm/pending/:campaignId" element={<PendingProgramme />} />
              <Route path="/rm/configure/:campaignId" element={<RewardConfiguration />} />
            </>
          )}
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
          {/* Demo presentation layer, not part of the cardholder app's IA — four cardholders'
              home screens at once, so the allocator's scope can be watched rather than asserted.
              It shares AppFrame's chrome because it is reached from a toggle inside the cardholder
              view, and AppFrame renders it unframed: it draws its own four devices. Behind
              DEMO_LAYER with the rest of the pitch scaffolding. */}
          {DEMO_LAYER && <Route path="/app/all" element={<ConsolidatedHome />} />}
          <Route path="/app/rewards" element={<Rewards />} />
          <Route path="/app/rewards/:offerId" element={<RewardDetail />} />
          <Route path="/app/redeem/:offerId" element={<Redeem />} />
          <Route path="/app/profile" element={<Preferences />} />
        </Route>

        {/* Every other path lands on the overview rather than on nothing. The three disconnected
            screens still have URLs in people's history and in last week's screenshots, and an
            unmatched path inside a pathless layout route renders a blank page — which is the one
            thing that must not happen on a projector. */}
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
      </TraceProvider>
      </StateProvider>
    </DataProvider>
  );
}
