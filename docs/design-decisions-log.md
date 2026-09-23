# Mobius — running design decisions (control layer)

Captured from working sessions, to avoid relitigating. Add to, don't rewrite, unless something is explicitly reversed.

## Human-in-the-loop placement
Per-campaign approval alone (AI recommends → EmB/Group Lifestyle human approves/edits) is necessary but NOT sufficient — it doesn't stop many approved campaigns from collectively over-targeting the same cardholders. Two separate control layers:

1. **Per-campaign gate** (already in write-up): human approves/edits segment + offer + cost-share before launch. Tiered — auto-approve below a reach/cost threshold, force human review above it, so it stays workable as merchant count scales.
2. **Portfolio-level frequency cap** — now implemented in the `portfolio-allocator` skill (Step 3): a systemic, cardholder-level cap enforced at the allocation layer, independent of any single campaign's approval, since no reviewer can see the other N campaigns also targeting the same cardholder that week. The exact numeric cap is still not decided (see "Still open" below) — the skill states the logic and flags any threshold used as provisional. The OCBC KPI dashboard remains the human oversight point for this (aggregate reach, exposure concentration, manual throttle/kill-switch), not a per-campaign screen.
3. **Consent/opt-in filtering happens before AI segmentation**, not as part of human review — now implemented in `portfolio-allocator` Step 2, ahead of the frequency cap and the final list.

## Notification channel
Primary channel: **OCBC app in-app offer feed**, with **push notification** as a secondary attention-nudge — not SMS/email.
Rationale: reuses existing app consent/preference infra (no new opt-in flow), zero marginal cost, and gives clean delivered/opened/redeemed events tied to the same customer ID as the transaction data — needed for the test-vs-control incremental-value measurement already decided as the validation methodology.

### Anti-spam design (push specifically)
"Approved" and "pushed" must be different events, or push volume scales linearly with merchant count:
- Every approved offer lands in the in-app feed regardless (low intrusion, no cap needed there).
- Push is reserved for offers above a relevance/expected-uplift threshold — not every approval.
- Push frequency is capped tighter than the feed (e.g. ~1–2/week per cardholder) and batched into a digest ("3 new offers for you") rather than one push per merchant.
- This cap is systemic/global, enforced at send-time — same reasoning as the portfolio-level frequency cap above (send-time cap is a separate, tighter cap from the allocation-time cap in `portfolio-allocator` — one governs who's eligible to be offered anything, the other governs how many pushes actually get sent).

## SME eligibility gate (reward programme)
Before any AI segment/offer recommendation runs, gate the SME merchant on **both**:
- Average bank balance **> S$30,000** (strictly greater than)
- **Internal transaction score OR external transaction score** is band 3 or better (bands 1–3, assuming lower band number = better/lower risk — standard PD-band convention). Only one of the two scores needs to clear band 3.

Fail either condition (balance ≤ S$30,000, or *both* scores worse than band 3) → show "you are not eligible for the reward programme"; no recommendation is generated for that SME. Implemented in `reward-programme-recommendation` Step 1.

Note on wording: an earlier phrasing of this rule, read literally, would have disqualified a *good* score — flagged and corrected to the version above (confirmed by Joel: two score sources with OR logic, strict inequality on balance). Flag the PD-band-direction assumption (lower band = better) if restating this rule to anyone else, since it hasn't been independently confirmed for this SME scoring convention.

## Reward type taxonomy and RFM-based targeting
Five reward types only (from the write-up): discount, cashback, voucher, spend-and-save, overseas/FX-linked benefit. Full ranking of all five by suitability per merchant demand-gap type, cross-checked against cardholder segment, and mapped to target RFM segments (Champions/Loyal → spend-and-save, referencing Shopify's "subscription for high-frequency buyers" guidance; New/Promising → discount/voucher; At Risk/Can't Lose Them → cashback) is captured in `reward-programme-recommendation`. It always surfaces the full ranked list (not just a top pick) so a human reviewer can see and override runner-up choices.

## Customer analysis pipeline (four skills, run in this order)
1. `retailer-transaction-data-analysis` — tags all OCBC customers (category/sub-category style, frequency tier, local/foreign split) from their own transaction data. Excludes dormant cardholders (<10 txns/month or bottom 10%, whichever is the stricter cutoff) from the tagging. Output is internal-only, per-customer tags for machine consumption, not a report.
2. `sme-business-customer-analysis` — for a specific SME, produces the Customer Profile (category/sub-category breakdown of the SME's OCBC-card customers and its top-20% loyal customers), Demand-Gap Detector, and this SME's own RFM segmentation. Gated to demand-gap-detector-only output below 100 OCBC retail transactions for that SME.
3. `reward-programme-recommendation` — given the SME's eligibility and demand-gap type, ranks all five reward types and maps the top pick to a target RFM segment.
4. `portfolio-allocator` — given the selected reward + target segment, decides the actual candidate pool (this SME's existing customers in that RFM segment, vs. OCBC-wide lookalikes from `retailer-transaction-data-analysis` for acquisition-type targets), applies consent and the portfolio-level frequency cap, and outputs the final per-customer allocation (internal-only) plus an aggregate summary (dashboard/pitch-safe).

**Deliberately not built** (flagged, not silently dropped): mapping a customer's immediate family and frequent transaction counterparties into a network, then using their spending to raise the customer's own targeting propensity. Excluded from `retailer-transaction-data-analysis` as a documented future-extension — it infers relationships between identified individuals from transaction data, the same category of privacy exposure as the already-dropped Great Eastern insurance → travel-intent idea.

## Round 7 — System Trace and UI copy sweep (2026-09-23)
Rounds 1–6 were not written into this file. Their standing decisions (disconnect, don't delete; one source of truth for every figure; the merchant view stays realistic to an SME user) are recorded in code comments (`src/data/constants.js`, `src/App.jsx`), and this round follows them.

### System Trace (demo layer)
- **What:** a drawer showing the recommender's stages in pipeline order: Customer Tagging → SME Analysis → Eligibility Gate → Reward Recommender → Allocator [Consent → Freq Cap] → Delivery [Push | Pull]. It also has one fixed control node, "RM review — prod queue · bypassed in demo". That node makes the removed RM approval step visible on screen instead of leaving it for the talk track.
- **Where:** RM view and both cardholder modes (Consolidated, Individual). **Never the merchant view.** *(Reversed in round 8: merchant and cardholder views, not RM.)* Dark, monospace, badged "DEMO LAYER · simulated trace", so nobody mistakes it for OCBC product UI. Expanded by default on screens ≥1024px. It takes width from the page rather than covering it.
- **Toggle:** sits immediately left of the persona switcher. Reset stays in the footer, where it is in all three views; moving it into two headers would break the "same control, same place" rule.
- **One flag:** `DEMO_LAYER` in `constants.js` gates the trace, the Consolidated view and the reset buttons together. It is on by default, and nothing behind it is deleted.
- **Word budget:** one line of output per stage, numbers over sentences. Explanations sit behind an ⓘ, at most two sentences.
- **Hard rule: the trace has no figures of its own.** `src/state/trace.js` reads every value from shared state or the loaded dataset, through the same helpers the screens use. `selftest.mjs` checks it against the reducer. Reset clears it: its only memory is React state, and reset reloads the page.
- **Settled details:**
  - Reward Recommender shows the pool actually configured. For Soujourner that is **Non-customers (lookalike)**, not an RFM segment, because acquisition uses merchant-pair lift and retention uses RFM.
  - Allocator reads **538 → 423 → 396 (rounded to 400)**: candidate pool, after consent, after the frequency cap, then the reach every dashboard shows. Exact counts inside the demo layer; the rounded figure is the one everywhere else (decided by Joel).
  - Consolidated chips are worked out from state, not fixed:
    - #1 Edwin ✓ and #2 Bernice ✓ point to Allocator.
    - #3 Alvin ✗ "Champion · existing customer" points to Reward Recommender, because the campaign targets non-customers.
    - #4 Charles ✗ "No lookalike match" points to Customer Tagging (price-band tag).
    - Tapping a chip highlights that stage.
  - A chatbot answer switches Delivery to Pull, showing `Query → {category, location} → N programmes` with the chat's own count. Recommender and Allocator grey out, tagged "segment match skipped · customer-initiated". This works on whichever phone asked: Charles is the designated pull persona, and Bernice works too.
  - SME Analysis prints the figure (−43.6%), not the rounded narrative sentence from `rationales.json` (44%).
  - The Consolidated tile pill and its "holding this offer" count no longer count a card that was withdrawn when its holder turned offers off. This is the same rule the chips use.

### UI copy sweep (all three personas)
- **Visible copy is limited to:** labels, numbers, headlines, CTAs, status, and at most one subtitle of about 12 words per section.
- **How/why explanations** (metric meanings, calculation notes, what a segment or reward type is, process descriptions) go behind an ⓘ next to what they describe, trimmed to at most two sentences.
- **One ⓘ component app-wide:** `InfoTip` in `src/components/ui.jsx`, grown from the RFM segment glossary. No variants. The trace uses it too.
- **Delete, don't move, in the merchant and cardholder views:** rounding/precision notes, incremental share/score, control-group framing, and "where the incremental share comes from".
- **In the RM view,** control-group and net-contribution explanations move behind an ⓘ and every figure stays. The control comparison belongs on the RM's campaign detail, and the losing campaign is on the never-cut list.
- **Kept as-is:** the Overview tagline and subtext; the not-eligible message (shortened only if longer than one line); chatbot replies.
- **Scope:** screens users can currently reach. Disconnected screens and `BasisNote` strings (already hidden by `SHOW_BASIS_NOTES`) stay untouched, so their flags still restore them intact. The System Trace is exempt; it has its own budget.
- **Process:** nothing changes until a per-screen before/after table (changed / moved to ⓘ / deleted) has been approved.
- **Applied (approved by Joel, 2026-09-23):** about 100 strings across 13 screens, per the approved table. Customer Profile's subtitle reads "Who your customers are, where the gap is, and the reward that fits" (Joel's wording). The recommendations on the open items were accepted:
  - the footer's sample-units line is split, first sentence visible and the rest behind an ⓘ;
  - the merchant's "Incremental sales / transactions" labels are renamed "Sales added / Added transactions";
  - "Demo · rewind" on Customer Profile goes behind `DEMO_LAYER`;
  - the footer privacy dialog and the Overview dataset line are kept.
- **Pipeline text stays unchanged in `public/data`.** Where the approved short line replaced pipeline text (the Withheld notes, the age-band rounding note), the component builds it from the figures already on screen, with the floor read from the manifest.
- **Not in the table, so not changed:** the kill-switch "halted" paragraph and the RM "Provisional" pill's other uses. Apply the same rules to them in a later pass if wanted.

## Round 8 — the System Trace explains the recommender (2026-09-23)
Round 7's trace said *what* each stage decided in one line. It did not say *why*, and it did not move when the merchant clicked anything. This round makes it explain the mechanism.

- **Merchant view gets the trace; the RM view loses it** (decided by Joel). It is still demo layer only; a real merchant never sees it. The RM's screens recommend nothing: the allocator is rules, and its figures are already in the push dialog. A per-view flag, `TRACE_VIEWS` in `constants.js`, switches it; nothing is deleted.
- **Each stage is named as an agent** (Tagging, SME Analysis, Eligibility, Lift, Reward, Allocation, Delivery; for pull, Intent and Search). Each shows the module it runs (`lift.py`, `reward.py` …), the skill it implements, and a visible tag:
  - "rules · precomputed" for pipeline modules, which ran when `public/data` was built;
  - "scripted · live" for the chatbot matcher.
  "Agent" is the demo's word. The tag keeps the answer to "is that an LLM?" true on screen. Nothing in the app calls a model.
- **Opened, a stage shows its figures and its rule.** Every figure is still read from state or `public/data`; none is typed in.
  - **Lift Agent:** names the lift source (Brew & Co. — decided by Joel, round 7's anonymity dropped for the demo layer). Shows P(you | them) 51.5% = 773 of 1,502, P(you) 17.3%, lift 2.98×, the runners-up, and the filter chain 1,502 → −773 already yours → −87 price band → −104 daypart → 538 → 550 after rounding.
  - **Reward Agent:** shows the full score table, incremental share included (decided by Joel, for the demo layer only). The order comes from the skill's table for the gap type; score = rank points + round(30 × incremental share) + 10 if the pool clears the floor. The formula sits in `constants.js REWARD_SCORE`, and `selftest.mjs` rebuilds every shipped score for all 69 merchants from it.
  - **Reward Agent mismatch:** flags when the chosen reward is ranked for one kind of customer and the selected pool is the other. Example: Cashback is ranked for returning customers but aimed at lookalikes.
- **The trace follows clicks.**
  - Customer Profile's account switcher: Ah Huat stops at the failing gate, Boba Lane shows the category-catchment fallback.
  - Every Reward Configuration choice opens and flashes the stage that choice touched. Reward type opens the Reward Agent; pools and outlets open the Lift Agent; the window opens the SME Analysis Agent (inside or outside the trough); the reach cap opens the Allocation Agent. It reads the last entry in the change log the page already keeps.
- **Pull detail:**
  - The strip becomes Tagging (the cardholder's home, work and catchment districts) → Intent Agent (the phrase matched and the categories it maps to, marked "not a language model") → Search Agent (live → in dates → in category → near you → open now) → Delivery (every result, its nearby outlets and open-now, plus the ranking rule).
  - Lift, Reward and Allocation are shown as skipped.
- **Consolidated chip #4 (Charles)** now points to the Lift Agent. The price-band filter that excluded him runs in `lift.py`, and round 7 had no Lift stage.

## Still open / not yet decided
- Exact numeric thresholds (portfolio-level frequency cap in `portfolio-allocator`, push cap, auto-approve reach/cost threshold) — need a stated basis before going in the deck, not just round numbers.
- **System Trace default state.** It currently starts expanded on screens ≥1024px. Docked, it narrows every merchant and cardholder screen by 400px and drops the Consolidated view to 2×2. Decide whether the live pitch and the video start with it open or collapsed.
- **Final trace numbers once Soujourner Coffee's values are locked.** The trace reads whatever the pipeline ships, so a re-run moves the figures automatically: 538 / 423 / 396 / 400, the −43.6% gap, S$45,477 against S$30,000, and 399 sent · 1 suppressed. The talk track and video need re-checking against the locked set. The demand-gap narrative says 44% where the figure is 43.6%.
- **Lock the chatbot demo query.** The intents are scripted (`src/screens/app/chatbot.js`). The Pull count depends on live programmes and the asking phone's districts (today, Bernice asking for coffee gets 3 near D4/D2). Fix the exact phrasing and which phone asks before recording.
