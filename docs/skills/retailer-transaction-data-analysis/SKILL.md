---
name: retailer-transaction-data-analysis
description: "Segment and tag OCBC customers from their individual-level retail transaction data — spend categories, sub-category style, spending-frequency tier, and local/foreign split — for the Mobius/OCBC Rewards Flywheel model."
---

# Retailer Transaction Data Analysis (Mobius / OCBC Rewards Flywheel)

Turns OCBC customers' own transaction data into per-customer tags: what they spend on, how often, and where. This is the customer-side profile that feeds `sme-business-customer-analysis`'s "OCBC customer spending profile" input, and is intended to eventually feed a not-yet-built "portfolio allocator" skill that decides who receives which reward.

> **Data flag:** this is the most individually identifiable dataset in the Mobius pipeline so far — full transaction history per customer, home address, location/timing patterns. Only ever run this on synthetic/demo data, never real OCBC customer data, per this project's own constraint. The tagged output is for **internal OCBC-side use only** (feeding another OCBC-side skill) — never surface it to an SME/merchant or in any public/demo artifact with anything but synthetic customer IDs.

## Input

OCBC customers' individual-level transaction data, across all payment rails (debit card, credit card, PayNow, GIRO, etc.). This skill cares about the **outflow leg** of each transaction — money leaving the customer's account for retail spend — regardless of which payment product carried it. Exclude inflows (salary credits, refunds, transfers in).

## Step 1 — Identify and exclude dormant cardholders

Compute, per customer, transactions per month over the available window. Compute two candidate cutoffs:
- Fixed cutoff: 10 transactions/month
- Distribution cutoff: the transaction-count value at the 10th percentile across all customers

Use **whichever cutoff is lower** as the single dormancy threshold (the stricter, more conservative test) — a customer is dormant if their transactions/month falls below that value.

> **Assumption flag:** "the lower of X or Y" is read here as *min(X, Y)* used as one threshold — not "dormant if below X **or** below Y," which is a looser test that would flag more customers as dormant. Confirm this matches your intent; it changes how many customers get excluded from Steps 2–4.

Exclude dormant cardholders from the category/style clustering in Steps 2–4, but still report their count/% in the output — "dormant" is itself a useful tag for the portfolio allocator (a reactivation candidate, not a target for the same offers as active spenders).

## Step 2 — Determine each customer's resident country

- Primary signal: mailing address on file.
- Cross-check: the country where the plurality of the customer's transactions occurred over the trailing 1 year.
- If these disagree, use the **transaction-majority country** as the resident country for segmentation purposes, not the mailing address — state this override whenever it happens, since it means the customer likely doesn't live where their file says.

Split each customer's transactions into **local** (resident country) and **foreign** (all other countries) for Step 3.

## Step 3 — Classify local and foreign spending

Run this once for local spend, once for foreign spend, per customer:

1. **Top-level category** — classify transactions into spend categories (F&B, groceries, utilities, petrol, hotel, air tickets, experiences, gaming, electronics, etc.), using whatever categories the data's own merchant-category field supports. Don't invent categories the data can't back.
2. **Sub-category style, for the top 3 categories only** — within each of a customer's top 3 categories by spend, classify by the *specific merchants* they frequent into a style tag (e.g. within F&B: "cafe hopper" vs. "hawker regular" vs. "fine dining"; within retail: "luxury spender" vs. "value/budget spender"). This needs a merchant → business-nature mapping (what the merchant actually sells/its positioning), not just the raw merchant name.

   > **Feasibility flag:** the original ask suggested a live Google API lookup for merchant business nature. That's fine as a one-off, *offline* enrichment step when building this skill's synthetic demo data (Claude hand-labelling a sample/fictional merchant list). It's not something the shipped product can do live — hosting is a public static GitHub Pages site with no server-side secrets, so it can't hold a Google API key or make a live classification call at request time. A live merchant-classification lookup on real data belongs in OCBC's own backend, out of scope for what gets built and shown here.
3. **Location and timing pattern** — cluster by where and when spend happens (e.g. weekday lunch hours concentrated in a CBD postal cluster → "CBD weekday professional"; weekend evening spend at a heartland mall → a different tag). Treat this as a supporting tag, not a replacement for the category/sub-category tags above.
4. **Spending-frequency tier** — among the non-dormant population, tier customers by transaction frequency and/or monetary value (e.g. high spender / regular spender / budget-occasional spender), stating the cutoffs used (e.g. percentile bands) rather than just asserting labels.
5. **Other standard segmentation cuts**, only where the data supports them and they add real marketing value — e.g. digital-payment-first vs. cash/card-preferring, family/household pattern (groceries + education + childcare categories) vs. single/young-professional pattern, affluent vs. mass-market by overall spend level. Use recognised, standard retail-segmentation lenses only — don't invent bespoke categories to pad the output.

## Step 4 — Output: per-customer tags

Produce, per non-dormant customer: dominant local spend categories + sub-category style tags (top 3), dominant foreign spend categories + style tags (if any foreign spend exists), location/timing tag(s), frequency tier, and any standard segmentation cut that applies. Dormant customers get only the dormant tag plus their frequency data point — no category/sub-category tagging, since Step 1 excludes them from that analysis.

This output is a **structured tag table** (customer identifier → tags), not a narrative report — it's built for `sme-business-customer-analysis` and the future portfolio allocator to consume, not for a human/SME reader. Keep raw transaction-level detail out of the output; the tags themselves are the deliverable.

## Future extension — considered, deliberately not built: associate-network propensity

The original scoping for this skill also considered mapping a customer's immediate family and frequent transaction counterparties into a network, then using those people's spending to raise the customer's own targeting "propensity" (feeding the not-yet-built portfolio allocator). This is intentionally **not implemented** here.

Why it's parked rather than built: it would infer relationships between identified individuals from transaction data — a materially bigger privacy step than tagging a customer's own spend, and the same category of cross-referencing this project already dropped once (the Great Eastern insurance → travel-intent idea, cut for "privacy exposure, adds nothing to the demo"). If this comes up in Q&A: name it as an idea that was considered and consciously left out, not something the team hasn't thought of — don't build or simulate it on request without an explicit, separate decision to do so, since that decision has real consent/PDPA implications beyond this hackathon.