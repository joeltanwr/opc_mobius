---
name: portfolio-allocator
description: "Determine which specific OCBC customers receive an SME's selected reward programme, combining the SME's own RFM segment with OCBC-wide customer tags, and applying consent and portfolio-level frequency caps, for the Mobius/OCBC Rewards Flywheel model."
---

# Portfolio Allocator (Mobius / OCBC Rewards Flywheel)

The last step in the pipeline: takes the reward programme + target RFM segment an SME (or its human reviewer) has selected from `reward-programme-recommendation`, and decides **which actual customers** get the offer. Pulls from `sme-business-customer-analysis` (this SME's own customer RFM segments) and `retailer-transaction-data-analysis` (OCBC-wide customer tags) to build the candidate list, then applies consent and portfolio-level controls before finalising it.

This also fills a gap flagged but not yet built elsewhere in the project: `design-decisions-log.md` already calls for a systemic, cardholder-level frequency cap independent of any single campaign's approval, since no per-campaign reviewer can see the other campaigns targeting the same cardholder. This skill is where that cap actually gets enforced.

> **Data flag:** this skill's output is an operational, per-customer send list — the most sensitive artifact in the pipeline. Only ever run on synthetic/demo data. The per-customer list is **internal-only** (feeds the send/notification system) and must never be shown to the SME merchant or in any public/demo artifact — the merchant-facing dashboard gets aggregate counts only, per the project's two-dashboard design (OCBC KPI view vs. merchant view).

## Preconditions (assume already done, don't redo here)

- The SME has already passed the eligibility gate in `reward-programme-recommendation` Step 1. If that hasn't been confirmed, say so and stop rather than allocating anyway.
- A specific reward type + target RFM segment has already been **selected** (by the SME or the human reviewer) from `reward-programme-recommendation`'s ranked list — this skill acts on that one selection, it doesn't re-rank reward types itself.

## Step 1 — Choose the candidate pool: retain/reactivate vs. acquire

The selected target RFM segment determines which pool to draw from — these are genuinely different populations, not the same list filtered two ways:

- **Retention/reactivation segments** (Champions, Loyal Customers/Potential Loyalists, At Risk, Can't Lose Them, Need Attention): pool = this SME's **existing** customers who fall into that segment, from `sme-business-customer-analysis`'s per-SME RFM output. These people already have a transaction history at this SME — that's what makes an RFM score possible at all.
- **Acquisition segments** (New Customers, Promising, as a target for the SME to *acquire* rather than a description of who already shops there): pool = OCBC customers who have **no existing transaction history at this SME**, matched against the SME's own successful-customer signature — specifically the top-20%-loyal-customer category/sub-category profile from `sme-business-customer-analysis`'s Customer Profile section — using the category, sub-category style, and frequency-tier tags from `retailer-transaction-data-analysis`. Exclude anyone already appearing in the SME's own customer data (they belong in the retention pool, not here) and exclude anyone tagged dormant.

If the selected segment doesn't map cleanly to one of these (e.g. the SME picked a reward type without a clear RFM target, such as overseas/FX-linked), ask which pool applies rather than guessing — the two pools need different data sources and produce very different-sized lists.

## Step 2 — Apply consent and dormancy filters

- **Consent/opt-in**: exclude any customer without valid marketing consent/opt-in. This happens here, before finalising the list — per the project's existing decision that consent filtering is not a substitute handled by human review, it has to happen at the segmentation layer.
- **Dormancy**: exclude customers tagged dormant by `retailer-transaction-data-analysis` from the acquisition pool. For the retention/reactivation pool, note that SME-level RFM "low recency" (e.g. At Risk) is a *different* dormancy concept from OCBC-wide dormancy (fewer than ~10 transactions/month or bottom decile *across all their spend*, not just at this SME) — a customer can be OCBC-active overall but lapsed specifically at this one SME. Don't conflate the two; a lapsed-at-this-SME customer is exactly who the reactivation pool wants to reach, so don't exclude them just because they look "dormant" from this SME's own data alone.

## Step 3 — Apply the portfolio-level frequency cap

Before finalising, exclude any candidate who has already been allocated to more than the standing cap of concurrent/recent offers across **other** campaigns — this is the systemic control that stops many individually-approved campaigns from collectively over-targeting the same cardholder, since no single campaign reviewer can see the others. 

Don't invent a specific cap number here — `design-decisions-log.md` already flags the exact threshold as not yet decided. State the logic (a rolling per-cardholder cap checked against all other active/recent allocations) and use a placeholder threshold only if the user supplies one, flagging it as provisional.

## Step 4 — Rank and size the final list

If a reach or budget cap applies to this specific campaign (set by the human reviewer, not invented here), rank the surviving candidates and cut at that cap:

- Retention/reactivation pool: rank by RFM segment strength (e.g. within "Champions," higher combined R+F+M score first).
- Acquisition pool: rank by closeness of category/sub-category/frequency-tier match to the SME's top-20%-loyal-customer signature.

Note where the resulting list size sits relative to the project's tiered approval design (auto-approve below a reach/cost threshold, force human review above it) — don't decide the threshold, just flag which side of it this allocation likely falls on if the user has stated one.

## Output

Two layers, always both:

1. **Internal allocation list** (customer identifier → pool used, matched segment/profile reason, any filters that excluded them if useful for audit) — for the send system only, never shown to the SME or in a public artifact.
2. **Aggregate summary** in point form, no individual detail — candidate pool size before filters, count/% removed by consent, dormancy, and frequency cap, final allocation size, and the segment/profile basis used. This is the version suitable for the OCBC KPI dashboard, the merchant-facing view, or the pitch deck.

Always state which pool (retention/reactivation vs. acquisition) was used and why — that choice is the biggest driver of who ends up on the list, more than any of the filters.