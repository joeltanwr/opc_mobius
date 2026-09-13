---
name: sme-business-customer-analysis
description: "Analyse an SME merchant's own transaction data plus OCBC customers' spending profile to produce a customer profile, demand-gap detector, and RFM segmentation for the Mobius/OCBC Rewards Flywheel model."
---

# SME Business Customer Analysis (Mobius / OCBC Rewards Flywheel)

Turns an SME merchant's transaction data into the customer-side picture that feeds the demand-gap input for `reward-programme-recommendation`: who the SME's customers are, whether there's a demand gap, and how the customer base breaks down by recency/frequency/monetary value.

> **Data flag (always applies in this project):** this skill's inputs (an SME's per-customer transaction history, OCBC customers' category-level spending elsewhere) are individually identifiable financial data. This project's own constraint is synthetic data only, on a personal device, never real OCBC data. Only ever run this skill against synthetic/demo datasets supplied by the user for the hackathon. If asked to run it on anything that looks like real customer data, say so and decline, per the project's own stated constraint — don't just proceed because a file was provided.

## Inputs

1. **SME's own transaction data** — the merchant's own per-transaction records (timestamp, amount, a customer identifier/token, ideally a card-issuing-bank flag). Use only the **credit/inflow side** (payments received from customers) — if the file also contains the SME's own outgoing debits/expenses, exclude those; they describe the SME's spending, not its customers'. This dataset is the basis for the Demand-Gap Detector and the RFM analysis, and covers **all** of the SME's customers regardless of card issuer.
2. **OCBC customer spending profile** — for the subset of the SME's customers who paid with an OCBC card, their aggregated category-level spend elsewhere (e.g. an MCC/category breakdown). This is the basis for the Customer Profile section only, since it's the only piece that reveals what customers do outside this SME. Use the categories as given in the data — don't invent a taxonomy.
3. **The SME's own product category** (e.g. café, hawker, gym, salon) — needed to know which top-level category to drill into for the profile. If not supplied, ask rather than guess.

## Step 1 — Data-volume gate (check this first, always)

Count the OCBC retail transactions available for this SME (transactions in the SME's own data flagged as OCBC-card, or the row count of the OCBC customer spending profile input — state which count you used).

- **If < 100:** show **only** the Demand-Gap Detector (Step 2, which runs off the SME's own data and doesn't depend on OCBC-card volume). Skip Customer Profile and RFM entirely and, in their place, output exactly: **"For customer profile data, continue banking to gather valuable transaction data to unlock greater insights."**
- **If ≥ 100:** run all three sections (Demand-Gap Detector, Customer Profile, RFM).

> Flag this threshold interpretation to the user the first time it's applied — confirm the transaction count you used matches what they meant by "OCBC retail transactions."

## Step 2 — Demand-Gap Detector (always shown, uses SME's own transaction data only)

Compute from the full customer base (OCBC and non-OCBC cards alike):

- **Repeat-customer rate:** (customers with ≥2 transactions) ÷ (total unique customers), as a %.
- **Recent repeaters:** of those repeat customers, the % whose most recent transaction falls within the last 30 days of the data's end date, plus their average spend frequency (transactions per month) over the period they're active.
- **Ticket-size trend:** average transaction value over time (e.g. month-over-month or quarter-over-quarter across the available history) — state direction (rising/falling/flat) and magnitude only if the trend is computed from the data, never asserted qualitatively without a number behind it.
- **Transaction volume trend:** overall direction (up/down/flat) across the available history; hourly distribution to flag off-peak windows (lowest-volume hours); a seasonal/monthly view to flag high-volume periods — but only claim seasonality if the data spans enough time to show a repeating pattern (a few months of data can show a monthly shape, not a seasonal one). If the history is too short to support a seasonal claim, say so instead of asserting one.

State the date range of the data used, since every trend claim here needs that stated basis.

## Step 3 — Customer Profile (only if the gate passed)

Run this twice: once for **all** OCBC customers who transacted at the SME, once for the **top 20% by monetary value** spent at the SME (the loyal-customer view). For each pass:

1. Aggregate their spend (from the OCBC spending-profile input) by top-level category, report the top categories by % share.
2. Drill into the SME's own top-level category (from Input 3) and report the sub-category split within it (e.g. for a café/F&B business: café & western vs. hawker vs. fast food, etc., by % share).

Report both passes side by side so the difference between the general customer base and the loyal segment is visible (e.g. loyal customers skew more toward X sub-category).

## Step 4 — RFM Analysis (only if the gate passed)

Using the SME's own transaction data, compute per customer (across **all** customers, OCBC-card or not — RFM is merchant-side data and doesn't depend on card issuer):

- **Recency (R):** days since the customer's last transaction at this SME, as of the data's end date.
- **Frequency (F):** number of transactions at this SME within the analysis window.
- **Monetary (M):** total spend at this SME within the analysis window.

State the analysis window's start/end date used.

**Scoring:** independently bin each of R, F, M into quintiles across the full customer base and score 1–5 (5 = best: most recent / most frequent / highest spend; 1 = worst — note recency is inverted, since fewer days-since-last-purchase is the *better* outcome). Reference approach: https://www.shopify.com/sg/blog/rfm-analysis.

**Segmentation:** label each R-F-M combination using standard RFM segment names (Champions, Loyal Customers, Potential Loyalists, New Customers, Promising, Need Attention, At Risk, Can't Lose Them, Hibernating, Lost — per the Shopify reference), collapsing to at least these four groups the user cares about most for this project:

- **555 (Champions):** high R, high F, high M — prioritise retention, exclusive access, high-touch service.
- **High R, low F, moderate/high M:** new or sporadic big spenders — nurture toward habit formation.
- **Low R, high F, high M:** previously heavy users now lapsed — prime for reactivation/save offers.
- **Low R, low F, low M:** low-value or dormant — minimal spend, consider low-cost touchpoints or deprioritise.

Every customer should land in one of the full standard segments; report the four groups above as the headline point-form summary, with the rest available as a supporting breakdown if useful.

**Output %/count distribution across segments in point form, plus a plot** showing the customer distribution (e.g. a bar chart of % of customers per segment, or an R×F scatter/heatmap sized or coloured by M) — follow the `dataviz` skill for chart styling/colour choices before building it.

## Output format

- Plain text, point form throughout — this is read by a business user, not a data analyst.
- **Never** include individual customer names, IDs, card numbers, or single-transaction-level detail. Every number in the output is an aggregate (a %, a count, a category share, a trend direction) computed across a group of customers.
- Order: Demand-Gap Detector → (if gated out: the exact fallback line) → (if not: Customer Profile, then RFM Analysis with its plot).
- State the data window(s) used wherever a trend or rate is reported — don't let a number float without its basis, consistent with this project's "stated basis over precise-but-unsourced" rule.