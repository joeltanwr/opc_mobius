# Mobius — Build Brief v2

Entry point for Claude Code. Supersedes `MOBIUS_BUILD_BRIEF.md` (v1) and
`MOBIUS_MASTER_RECONCILIATION.md` — discard both. Read this, then the three build prompts.

**Deadline:** pitch ~end September 2026. Deliverable is a 6-minute pitch with a 2–3 minute video.
The app exists to be shown. Polish nothing that isn't on screen.

---

## 1. File manifest and precedence

| File | Role |
|---|---|
| `build_prompt_merchant_view.md` | **Authoritative** — merchant UI, scope, copy, behaviour |
| `build_prompt_rm_view.md` | **Authoritative** — RM UI |
| `build_prompt_customer_view.md` | **Authoritative** — cardholder UI |
| `mock_data_spec.md` | **Authoritative** — data generation, with §3 patches below |
| This file | Authoritative where the above disagree; owns the data/compute/state layers |
| `design-decisions-log.md` | Control-layer rationale — don't relitigate |
| `sme-relationship-value-score.md` | RM prioritisation score |
| `skills/*/SKILL.md` | Logic the compute layer implements; run offline for narrative text |
| `mobius_integrated.html` | Working prototype — source of settled visual decisions, not a spec |

Discard: `MOBIUS_BUILD_BRIEF.md` (v1), `MOBIUS_MASTER_RECONCILIATION.md`,
`mobius-data-contract.md`, `sme-value-cost-share-model.md`, `mobius-spec-skills-reconciliation.md`.
Everything still live from them is folded in here.

The write-up is reference only, lowest priority.

---

## 2. Settled decisions

**Funding — the merchant funds the reward in full.** No cost split, no co-funding slider, no OCBC
contribution anywhere. OCBC supplies targeting, delivery and measurement. Every cost figure shown
to a merchant is that merchant's whole cost. Cost-sharing is a future phase, out of scope, and
must not appear in the build or the deck beyond one roadmap line if asked.

**Reward taxonomy — six types.** Discount, cashback, voucher, spend-and-save, **bundle / 1-for-1**,
overseas/FX-linked. Bundle is the sixth, added because the RM configuration page needs it and it is
a distinct mechanic. Overseas/FX is always shown **ranked and disabled** — the honest rejected case.
**Points is dropped** from the customer filter chips; it implies Mobius issues OCBC points. Replace
that chip with Bundle / 1-for-1. The amended skill in `skills/reward-programme-recommendation/`
already reflects all six.

**Demo clock — Friday 11 September 2026, 15:12 SGT.** One exported constant, used by all three
views. Three views computing "now" independently is how the demo breaks on stage.

**Data period — 2025-10-01 to 2026-09-30.** Shifted forward three months from the original spec so
the data doesn't end ten weeks before the demo clock. H1 still gets 12 months; H2's cold-start
merchant is acquired ~3 weeks before period end; H3's post-CNY dip still falls inside the window.

**Segment floor 250, reach rounded to nearest 50.** Everywhere. Delete the 500 in `mock_data_spec.md`
§8 prose. Floor and rounding together close the sequential-differencing attack; either alone does not.
Refused narrowings never report their count.

**Cardholder base 800,000.** Never ">1 million".

**Merchants:**

| ID | Name | Role |
|---|---|---|
| M0001 | **Soujourner Coffee** | Primary demo merchant. OCBC-acquired, Tue–Thu 14:00–17:00 trough |
| M0055 | **Brew & Co.** | Rival café, NOT OCBC-acquired. Lift source for the H1 cohort. Data only, no login |
| M0002 | **Boba Lane** | Thin history — degrades to category/district benchmarks (merchant prompt §3 profile 3) |
| M0004 | **Tanjong Kopi House** | NOT OCBC-acquired, OCBC business customer. Same district as Soujourner. Drives the reduced card-mix state (merchant prompt §2.2, §3 profile 2). Was the spec's H4 prospect; M0010 is retired |

Three selectable at login: Soujourner, Boba Lane, Tanjong Kopi House.

**Pipeline boundary.** The generator writes `data/raw/` only and plants patterns. The pipeline
reads `data/raw/`, detects them, and is the only thing that writes `public/data/`. If the
generator both planted the trough and wrote `demand_gaps.json`, nothing would have detected
anything and the central claim would be circular.

**Status display map.** State keys are internal; one display map, defined once in the shared
state module: `applied` → Applied, `draft` → In setup, `pending` → Submitted, `active` → Live,
`capped` → Fully redeemed, `stopped` → Stopped, `completed` → Completed. Merchant §7.6's ladder
is the display sequence, not a second set of keys.

**One reward per campaign, everywhere.** RM §2 supersedes merchant §7.2. No stacking logic.

**M0055 sits in the same district as M0001.** Bernice's line says 200 metres, so the spec's
"two districts over" was the error.

**Cardholders** — the six showcase personas from `mock_data_spec.md` §5a stand. Two are load-bearing:

- **Bernice** is the logged-in cardholder in the customer view. The push she receives must be the
  campaign the merchant configured — one campaign seen from three sides is the demo.
- **Edwin** is the suppressed recipient. RM prompt §3.4 requires the push confirmation to show a
  suppression count; Edwin is already at his two pushes this week, so he gets the feed card and no
  push. Seed `allocations.parquet` accordingly.

**Targeting method** — acquisition uses merchant-pair **lift**; retention/reactivation uses **RFM**.
`portfolio-allocator` Step 1 is read with that substitution.

**Constraint, always** — synthetic data only. No real names, brands or customer data.

---

## 3. Generator patches

Apply to `generate.py`, then re-run `validate.py`.

1. **Shift period** to 2025-10-01 → 2026-09-30. Move the completed campaign to ~27 Jul – 24 Aug 2026,
   account opening early September 2026.
2. **`acquiring_transactions.customer_token`** on every row, OCBC and non-OCBC alike. Without it, RFM
   and repeat-rate cover only ~25% of a merchant's customers while presenting as the whole picture.
   OCBC rows' tokens map to `card_id` via a raw-only map; non-OCBC tokens map to nothing — that
   asymmetry is the pitch.
3. **`merchants.parquet`** gains `internal_score_band`, `external_score_band` (1–3, nullable),
   `relationship_start_date`. Consumed by the eligibility gate and the priority score.
4. **`deposit_flows`** extended to all ~70 OCBC-acquired merchants, ≥ 6 months each. Avg balance =
   mean `closing_balance_sgd`; credit turnover = `paynow_inflow_sgd + card_settlement_sgd`.
5. **`cardholders.marketing_consent`** (bool), 15–25% false. A consent filter that removes nobody
   reads as decorative.
6. **`cardholders.mailing_country`**, ~2% deliberately ≠ transaction-majority country.
7. **`data/raw/allocations.parquet`** — `card_id, campaign_id, merchant_id, allocated_date, status` —
   6–10 prior campaigns from other merchants, concentrated on a subset including Edwin.
8. **Dormant tier by construction** produces < 10 txns/month, so the computed threshold agrees with
   the assigned `engagement_tier`.
9. **Plants:** one merchant failing the balance gate (≤ S$30k), one failing both score bands, one
   per priority tier, at least one suppressed demographic band below 250, and one past campaign
   that did not clear its reward cost.
10. **`MIN_SEGMENT_SIZE = 250`**; add rounding-to-50 to every aggregate writer.
11. **Campaigns carry no OCBC contribution.** The shipped Soujourner campaign is rewritten to the
    §5 figures: merchant's full reward cost ≈ S$220, no `ocbc_funded` field anywhere. The split
    is deleted from `mock_data_spec.md` §9 as well. Both completed campaigns (winner and loser)
    are planted as `campaigns.parquet` + `allocations.parquet` + tagged redemption transactions,
    and `pipeline/campaign.py` measures them.
12. **Merchant names per the §2 table:** M0001 Soujourner Coffee, M0055 Brew & Co., M0002 Boba
    Lane, M0004 Tanjong Kopi House.
13. **M0001 has a full 12-month acquiring history:** `acquiring_start_date` precedes
    `PERIOD_START`.

Score bands: the data carries bands 1–5 (1 = best) so that "worse than band 3" is a state
that can exist; the gate clears 1–3. Nullable.

---

## 4. Shared state module — build this before any view

All three prompts define the same contract (merchant §9, RM §9, customer §10) and all three depend
on live propagation. One module, one event bus, three consumers. If each view invents its own state,
the redemption-propagates-to-two-screens moment — which all three documents name as the best thirty
seconds of the pitch — cannot be assembled late.

Status ladder: `applied` → `draft` → `pending` → `active` → `capped` / `stopped` / `completed`.

Events that must propagate without a reload:
- RM fires push → customer notification appears; over-cap recipients get the feed card only,
  suppression counted not silently dropped
- Customer redeems → merchant dashboard stats, RM campaign detail, and customer profile weights all
  update
- Limit or reach cap reached → `capped`, offer closes in the feed and says why
- Campaign stopped → results freeze; offers already delivered stay valid until expiry. Never revoke
  a reward a customer is holding
- Customer turns offers off → leaves every future segment, feed empties

---

## 5. Compute layer — `pipeline/`

Python, reads `data/raw/`, writes `public/data/`. One module per concern, one `run_all.py`.

| Module | Implements | Writes |
|---|---|---|
| `tags.py` | `retailer-transaction-data-analysis` — dormancy, local/foreign, category + style tags, frequency tier | raw-only tag table |
| `sme_analysis.py` | `sme-business-customer-analysis` — 100-txn gate, demand-gap detector, customer profile, RFM | `merchant_profiles.json`, `demand_gaps.json` |
| `lift.py` | Lift + support, aggregator exclusion, cohort = B \ A filtered by daypart/catchment/price band | `affinity.json`, `segments.json` |
| `reward.py` | `reward-programme-recommendation` — eligibility gate, six ranked types, RFM mapping | into `rationales.json` |
| `priority.py` | `sme-relationship-value-score.md` | `merchant_priority.json` (RM only) |
| `allocate.py` | `portfolio-allocator` — pool choice, consent, frequency cap, ranking | `allocation_summary.json` (aggregate only) |
| `campaign.py` | Completed campaign incl. the losing one | `campaign_results.json` |

`merchant_profiles.json` is the file the merchant view loads. `merchant_directory.json` is
deleted. `reward.py` writes its deterministic ranking to `reward_recommendations.json`; the
narrative stays in `rationales.json` so the two are never confused.

`rationales.json` is **not computed** — it's narrative text produced by running the four skills
offline over the generated data, keyed by merchant and screen, hand-reviewed. Each string ≤ 60 words,
every number in it appearing verbatim in the JSON it describes. Carry an `inputs_hash`; if the data
changes, `validate.py` fails until the skills are re-run.

`public/data/` stays under 600 KB. Nothing per-customer ships except the showcase personas, each
carrying `is_illustrative: true`.

### `pipeline/config.py` and `src/data/constants.js`

Every headline figure lives in one of these with a `basis` string. No number typed into a component.
If a figure has no basis it does not ship.

```python
DEMO_CLOCK             = "2026-09-11T15:12:00+08:00"
PERIOD_START           = "2025-10-01"
PERIOD_END             = "2026-09-30"
CARDHOLDER_BASE        = 800_000
ELIG_MIN_BALANCE_SGD   = 30_000   # strict >
ELIG_MAX_SCORE_BAND    = 3        # OR across internal/external
GATE_MIN_OCBC_TXNS     = 100
DORMANT_TXN_PER_MONTH  = 10
MIN_SEGMENT_SIZE       = 250
REACH_ROUNDING         = 50
NARROW_MAX_REFINEMENTS = 5
PRIORITY_TIERS         = [(70, "high"), (40, "medium"), (0, "low")]
LIFT_MIN_SUPPORT       = 20
PUSH_CAP_PER_WEEK      = 2        # PROVISIONAL
FREQ_CAP_OFFERS        = 3        # PROVISIONAL — concurrent offers per cardholder per 30 days
PORTFOLIO_WEEKLY_CEIL  = 50_000   # PROVISIONAL — cardholders contactable per week
```

Anything marked PROVISIONAL renders with a small grey `provisional` pill and a tooltip saying the
threshold is not yet calibrated. RM prompt §3.2 already requires this for the portfolio ceiling;
apply it consistently.

### Detection and scoring rules the prompts don't specify

**Lift cohort filters:** catchment = home or work district equal or adjacent (hand-authored adjacency
dict for SG districts 1–28); `|cardholder.price_band_pref − merchant.price_band| ≤ 1`;
`daypart_availability[gap_daypart] ≥ 0.15`. Band tolerance of 1 excludes Charles (band 4 vs
Soujourner's band 2) while keeping Bernice.

Exclusion reasons recorded per cardholder, one of: `already_customer`, `aggregator_source`,
`catchment`, `price_band`, `daypart`, `consent`, `frequency_cap`, `dormant`.

**Demand-gap detection** — daypart gaps only for the demo; seasonal and SKU are out of scope.
Slot = weekday × daypart (35 slots). Gap if slot volume ≤ 75% of the merchant's own mean slot volume
in ≥ 8 of the trailing 12 weeks, and/or slot share below the peer median (same category, same or
adjacent district). Confidence: **high** if both tests pass and the own-baseline holds ≥ 10/12 weeks;
**medium** if own-baseline alone; **low** if peer alone. Soujourner must land high. Under 4 weeks of
history → cold-start branch, peer daypart shape only, labelled as such.

**RFM lookup** — R, F, M each quintile-scored 1–5 (R inverted); `FM = round(mean(F, M))`. Evaluate
top-down; complete and disjoint.

| Segment | R | FM |
|---|---|---|
| Champions | 4–5 | 4–5 |
| Loyal Customers | 3 | 4–5 |
| Potential Loyalists | 4–5 | 2–3 |
| New Customers | 5 | 1 |
| Promising | 4 | 1 |
| Need Attention | 3 | 1–3 |
| Can't Lose Them | 1–2 | 5 |
| At Risk | 1–2 | 3–4 |
| Hibernating | 2 | 1–2 |
| Lost | 1 | 1–2 |

Alvin (127 visits, R5 F5 M5) → Champions. Retention pools: Champions, Loyal, Potential Loyalists,
Need Attention, At Risk, Can't Lose Them. New/Promising are acquisition archetypes, not send lists.
Hibernating/Lost reported, not targeted.

**Completed campaign — Soujourner** (`campaign.py`; `validate.py` asserts it reconciles):

| Field | Value |
|---|---|
| Offer | 20% off, Tue–Thu 14:00–17:00, capped S$5/txn, feed + push |
| Window | 27 Jul – 24 Aug 2026 |
| Cohort | ~560 → treated 420 / control 140 |
| Treated conversion | 16% (≈67 first-time visitors) |
| Control conversion | 4% (≈6) |
| Redeemed transactions | ≈150, avg ticket S$7.40 |
| Incremental sales vs scaled control | ≈S$950 |
| Reward cost — **merchant's full cost** | ≈S$220 |
| Merchant net contribution (65% GM assumed) | ≈S$440 |
| 30-day unprompted return rate | 35% of converters |
| Operating account opened | `true`, 8 Sep 2026 |

Small absolute numbers, deliberately. The pitch value is the +12pp conversion over control, the 35%
return and the account opening — not the S$950. An implausibly large effect reads as fabricated.

A **second, losing** campaign is required (merchant §8, RM §3.3): high redemption rate, mostly
existing customers, control spent nearly as much, net negative. It is what makes the rest credible.

---

## 6. Build order

1. Generator patches + `validate.py` — green dataset before any logic
2. Shared state module + constants
3. Compute layer (`priority.py` and `reward.py` first — small, deterministic, hand-checkable)
4. Merchant view (largest prompt; Tabs 3 and 4 carry the substance)
5. RM view (reuses merchant components; portfolio panel and push trigger are new)
6. Customer view (smallest, owns the redemption event)
7. Skills run offline → `rationales.json` → hand-edit → film

**Cut in this order if short:** customer §5 preferences screen → merchant Tab 1 polish → RM §6
completed detail.

**Never cut:** the manual push trigger with its suppression count, the refused narrowing, the
suppressed band, the losing campaign, the eligibility gate's failing state. Five small things
carrying most of the pitch's credibility.

---

## 7. Definition of done

`validate.py` passes `mock_data_spec.md` §10 plus:

- Every acquiring row has a `customer_token`; every OCBC row's token resolves to a `card_id`
- All ~70 acquired merchants have ≥ 6 months of `deposit_flows`
- Merchant master contains one balance failure, one both-bands failure, one per priority tier
- Computed dormancy reproduces `engagement_tier == "dormant"` for ≥ 95% of cardholders
- `marketing_consent` opt-out between 15% and 25%
- Frequency cap removes ≥ 1 from the Soujourner cohort, and Edwin is among them
- Bernice in the Soujourner lift cohort; Alvin in Champions and not in the cohort; Charles excluded
  with reason `price_band`
- Boba Lane below 100 OCBC acquiring transactions (gate fires); Soujourner above (gate doesn't)
- Soujourner and the losing campaign both present; net contribution signs opposite
- At least one demographic band renders suppressed
- Every `signature_pattern` figure equals the generated data
- No cost-split or OCBC-contribution figure appears anywhere in `public/data/`
- `rationales.json` `inputs_hash` matches current data
- `public/data/` < 600 KB; two runs hash-identical

Then: all three views render from JSON with no console errors, a redemption propagates to two other
screens without a reload, and every screen carries the "Mock data" marker.

---

## 8. Still open

- **Narrowing agent** (merchant §7.1) is the one place an LLM could run live. Merchant §2.3 permits
  exactly one marked live call with a pre-computed fallback. Decide: canned is safer on stage, live
  is a better answer to "is the AI real". Either way the fallback must exist.
- **"Set up within 2 days"** (merchant §2.5) has no basis. Attach one or soften to a range.
- **Provisional caps** — push cap, portfolio frequency cap, weekly ceiling. Labelled on screen until
  they have a stated basis.
- **PD-band direction** — lower band = better is assumed, not confirmed.
