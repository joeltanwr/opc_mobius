import React, { useEffect } from "react";
import { Bell, BellOff, FlaskConical } from "lucide-react";
import { useMobiusState } from "../../state/StateProvider";
import { CONSOLIDATED_CARDHOLDERS, DEMO_CAMPAIGN_ID, DEMO_LAYER } from "../../data/constants";
import { cohortTagsFor } from "../../state/store.js";
import { heldOffer, verdictFor } from "../../state/trace.js";
import { TraceChip, useTrace } from "../../components/SystemTrace";
import { num } from "../../data/format";
import { Badge } from "../../components/ui";
import BankingHome from "./BankingHome";

// ---------------------------------------------------------------------------------------------
// DEMO PRESENTATION LAYER — four cardholders' home screens at once.
//
// This is not the cardholder app's information architecture and must not be mistaken for it. No
// product shows four people's phones side by side; this exists to answer one question a judge will
// ask out loud — "so does everyone get spammed?" — by letting them watch the answer rather than
// hear it. It is reached from a toggle inside the cardholder view, labelled as a demo control, and
// it is the only screen in the build that renders more than one cardholder.
//
// What makes it worth the space is that it has no targeting logic of its own. Each tile is the
// same BankingHome component the individual view renders, for a different cardholder id, reading
// the same shared state. Whether a notification appears is decided by the allocator — cohort
// membership against the campaign's cohort_tag, in state/store.js — and by the consent and
// frequency rules in the reducer. If this screen could be made to show the wrong thing, so could
// the real one.
//
// Before the RM fires the allocator: four quiet screens. After: the two in the cohort are holding
// the offer and the two outside it are untouched, having been shown nothing and having had nothing
// computed about them on this screen at all.
// ---------------------------------------------------------------------------------------------

export default function ConsolidatedHome() {
  const m = useMobiusState();
  const trace = useTrace();
  const { setHighlight } = trace;
  // A highlighted stage belongs to this screen's chips; leaving the screen puts it out.
  useEffect(() => () => setHighlight(null), [setHighlight]);
  if (!m) return null;
  const { state } = m;
  const campaign = state.campaigns[DEMO_CAMPAIGN_ID] ?? null;

  // In scope is not a property of this screen. It is cohort membership against the tags the
  // campaign is currently aimed at — the same test cohortNamed() applies in the state module
  // before a single card is written, through the same resolver, so a tile cannot disagree with
  // the send. Aimed at, not allocated for: the merchant may have pointed the campaign at a
  // retention pool instead, and showing who that reaches is the whole job of this screen.
  const tags = cohortTagsFor(campaign);
  //
  // Holding, not merely ever sent: a card withdrawn because its cardholder turned offers off has
  // left their feed, so the tile, the count above it and the System Trace all stop counting it
  // (state/trace.js heldOffer — one rule for the three of them).
  const tiles = CONSOLIDATED_CARDHOLDERS.map((entry, i) => {
    const holder = state.cardholders[entry.id] ?? null;
    const inScope = tags.some((t) => (holder?.cohort_membership ?? []).includes(t));
    const offer = heldOffer(state, DEMO_CAMPAIGN_ID, entry.id);
    const chip = campaign && holder ? { n: i + 1, ...verdictFor(state, campaign, entry.id, entry.chip) } : null;
    return { ...entry, holder, inScope, offer, chip };
  });
  // Four phones in a row need the full width; with the trace docked beside them they go two by two
  // until the screen is wide enough for both.
  const docked = DEMO_LAYER && trace.open;

  const reached = tiles.filter((t) => t.offer).length;
  const expected = tiles.filter((t) => t.inScope).length;

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6">
      {/* ------------------------------------------------------------------ what to watch */}
      <div className="rounded-xl border border-border bg-white shadow-card p-5 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge tone="warning"><FlaskConical size={11} /> Demonstration view</Badge>
            <h2 className="text-[18px] font-bold text-ink mt-2">Four cardholders, one campaign</h2>
            <p className="text-[13px] text-ink-secondary mt-1 max-w-3xl">
              {campaign
                ? <>The same home screen, for four different people, reading the same state. Fire the allocator for{" "}
                   <span className="font-semibold text-ink">{campaign.merchant_name}</span> from the RM view and watch which of
                   them hears about it. Nobody here is picked by this screen: it shows what the allocator decided.</>
                : "The demo campaign is not loaded, so there is nothing to allocate."}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11.5px] text-ink-secondary">Holding this offer</div>
            <div className="font-num text-[26px] font-bold leading-none text-ink tabular-nums">
              {num(reached)} <span className="text-ink-light">of {num(tiles.length)}</span>
            </div>
            <div className="text-[11px] text-ink-light mt-1">{num(expected)} in the target cohort</div>
          </div>
        </div>
        <p className="text-[11.5px] text-ink-light mt-3">
          A presentation device, not part of the cardholder product. Each tile is the real home screen; only this page's
          framing around them is made for the pitch.
        </p>
      </div>

      {/* ------------------------------------------------------------------ the four screens */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${docked ? "2xl:grid-cols-4" : "xl:grid-cols-4"} gap-4 items-start`}>
        {tiles.map((t) => <Tile key={t.id} tile={t} />)}
      </div>
    </div>
  );
}

function Tile({ tile }) {
  const { holder, caption, inScope, offer, chip } = tile;
  if (!holder) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-canvas/60 p-4 text-[12.5px] text-ink-light">
        {tile.id} is not a cardholder in this dataset.
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {/* The label sits outside the device, in prototype chrome, for the same reason the whole
          frame does: a caption describing a cardholder's segment is the bank's language about
          them, and it must never look like something their own app is telling them. */}
      <div className="flex items-start justify-between gap-2 mb-2 px-0.5">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink truncate">{holder.name}</div>
          <div className="text-[11px] text-ink-light leading-tight">{caption}</div>
        </div>
        {offer ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[10.5px] font-bold text-success">
            <Bell size={10} /> Notified
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold text-ink-light">
            <BellOff size={10} /> {inScope ? (holder.consent.offers ? "Waiting" : "Offers off") : "Not targeted"}
          </span>
        )}
      </div>
      {/* Demo layer: the verdict and, on tap, the System Trace stage that reached it. */}
      <div className="px-0.5 -mt-1.5 mb-2 empty:hidden"><TraceChip chip={chip} /></div>

      {/* A smaller bezel than the individual view's, because four of those do not fit a slide and
          the point here is the contrast between the screens, not the hardware around them. */}
      <div className="rounded-[22px] border-4 border-ink bg-white overflow-hidden shadow-card">
        {/* Scrollable but not clickable. A tile is something to look at during a two-minute
            stretch of the pitch, and every control inside a real home screen goes somewhere —
            one stray click on Alvin's tile and the presenter is on a reward detail page for
            somebody else's offer. The wheel still reaches the scroll container, so the screens
            can be read in full; only the children stop taking pointer events. */}
        <div className="rounded-[18px] overflow-hidden h-[30rem] overflow-y-auto no-scrollbar">
          <div className="pointer-events-none select-none">
            <BankingHome cardholderId={holder.id} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
