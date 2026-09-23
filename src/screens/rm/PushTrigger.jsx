import React, { createContext, useContext, useMemo, useState } from "react";
import { FlaskConical, Send, X, AlertTriangle, CheckCircle2, Ban } from "lucide-react";
import { useMobiusState } from "../../state/StateProvider";
import { useDemoData, natureOf } from "../../data/DataProvider";
import { pushPreview, cohortTagsFor } from "../../state/store.js";
import { num } from "../../data/format";
import { Badge, BasisNote, InfoTip } from "../../components/ui";
import { RewardFeedCard, PushNotificationCard, PhoneFrame } from "../../components/RewardCard";
import { useTrace } from "../../components/SystemTrace";
import { DEMO_LAYER, TRACE_VIEWS } from "../../data/constants";

// ---------------------------------------------------------------------------------------------
// RM §3.4 — the manual allocator trigger (the manual push trigger, renamed for what it does).
//
// A demo control, and it looks like one: dashed border, an explicit label, and never the word
// "Send" sitting bare beside a routine action.
//
// The confirmation shows exactly what will be sent, to how many cardholders, and the
// frequency-cap status — how many recipients have already had an offer this week and how many
// will therefore be suppressed. That suppression count is the frequency cap doing visible work in
// front of a judge, in the one moment the system does something rather than displays something,
// so it is the largest figure in the dialog.
//
// Both the dialog and the event that follows it are computed by pushPreview() in the state
// module, from the same state, by the same rules. A confirmation that promised one thing while
// the reducer did another would be the worst possible bug to find on stage; selftest.mjs checks
// the two agree exactly.
// ---------------------------------------------------------------------------------------------

// The dialog is owned by the screen, not by the row that opened it. Firing the push can take a
// campaign to `capped` the same instant — the reach cap doing its job — which unmounts its row in
// the Ongoing table. A dialog owned by that row would disappear with it, taking the suppression
// count off the screen at the one moment the pitch needs it visible. So the provider sits above
// the list and holds only the campaign id; the campaign itself is read from state each render.
const PushDialogContext = createContext(null);

export function PushTriggerProvider({ children }) {
  const [campaignId, setCampaignId] = useState(null);
  return (
    <PushDialogContext.Provider value={setCampaignId}>
      {children}
      {campaignId && <Confirmation campaignId={campaignId} onClose={() => setCampaignId(null)} />}
    </PushDialogContext.Provider>
  );
}

// `queued` is passed by the caller rather than recomputed here: the dashboard already knows which
// of its rows have not started, and the trigger's availability must agree with the label printed
// beside it. A programme in the queue can be fired at only in one sense — it would deliver a card
// against a window nobody can redeem in — so the button refuses and says which date it is waiting
// for rather than going quiet.
export default function PushTrigger({ campaign, compact = false, queued = false }) {
  const open = useContext(PushDialogContext);
  const startsOn = campaign.window?.start ?? campaign.configuration?.window_start ?? null;
  // Aimed at at least one cohort, not merely allocated for one: a campaign whose target pools
  // resolve to no tag has nobody to send to, whatever the allocation once said.
  const pushable = campaign.status === "active" && !queued && campaign.reach != null && cohortTagsFor(campaign).length > 0;

  if (!pushable) {
    return (
      <button
        type="button"
        disabled
        title={
          queued
            ? `This programme has not started${startsOn ? ` — its window opens on ${startsOn}` : ""}. Sending now would put a reward in a cardholder's app that they could not redeem.`
            : campaign.status !== "active"
              ? `This campaign is ${campaign.status}, so nothing can be sent for it.`
              : "No computed allocation is loaded for this campaign in the demo — the trigger only fires against an allocation the pipeline produced, never against an invented list."
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-canvas/60 px-3 py-1.5 text-[12px] font-medium text-ink-light"
      >
        <Ban size={12} /> {queued ? "Not started yet" : "No allocation to push"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => open?.(campaign.id)}
      className="inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-warning bg-warning-bg/50 px-3 py-1.5 text-[12px] font-bold text-ink hover:bg-warning-bg"
    >
      <FlaskConical size={13} className="text-warning" />
      {compact ? "Demo: fire the allocator" : "Demonstration trigger — fire the allocator"}
    </button>
  );
}

function Confirmation({ campaignId, onClose }) {
  const { state, dispatch } = useMobiusState();
  const { data } = useDemoData();
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState(null);
  // Demo layer: firing is the moment the System Trace animates, so while it is docked the overlay
  // stops at its edge rather than dimming it — the room watches the stages light as the send goes.
  const { open: traceOpen } = useTrace();
  const traceDocked = DEMO_LAYER && TRACE_VIEWS.rm && traceOpen;
  const campaign = state.campaigns[campaignId];
  const preview = useMemo(() => pushPreview(state, campaignId, { cohort: true }), [state, campaignId]);
  if (!campaign) return null;
  const cfg = campaign.configuration ?? {};
  const gate = preview.gate;
  const needsAck = gate.ok && gate.over_ceiling;
  const canFire = gate.ok && (!needsAck || acknowledged);

  const offer = {
    company: campaign.merchant_name,
    nature: natureOf(data, campaign.merchant_id),
    reward_type: cfg.reward_type ?? campaign.recommended?.reward_type,
    offer_headline: cfg.offer_headline,
    offer_terms: cfg.offer_terms,
    days_of_week: cfg.days_of_week,
    hours: cfg.hours,
    expires_at: campaign.window?.end ? `${campaign.window.end}T23:59:59+08:00` : null,
    status: "delivered",
  };

  function fire() {
    const stamped = dispatch({ type: "PUSH_COHORT", campaign_id: campaignId, by: "rm", acknowledge_over_ceiling: acknowledged });
    setResult(stamped);
  }

  return (
    <div className={`fixed inset-0 ${traceDocked ? "lg:right-[400px]" : ""} z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6`} onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl border border-border bg-white shadow-card-hover my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <Badge tone="warning"><FlaskConical size={11} /> Demonstration control</Badge>
            <h3 className="text-[17px] font-bold text-ink mt-2">
              {result ? "Allocator fired" : `Send this offer to ${campaign.merchant_name}'s allocated cardholders?`}
            </h3>
            <p className="text-[12.5px] text-ink-secondary mt-0.5">
              {result
                ? "Cards are in the feed. Below is what actually happened."
                : "Demo trigger — in production this is a scheduled send."}
            </p>
          </div>
          <button onClick={onClose} className="text-ink-light hover:text-ink shrink-0" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
          <div className="min-w-0">
            {result ? <Outcome campaign={campaign} /> : <BeforeFiring preview={preview} acknowledged={acknowledged} onAcknowledge={setAcknowledged} />}
          </div>

          {/* Exactly what will be sent — both artefacts, because they are written separately. */}
          <div className="shrink-0">
            <div className="text-[12px] font-semibold text-ink mb-2">Exactly what goes out</div>
            <PhoneFrame
              time={campaign.window ? `From ${campaign.window.start}` : "Today"}
              caption="Sent by OCBC. The merchant never learns who was targeted."
            >
              <PushNotificationCard
                headline={cfg.offer_headline}
                body={cfg.offer_terms}
                merchantName={campaign.merchant_name}
              />
              <RewardFeedCard offer={offer} clock={state.clock} highlight />
            </PhoneFrame>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-4">
          {result ? (
            <button onClick={onClose} className="rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-white">Done</button>
          ) : (
            <>
              <button
                onClick={fire}
                disabled={!canFire}
                className="inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-warning bg-brand px-5 py-2.5 text-[13px] font-bold text-white hover:bg-brand-hover disabled:opacity-40 disabled:bg-ink-light"
              >
                <Send size={15} /> Fire the allocator — {num(preview.delivered)} cardholders
              </button>
              <button onClick={onClose} className="rounded-lg border border-border bg-white px-4 py-2 text-[13px] font-medium text-ink-secondary">Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BeforeFiring({ preview, acknowledged, onAcknowledge }) {
  const gate = preview.gate;
  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- to how many, and the cap's effect */}
      <div className="grid grid-cols-3 gap-3">
        <Figure label="Feed cards delivered" value={num(preview.delivered)} />
        <Figure label="Push notifications sent" value={num(preview.sent)} />
        <Figure
          label="Pushes suppressed by the cap"
          value={num(preview.suppressed)}
          tone="warning"
          emphasis
        />
      </div>
      <p className="text-[12.5px] text-ink-secondary leading-snug">
        <span className="font-semibold text-ink">{num(preview.suppressed)} of {num(preview.delivered)}</span> already at the cap of{" "}
        <span className="font-num font-semibold text-ink">{preview.cap_per_week} pushes a week</span>
        {preview.cap_provisional && <span className="ml-1 rounded bg-canvas border border-border px-1 py-0.5 text-[10.5px] text-ink-secondary">provisional</span>}
        <InfoTip title="What suppression means" className="ml-1">
          They still get the feed card; only the push is withheld, and it's counted, not dropped.
        </InfoTip>
      </p>

      {/* ------------------------------------------------------- the named cardholders, by name only because they are the demo's six */}
      {preview.named.length > 0 && (
        <div className="rounded-lg border border-border bg-canvas/50 px-3 py-2.5">
          <div className="text-[12px] font-semibold text-ink mb-1.5">
            The {preview.named.length} showcase cardholders — the rest are counted, never listed
          </div>
          <ul className="space-y-1">
            {preview.named.map((n) => (
              <li key={n.id} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="font-semibold text-ink">{n.name ?? n.id}</span>
                <Badge tone={n.outcome === "push" ? "success" : n.outcome === "suppressed" ? "warning" : "neutral"}>
                  {n.outcome === "push" ? "push + feed card" : n.outcome === "suppressed" ? "feed card only" : n.outcome.replace("_", " ")}
                </Badge>
                <span className="text-ink-secondary">{n.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-lg border border-border bg-canvas/50 px-3 py-2.5 text-[12.5px] text-ink-secondary">
        <span className="font-semibold text-ink">{num(preview.rest)} more</span> in the allocation;{" "}
        <span className="font-num font-semibold text-ink">{num(preview.rest_suppressed)}</span> expected to be suppressed.
        <InfoTip title="How the rest are counted" className="ml-1">
          Counted in aggregate from the pipeline. No screen holds a list of them.
        </InfoTip>
        <BasisNote>
          Allocation week {preview.allocation_week}. Ranked highest propensity first — visits at the lift-source merchant × afternoon availability;
          not random, not alphabetical.
        </BasisNote>
      </div>

      {/* ------------------------------------------------------- the portfolio position */}
      {!gate.ok ? (
        <div className="rounded-lg border-2 border-brand bg-[#FDECEC]/50 px-3 py-2.5 flex items-start gap-2">
          <Ban size={15} className="text-brand shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-ink">
            <span className="font-bold text-brand">This send is refused. </span>{gate.reason}.
          </p>
        </div>
      ) : gate.over_ceiling ? (
        <div className="rounded-lg border border-warning/60 bg-warning-bg/50 px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-warning shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-ink-secondary">
              <span className="font-semibold text-ink">Past the weekly ceiling:</span>{" "}
              <span className="font-num tabular-nums">
                {num(gate.contacted)} + {num(gate.delivered)} = {num(gate.projected)} against {num(gate.ceiling)} — {num(gate.over_by)} over.
              </span>
              <InfoTip title="Why it warns" className="ml-1">
                The ceiling is provisional, so it warns rather than blocks; the throttle binds. Crossing it is recorded against this push.
              </InfoTip>
            </p>
          </div>
          <label className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold text-ink cursor-pointer">
            <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledge(e.target.checked)} />
            I have seen the breach and am sending anyway
          </label>
        </div>
      ) : (
        <p className="font-num text-[12.5px] text-ink-secondary tabular-nums">
          Portfolio: {num(gate.contacted)} contacted + {num(gate.delivered)} = {num(gate.projected)} of a {num(gate.ceiling)} weekly ceiling.
        </p>
      )}
    </div>
  );
}

function Outcome({ campaign }) {
  const last = campaign.pushes.at(-1);
  if (!last) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Figure label="Feed cards delivered" value={num(last.delivered)} />
        <Figure label="Push notifications sent" value={num(last.sent)} />
        <Figure label="Pushes suppressed by the cap" value={num(last.suppressed)} tone="warning" emphasis />
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success-bg/50 px-3 py-2.5">
        <CheckCircle2 size={15} className="text-success shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-ink-secondary">
          Delivered {num(last.delivered)} = sent {num(last.sent)} + suppressed {num(last.suppressed)}.
          {last.suppressed_detail?.length > 0 && (
            <> Suppressed by name where the cardholder is one of the showcase six: {last.suppressed_detail.map((d) => d.id).join(", ")}.</>
          )}
          <InfoTip title="Why it reconciles" className="ml-1">A suppressed push is a counted outcome, not a disappearance.</InfoTip>
        </p>
      </div>
      {last.portfolio?.over_ceiling && (
        <p className="text-[12px] text-warning">
          Over the weekly ceiling: {num(last.portfolio.contacted_after)} against {num(last.portfolio.ceiling)}
          {last.portfolio.acknowledged_over_ceiling ? ", acknowledged before sending" : ""}.
        </p>
      )}
      {campaign.status === "capped" && (
        <p className="text-[12.5px] text-ink">
          <span className="font-semibold">Reach cap reached</span> — closed to new deliveries, results frozen.
          <InfoTip title="What happens to delivered cards" className="ml-1">
            Cards already delivered stay valid until they expire. A reward a cardholder holds is never revoked.
          </InfoTip>
        </p>
      )}
    </div>
  );
}

function Figure({ label, value, tone = "default", emphasis = false }) {
  const toneClass = { default: "text-ink", warning: "text-warning" }[tone];
  return (
    <div className={`rounded-xl px-3 py-2.5 ${emphasis ? "border-2 border-warning bg-warning-bg/40" : "border border-border bg-canvas/50"}`}>
      <div className={`font-num font-bold leading-none tabular-nums ${emphasis ? "text-[30px]" : "text-[24px]"} ${toneClass}`}>{value}</div>
      <div className="text-[11.5px] text-ink-secondary mt-1.5 leading-snug">{label}</div>
    </div>
  );
}
