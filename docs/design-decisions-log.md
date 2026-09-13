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

## Still open / not yet decided
- Exact numeric thresholds (portfolio-level frequency cap in `portfolio-allocator`, push cap, auto-approve reach/cost threshold) — need a stated basis before going in the deck, not just round numbers.
