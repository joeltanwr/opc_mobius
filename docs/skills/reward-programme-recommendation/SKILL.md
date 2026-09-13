---
name: reward-programme-recommendation
description: "Recommend an SME reward programme (cardholder segment, offer type) from a merchant demand gap for the Mobius/OCBC Rewards Flywheel model, including the SME eligibility gate."
---

# Reward Programme Recommendation (Mobius / OCBC Rewards Flywheel)

Turns a merchant demand-gap input into the two outputs the AI decisioning layer produces in the pitch: **cardholder segment** and **offer type + cap logic**. Use this whenever asked to recommend, sanity-check, or generate a demo scenario for a reward programme in this model.

Stay qualitative on numbers unless the user supplies a basis. This project's own working style is: prefer a range with a stated basis over a precise number without one, and flag anything that would draw "where did that number come from" before presenting it. Don't invent specific percentages or dollar caps — describe the *logic* that would set them unless given real figures to work from.

> **Funding, settled:** the merchant funds the reward in full. OCBC supplies targeting, delivery and measurement; there is no cost split, no co-funding and no OCBC contribution. Every cost figure shown to a merchant is that merchant's whole cost, never a share of one. Earlier versions of this skill carried cost-share split logic — that is deferred to a future phase and must not be reintroduced into a recommendation. See `sme-relationship-value-score.md`.

## Step 1 — SME eligibility gate (run this first, always)

Before any segment/offer recommendation, check the SME merchant against the eligibility gate. This is a merchant-level financial/credit gate, independent of the demand-gap/segment logic below.

**Eligible only if BOTH hold:**
- Average bank balance **> S$30,000** (strictly greater than)
- **Internal transaction score OR external transaction score** is band 3 or better (bands 1–3, assuming lower band number = lower risk / better score). Only one of the two scores needs to clear the bar.

If the balance condition fails, or **both** scores are worse than band 3, output exactly: **"You are not eligible for the reward programme."** Do not proceed to Step 2 or generate a recommendation for that SME.

> **Assumption flag:** "band 3 or better" assumes lower band number = better/lower risk (standard PD-band convention) — confirm if this SME's scoring convention runs the other way. If asked to restate the rule: ineligible if balance ≤ S$30,000, OR both the internal and external scores are worse than band 3.

## Step 2 — Classify the merchant demand gap

| Demand-gap type | Description |
|---|---|
| Off-peak / soft footfall | Recurring trough in a specific time window (time of day, day of week) |
| New outlet | Needs awareness + trial, no existing customer base at this location |
| Seasonal slowdown | Recurring, predictable low season |
| Declining transaction activity | Previously active customers/segment drifting away — win-back |
| Product/SKU needing demand | A specific item or line needs a push, not the whole basket |

If the input doesn't cleanly fit one category, say so rather than forcing a fit — a badly-classified gap produces a badly-matched ranking.

## Step 3 — Rank all six reward types by suitability (existing customers)

Six reward types: **discount, cashback, voucher, spend-and-save (tiered), bundle / 1-for-1, overseas/FX-linked benefit**. Bundle / 1-for-1 was added as a sixth type because it is a quantity rule rather than a value rule, it is what SME F&B merchants actually run, and the RM configuration page requires it. Do not introduce further mechanics (e.g. points multipliers, cross-merchant experiences) without flagging that it's new scope — the list stays deliberately narrow for the pitch. Points in particular is an OCBC-wide rewards currency, not a merchant campaign mechanic, and is out of scope.

When the SME is eligible, always rank **all six** types 1 (most suitable) to 6 (least suitable) for the given demand-gap type, using the orderings below as the default and adjusting only if the user gives extra context. Never present just a single "recommended" type — show the full ranked list so the human reviewer can see and override the runner-up choices. This step assumes the recipient already has a transaction history at the SME (that's what makes an RFM segment possible) — for prospects with no history, see Step 3b.

**Off-peak / soft footfall** (needs an immediate, tangible motivator tied to a specific window):
1. Discount (time-boxed to the window) — most tangible and immediate, directly targets the trough
2. Bundle / 1-for-1 (time-boxed) — drives two covers instead of one in a window with spare capacity, which is exactly what an off-peak trough has
3. Cashback (time-boxed) — similar immediacy, slightly less tangible at point of sale
4. Voucher — lowers trial friction but isn't naturally tied to a narrow time window
5. Spend-and-save — needs multiple visits, weaker fit for a single narrow window
6. Overseas/FX-linked — irrelevant unless the outlet also has a travel-footfall signal

**New outlet** (needs trial + awareness, one-time redemption is fine):
1. Voucher — fixed-value "gift" framing gives the lowest first-trial friction
2. Discount (first-visit) — also low friction, slightly more "salesy" than a voucher
3. Bundle / 1-for-1 — brings a second person through the door on the first visit, doubling trial per redemption
4. Overseas/FX-linked — strong only if the outlet sits in a travel catchment, otherwise drops further down
5. Cashback — less immediate/tangible for a first visit to an unfamiliar merchant
6. Spend-and-save — assumes repeat visits, mismatched with a single-trial goal

**Seasonal slowdown** (needs a repeatable pattern sustained across the season):
1. Spend-and-save / tiered — built for multi-visit or basket-building across a period
2. Cashback — encourages repeat spend without needing a hard threshold
3. Discount — works, but less suited to sustaining a season-long pattern
4. Bundle / 1-for-1 — single-occasion mechanic, weaker across a season
5. Voucher — one-off in nature, weaker for a recurring season-long push
6. Overseas/FX-linked — irrelevant unless the seasonality is itself travel-linked

**Declining transaction activity / win-back** (needs low-friction reactivation):
1. Cashback — simplest "come back, get money back" message; doesn't require spending more than before
2. Discount (targeted at the lapsed segment) — also low friction, reactivation-focused
3. Voucher — works as a reactivation nudge, slightly less flexible
4. Bundle / 1-for-1 — asks a lapsed customer to bring someone, which is a bigger ask than returning alone
5. Spend-and-save — assumes ongoing engagement, mismatched with a lapsed customer
6. Overseas/FX-linked — irrelevant unless the lapse itself is travel-pattern-driven

**Product/SKU needing demand** (needs precise targeting, protect margin elsewhere):
1. Voucher (SKU-specific) — most precise, protects margin on the rest of the basket
2. Bundle / 1-for-1 (SKU-specific) — moves volume on one line without touching headline price
3. Discount (SKU-specific) — precise, but more margin-erosive than a fixed voucher
4. Spend-and-save tied to the SKU — workable if repeat purchase of that SKU is realistic
5. Cashback — harder to restrict cleanly to one SKU
6. Overseas/FX-linked — irrelevant unless the SKU itself is travel-related

Use this cardholder-profile fit as a secondary cross-check when the user gives you an actual segment. The **Target RFM segment(s)** column tells you *which specific customers within the SME's existing base* to aim at, once `sme-business-customer-analysis` has produced an RFM breakdown — demand-gap type picks the mechanic, RFM picks the recipients:

| Reward type | Best-fit cardholder profile | Target RFM segment(s) | Caution |
|---|---|---|---|
| Discount | Price-sensitive, deal-seeking, new-to-merchant | New Customers / Promising (High R, Low F); also Hibernating/Lost as a low-cost reactivation touch | Overuse trains customers to expect it and erodes merchant margin; wasted on Champions who'd buy anyway |
| Cashback | Mass-market, everyday/recurring spend | At Risk / Can't Lose Them (Low R, previously High F/M) for win-back; Need Attention for reinforcement | Broad appeal, less tangible at point of sale than a discount |
| Voucher | Occasion-driven, considered-purchase, new-customer trial | New Customers and Promising, especially higher-ticket categories | Weak reactivation tool for genuinely lapsed segments |
| Spend-and-save / tiered | Loyalty-oriented, already-engaged, higher-frequency | Champions and Loyal / Potential Loyalists (High F, consistent pattern) | Weak for customers with no existing relationship to the merchant |
| Bundle / 1-for-1 | Socially-driven, group or pair occasions; price-aware without being deal-led | New Customers and Promising for trial; Potential Loyalists for habit-building | Only works where a second unit has low marginal cost to the merchant — check before ranking it highly for high-COGS categories |
| Overseas/FX-linked | Travel-active, cross-border spenders | Not an RFM dimension — use the overseas/travel category signal from the Customer Profile, cross-checked against Champions/Loyal to prioritise | Only relevant with an actual overseas/FX signal — don't default to it for affluent segments without one |

> Reference for the spend-and-save → Champions/Loyal mapping: https://www.shopify.com/sg/blog/rfm-analysis — subscription programmes suit high-frequency buyers with consistent purchasing patterns. This project has no subscription reward type, so spend-and-save/tiered is the structural analogue.

## Step 3b — Acquisition targeting: reward recommendation for non-existing customers

Step 3 assumes the recipient already has a transaction history at the SME. Some demand gaps — New outlet especially — need a recommendation aimed at people who have **never shopped there**, so there's no RFM segment to target. For these, use the SME's own **Champion** and **New/Promising** segment profiles as templates for what kind of prospect to court, and pick the reward type from that template. Finding the actual OCBC customers who match a template is `portfolio-allocator`'s job — in this project that matching is done by **merchant-pair lift**, not tag similarity.

**Champion-lookalike prospects:**
1. Voucher — a fixed-value "welcome" framing invites someone who could become high-value, without teaching them to expect a discount from day one
2. Spend-and-save / tiered, front-loaded so the first reward lands quickly
3. Bundle / 1-for-1 — brings a second prospect through the door alongside the first
4. Discount — least preferred; discounting a prospect who would convert anyway trains price sensitivity in the segment you least want it in

**New/Promising-lookalike prospects:**
1. Voucher — lowest-friction trial mechanism
2. Discount (first-visit) — also low friction, works across a broader, more price-sensitive pool
3. Bundle / 1-for-1 — good trial multiplier where marginal cost allows
4. Spend-and-save — weakest here; assumes a relationship that doesn't exist yet

If a demand gap other than New outlet is being used to justify acquisition, say so explicitly — that's a second, additive objective on top of the Step 3 ranking, not a replacement for it.

## Step 4 — Cost and exposure (no split)

The merchant funds the reward in full, so there is no split to recommend. What the recommendation must still surface:

- **Maximum cost to the merchant** — redemption limit × maximum reward value. State it as a hard number whenever a limit and a reward value are both supplied. This is the merchant's whole cost.
- **Expected incremental share** for the recommended type — the portion of redemptions that would not have happened anyway. Returning-customer mechanics score lower here by nature; say so rather than burying it.
- Never present a redemption rate as evidence of incremental trade. Redemption rate measures popularity.

If asked what OCBC contributes, the answer is targeting, delivery and measurement — not money.

## Output format

1. **Eligibility check result** (pass/fail, showing the three values checked: average balance, internal score band, external score band).
2. If failed: stop here with the exact eligibility message.
3. If passed:
   - Demand-gap classification (with an assumption flag if it didn't cleanly fit).
   - **Ranked list of all six reward types** (Step 3), 1 to 6, each with a one-line rationale — never just the top pick. A type that doesn't apply is shown ranked and rejected with its reason, not hidden; for a domestic merchant, overseas/FX is the honest example.
   - **RFM-based targeting** for the #1-ranked type, if an RFM breakdown is available. If not, say so rather than guessing at segment sizes.
   - **Acquisition targeting** (Step 3b) whenever the gap is New outlet or growth beyond the existing base is asked for, kept clearly separate from the existing-customer ranking.
   - Recommended cardholder segment, tied to the #1-ranked type.
   - Maximum merchant cost and expected incremental share (Step 4), where inputs allow.
4. Any assumption flags (demand gap didn't fit cleanly, PD-band direction unconfirmed, no RFM data available).
