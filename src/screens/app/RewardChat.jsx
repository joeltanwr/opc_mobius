import React, { useMemo, useRef, useState } from "react";
import { Sparkles, Send, MapPin, Clock } from "lucide-react";
import { useDemoData } from "../../data/DataProvider";
import { useMobiusState } from "../../state/StateProvider";
import { RewardFeedCard } from "../../components/RewardCard";
import { INTENTS, FALLBACK, matchIntent, searchPull } from "./chatbot";
import { enrich } from "./offers";
import { formatDays, formatHours } from "../../components/RewardCard";

// The programme's own window, in the words the feed card uses for it.
const windowLabel = (offer) => [formatDays(offer.days_of_week), formatHours(offer.hours)].filter(Boolean).join(" ");

// ---------------------------------------------------------------------------------------------
// Ask for a reward — the pull channel, inside the cardholder's own Rewards tab.
//
// The one place in this build where an offer reaches somebody the targeting engine did not pick.
// That is the point and it is stated on screen: the cardholder asked, so the answer is everything
// live that fits what they asked for and where they are, not everything they were allocated.
//
// Two things this deliberately does NOT apply, both of which govern the push channel:
//   target-segment matching  they asked; the allocator's opinion of them is not the question
//   the portfolio frequency cap  a cap on unsolicited contact says nothing about a search
// Consent is the same: marketing consent gates being marketed at, not being answered. What a
// cardholder who has turned offers off sees is handled by the Rewards tab around this, not here.
//
// The language understanding is scripted (chatbot.js) and the screen says so. The matching is not:
// the funnel line under each answer — live, in category, near you — is counted from shared state
// every time, so a judge can watch the filter do real work rather than take a canned list on
// trust. A demo that fakes the result would have nothing to show at that moment.
// ---------------------------------------------------------------------------------------------

export default function RewardChat({ cardholderId, holder }) {
  const { data } = useDemoData();
  const m = useMobiusState();
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  // Shipped by run_all.py alongside the rest of the manifest. Null until the pipeline has been
  // re-run, and searchPull() falls back to exact home/work districts when it is.
  const adjacency = data?.constants?.district_adjacency ?? null;

  function ask(text) {
    const q = String(text ?? "").trim();
    if (!q || !m) return;
    const intent = matchIntent(q);
    const found = intent
      ? searchPull({
          intent,
          campaigns: m.state.campaigns,
          profiles: data.merchantProfiles,
          holderProfile: holder?.profile,
          clock: m.state.clock,
          adjacency,
        })
      : null;
    setTurns((t) => [...t, { q, intent, found, id: t.length }]);
    setDraft("");
    // The newest answer, not the top of the thread: on a phone-sized panel the question the
    // presenter just asked has to be the thing on screen.
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "nearest" }));
  }

  if (!m) return null;

  return (
    <section className="rounded-2xl border border-border bg-white shadow-card overflow-hidden mb-3">
      {/* ------------------------------------------------------------------ header */}
      <div className="px-4 pt-3.5 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
            <Sparkles size={13} className="text-brand" />
          </span>
          <h2 className="text-[13.5px] font-bold text-ink">Ask for a reward</h2>
        </div>
        <p className="text-[12px] text-ink-secondary mt-1 leading-snug">
          Tell me what you're after and I'll check what's running near you — whether or not it was sent to you.
        </p>
      </div>

      {/* ------------------------------------------------------------------ thread */}
      <div className="px-4 py-3 space-y-3 max-h-[26rem] overflow-y-auto">
        {turns.length === 0 && (
          <p className="text-[12px] text-ink-light">
            {holder?.name ? `Hi ${holder.name}. ` : ""}Ask me about a deal, or pick one below.
          </p>
        )}

        {turns.map((t) => (
          <div key={t.id} className="space-y-2">
            <div className="flex justify-end">
              <p className="rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-[12.5px] text-white max-w-[85%]">{t.q}</p>
            </div>

            <div className="rounded-2xl rounded-bl-sm bg-canvas border border-border px-3 py-2.5">
              {!t.intent ? (
                <p className="text-[12.5px] text-ink-secondary">{FALLBACK}</p>
              ) : t.found.results.length === 0 ? (
                <>
                  <p className="text-[12.5px] text-ink">{t.intent.empty}</p>
                  <Funnel found={t.found} />
                </>
              ) : (
                <>
                  <p className="text-[12.5px] text-ink">{t.intent.reply}</p>
                  <Funnel found={t.found} />
                </>
              )}
            </div>

            {/* The results are the same card the feed renders. A second card design for offers
                found by asking would have been a second thing to keep in step with the RM's
                preview, and would have implied these are a different kind of reward. They are
                not: same programme, same terms, reached a different way. */}
            {t.intent && t.found.results.map((r) => (
              <PullResult key={r.campaign.id} result={r} />
            ))}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* ------------------------------------------------------------------ input */}
      <div className="px-4 pb-3 pt-1 border-t border-border">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {INTENTS.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => ask(i.label)}
              className="rounded-full border border-border bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary hover:text-ink hover:border-ink-light"
            >
              {i.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); ask(draft); }}
          className="flex items-center gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. coffee deals near me"
            aria-label="Ask for a reward"
            className="flex-1 min-w-0 rounded-full border border-border bg-white px-3 py-2 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="h-8 w-8 shrink-0 rounded-full bg-brand text-white flex items-center justify-center disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </form>
        <p className="text-[10.5px] text-ink-light mt-2 leading-snug">
          Scripted assistant for this prototype — it understands the few asks above rather than anything typed. What it finds is
          real: every result is a live programme in the demo dataset, matched on category and your area.
        </p>
      </div>
    </section>
  );
}

// The filter doing its work, in one line and counted from state. This is the sentence that keeps
// the channel honest in front of a judge: it says how many programmes were considered, so nobody
// has to wonder whether the one answer was the only thing that existed.
function Funnel({ found }) {
  return (
    <p className="text-[11px] text-ink-light mt-1.5 leading-snug">
      {found.open} live programme{found.open === 1 ? "" : "s"} · {found.in_category} matching what you asked for ·{" "}
      <span className="font-semibold text-ink-secondary">{found.results.length} near you</span>
      {found.results.length > 0 && <>, {found.open_now} open right now</>}
      {found.districts.length > 0 && (
        <> — district{found.districts.length > 1 ? "s" : ""} {found.districts.join(" and ")}
          {found.exact_only ? ", exact match only" : " and the ones next to them"}</>
      )}
      .
    </p>
  );
}

function PullResult({ result, onOpen }) {
  const { data } = useDemoData();
  const m = useMobiusState();
  const c = result.campaign;
  const cfg = c.configuration ?? {};

  // Built into the shape the shared card expects, from the campaign the pipeline shipped. Nothing
  // here is written for the chatbot: the headline, the terms and the window are the merchant's own
  // configuration, which is why this preview cannot drift from what redeeming actually gives you.
  const offer = useMemo(() => enrich({
    id: `pull:${c.id}`,
    campaign_id: c.id,
    merchant_id: c.merchant_id,
    merchant_name: c.merchant_name,
    reward_type: cfg.reward_type ?? c.recommended?.reward_type ?? null,
    offer_headline: cfg.offer_headline ?? null,
    offer_terms: cfg.offer_terms ?? null,
    days_of_week: cfg.days_of_week ?? null,
    hours: cfg.hours ?? null,
    expires_at: c.window?.end ? `${c.window.end}T23:59:59+08:00` : null,
    status: "delivered",
    via: "search",
    source: "pull",
  }, { profiles: data.merchantProfiles, taxonomy: data.taxonomy, clock: m.state.clock }),
  [c, cfg, data, m.state.clock]);

  return (
    <div>
      <RewardFeedCard offer={offer} clock={m.state.clock} origin="found" />
      <p className="text-[10.5px] text-ink-light mt-1 px-1 flex items-center gap-1">
        <MapPin size={10} className="shrink-0" />
        {result.near.length} outlet{result.near.length === 1 ? "" : "s"} in your area
        {result.districts.length > result.near.length && ` of ${result.districts.length}`}
        {" · found by searching, not sent to you"}
      </p>
      {/* A programme that is running but shut at this hour is still worth claiming — the voucher
          is locked in now and used inside the window. Saying so is the honest version of the
          time filter: it is applied and visible, not hidden. */}
      {!result.open_now && (
        <p className="text-[10.5px] text-ink-light mt-0.5 px-1 flex items-center gap-1">
          <Clock size={10} className="shrink-0" />
          Not open right now — redeem {windowLabel(offer) || "inside its window"}
        </p>
      )}
    </div>
  );
}
