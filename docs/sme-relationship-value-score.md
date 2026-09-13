# SME Relationship-Value Score

**Supersedes `sme-value-cost-share-model.md`.** Same three components, same arithmetic, different
question. It no longer sets a funding split; it ranks an RM's caseload.

**Funding, settled:** the merchant funds the reward in full. OCBC supplies targeting, delivery and
measurement. There is no cost split, no co-funding slider and no OCBC contribution anywhere in the
hackathon build. Every cost figure shown to a merchant is that merchant's whole cost. Cost-sharing
is a **future phase**, out of scope — see the closing note.

**Where it runs:** offline, in `pipeline/priority.py`, writing `merchant_priority.json`.
**Who sees it:** the RM only, on the portfolio dashboard pending list. Never the merchant, never
the cardholder.

**All rates and boundaries are illustrative** pending validation against internal data.

---

## What it answers

An RM covering a book of EmB and MM merchants has more applications than calling hours. The
pending list currently sorts by how long someone has waited, which is fair but not useful. This
score answers *which of these is worth the conversation first*, and does it in three numbers the
RM can repeat to their team lead.

The logic is unchanged from the funding version because the underlying question is the same:
where is there relationship value OCBC hasn't captured yet. A merchant already fully banked with
OCBC has little headroom left to win. A merchant pushing large volumes through its terminals
while keeping almost nothing on deposit is the one worth the call.

---

## Step 0 — Data-sufficiency gate (run first)

| Check | Requirement |
|---|---|
| Transaction history | ≥ 6 months of credit turnover data |
| CASA history | ≥ 6 months of average balance data |
| Score band | At least one of internal / external transaction score present |

Any check fails → tier **Insufficient data**, `basis = "insufficient_data"`.

RM-facing text: *"Not enough relationship history to prioritise — assess after 6 months of
transaction data."*

This is distinct from scoring low. A merchant in the bottom tier has been assessed and found to
have modest headroom; a merchant with no data has not been assessed at all. The pending list
should render these differently — an unscored merchant is not deprioritised, it's unranked, and
an RM may well call it first for reasons the model can't see.

---

## Step 1 — Score (0–100)

Size and Upside are percentile-ranked **within the participating merchant pool**, so no absolute
threshold has to be defended.

### 1a. Size (0–40)

```
turnover_ann = sum(credit_inflows, last 6 months) × 2
size_points  = percentile_rank(turnover_ann, merchant_pool) × 40
```

### 1b. Upside (0–40)

```
capture_ratio = avg_CASA_balance_6m / turnover_ann     # floor 0.01, cap 1.0
upside_points = (1 − percentile_rank(capture_ratio, merchant_pool)) × 40
```

Inverted deliberately: **low capture ratio scores high.** Turnover flowing through the merchant
without sitting with OCBC is headroom. S$3m turnover against S$40k average balance scores near 40;
S$3m against S$900k scores near 0 — already won.

### 1c. Quality (0–20)

Better of the internal and external score bands, matching the OR logic in the eligibility gate.

| Best band | Points |
|---|---|
| Band 1 | 20 |
| Band 2 | 10 |
| Band 3 | 0 |

> **Assumption flag:** lower band = better/lower risk, standard PD-band convention. Unconfirmed
> for this scoring convention; invert the table if it runs the other way.

```
score = size_points + upside_points + quality_points
```

No scenario modifier. The old ±10 adjustment existed to reflect which party captured more value in
a given campaign, which only mattered when there was a split to adjust. Prioritisation is a
property of the merchant, not of a campaign that hasn't been configured yet.

---

## Step 2 — Tier

| Score | Tier | RM meaning |
|---|---|---|
| 70–100 | **High** | Call first — large, under-banked, acceptable risk |
| 40–69 | **Medium** | Worth the call, less headroom or weaker credit |
| 0–39 | **Low** | Programme still available; low relationship upside |
| — | **Insufficient data** | Unranked, not deprioritised |

Recut the percentile boundaries quarterly as the merchant pool grows, so tier sizes stay stable.

---

## Output contract

```json
{
  "merchant_id": "string",
  "tier": "high | medium | low | insufficient_data",
  "score": 72,
  "components": {
    "size_points": 31.2,
    "upside_points": 30.8,
    "quality_points": 10
  },
  "inputs_used": {
    "turnover_ann_sgd": 0,
    "avg_casa_6m_sgd": 0,
    "capture_ratio": 0.0,
    "best_score_band": 2,
    "pool_size": 0,
    "data_window": "YYYY-MM-DD to YYYY-MM-DD"
  },
  "flags": ["illustrative_rates", "pd_band_direction_unconfirmed"]
}
```

Surface all three component values in the RM pending row, not just the tier. The explainability
claim depends on the RM being able to answer "why is this one first" without opening anything.

---

## Worked example — Soujourner Coffee

- Turnover (6m × 2) ≈ S$1.5m → 78th percentile → **31.2**
- Avg CASA ≈ S$45k ÷ S$1.5m = ratio 0.03 → 23rd percentile → (1 − 0.23) × 40 = **30.8**
- Internal band 1 → **20**
- Score **82** → **High**

Plain English for the RM: *large merchant, most of its banking is elsewhere, good credit — call
this week.*

---

## Future phase — cost sharing (out of scope)

The original design used this same score to set an OCBC funding contribution of 0–20%, with a 0%
default where data was insufficient and a 5% allowance for new-to-bank merchants on their first
campaign. It was cut for the hackathon because merchant-funds-in-full is simpler to pitch and
avoids a P&L question the demo can't answer with real margin data.

Kept here because the analysis stands and the phase-2 argument is straightforward: once actual
incremental-value measurement exists from live campaigns, OCBC co-funding can be justified against
measured relationship capture rather than assumed. At that point the tiers above map directly onto
funding bands, and nothing in this model has to be rebuilt.

Do not surface any of this in the hackathon build or deck, beyond a single roadmap line if asked.
