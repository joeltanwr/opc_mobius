# Mock Data Generator — Spec

Build a seeded Python generator producing synthetic data for an SME-facing merchant dashboard demo. Card issuing data reveals where OCBC cardholders spend at merchants OCBC does *not* acquire; that asymmetry is the product, so the data must contain real co-occurrence structure.

---

## The one rule that matters

**Do not generate transactions uniformly at random.** The demo's hero moment is a lift computation that says *"2,300 cardholders who regularly visit merchants like yours have never transacted with you."* If transactions are random noise, lift returns nothing and the demo is empty.

Every cardholder must have a **latent persona** — a preference vector over categories, a price band, home and work districts, and a daypart availability profile. Transactions are sampled from that persona against merchant attributes. Co-occurrence structure then emerges naturally, and the recommender finds real signal.

On top of the emergent structure, **deliberately plant** the three hero patterns described in §7.

---

## 1. Configuration

Single config block at the top of the generator:

```python
SEED = 42                    # fixed; output must be byte-identical across runs
N_CARDHOLDERS = 5_000
N_MERCHANTS = 200            # ~10 per category, so every merchant has real peers
PERIOD_START = "2025-10-01"
PERIOD_END   = "2026-09-30"  # 12 months (brief §2)
TXN_PER_CARDHOLDER_MEAN = 60 # over the full period, log-normal
DESCRIPTOR_NOISE_RATE = 0.15 # share of merchants with messy descriptor variants
MIN_SEGMENT_SIZE = 250       # privacy floor enforced in aggregates
```

Outputs:
- `data/raw/` — Parquet, build artifact, gitignored. Large. **The generator writes only this.**
- `public/data/` — JSON, shipped to the app. Must stay under ~600 KB total. **Written by
  `pipeline/` only** (see `MOBIUS_BUILD_BRIEF_V2.md` §5); the generator plants, the pipeline detects.

The period, cardholder count and cohort sizes above are superseded by the brief's §2/§3 and the
config block at the top of `generate.py`.

The app **never** loads raw transactions. It loads precomputed aggregates only (§8).

---

## 2. Taxonomy — `public/data/taxonomy.json`

**Flat, exactly 20 categories, ~10 merchants each.** Depth is the enemy here: a merchant needs peers in its own category for benchmarking and cold start to work at all, so a small taxonomy densely populated beats a large sparse one.

Category alone doesn't drive matching, so every merchant also carries orthogonal attributes — two cafés at different price points draw different people.

```json
{
  "categories": [
    { "id": "cafe", "label": "Cafe", "group": "F&B",
      "typical_mcc": [5812, 5814], "ticket_range_sgd": [6, 22],
      "frequency_archetype": "routine", "daypart_peak": "morning" }
  ],
  "attributes": {
    "price_band": [1, 2, 3, 4],
    "frequency_archetype": ["habitual", "routine", "considered", "rare"],
    "catchment_type": ["neighbourhood", "office", "destination", "transit"],
    "daypart": ["morning", "lunch", "afternoon", "evening", "late"]
  }
}
```

**The 20 categories:**

*F&B (8)* — cafe, bubble tea, hawker & kopitiam, zichar & Chinese casual, Japanese, bakery & dessert, fast food, bar & pub

*Retail (5)* — apparel, beauty & cosmetics, convenience & grocery, electronics, books & gifts

*Services & lifestyle (5)* — hair & nail salon, gym & fitness studio, clinic & wellness, cinema & arcade, pet services

*Other (2)* — ride-hailing & transit, online marketplace

`online marketplace` and `ride-hailing & transit` carry `is_aggregator: true` and are excluded from lift.

Set the persona affinity vectors so **adjacent categories co-occur**: cafe ↔ bubble tea ↔ bakery for the afternoon crowd, zichar ↔ bar for evening, gym ↔ clinic ↔ beauty for the wellness persona. Cross-category adjacency is what makes the recommendation panel interesting beyond the obvious same-category competitor.

---

## 3. Merchants — `data/raw/merchants.parquet`

| field | type | notes |
|---|---|---|
| `merchant_id` | str | `M0001` |
| `canonical_name` | str | plausible Singapore business name |
| `category` | str | one of the 20 taxonomy ids; ~10 merchants per category |
| `mcc` | int | sampled from the category's `typical_mcc`; **10% deliberately mis-assigned** to a plausible-but-wrong MCC |
| `price_band` | int | 1–4 |
| `frequency_archetype` | str | |
| `catchment_type` | str | |
| `daypart_profile` | dict | weights over 5 dayparts, sums to 1.0 |
| `postal_district` | int | 1–28 |
| `lat`, `lng` | float | within the district |
| `outlet_count` | int | 1 for most; 3–40 for chains |
| `is_chain` | bool | |
| `is_aggregator` | bool | true for all merchants in `online marketplace` and `ride-hailing & transit` |
| `is_ocbc_acquired` | bool | ~35% true |
| `acquiring_start_date` | date | null if not acquired |

**Aggregators matter.** The ~20 merchants across the two aggregator categories should carry disproportionately high transaction volume — most cardholders use Grab and Shopee. They must be excluded from lift, or they'd top every recommendation. The exclusion logic needs something real to exclude, and demonstrating it is a credibility beat.

---

## 4. Descriptors — `data/raw/merchant_descriptors.parquet`

The entity-resolution demo lives here.

| field | type |
|---|---|
| `descriptor_raw` | str |
| `merchant_id` | str |
| `is_canonical` | bool |

For `DESCRIPTOR_NOISE_RATE` of merchants, emit 2–4 variants using these transformations: outlet suffix (`KOI THE @ AMK HUB`), terminal numbering (`KOI THE 234`), spacing collapse (`KOITHE SG`), diacritic drift (`KOI THÉ`), truncation to 22 chars, case inversion, and acquirer prefixes (`SG*`, `PAYNOW-`).

Card transactions reference `descriptor_raw`, not `canonical_name`. The app must resolve them.

---

## 5. Cardholders — `data/raw/cardholders.parquet`

| field | type | notes |
|---|---|---|
| `card_id` | str | `CH00001`, styled as a hash |
| `persona_id` | int | 0–7 |
| `category_affinity` | dict | weights over the 20 categories, sums to 1.0 |
| `price_band_pref` | int | 1–4, with spread |
| `home_district`, `work_district` | int | |
| `daypart_availability` | dict | weights over 5 dayparts |
| `age_band` | str | `25-34` etc. |
| `card_product` | str | `365`, `Titanium`, `Rewards`, `Voyage`, `90N` |
| `tenure_months` | int | |
| `engagement_tier` | str | `high` / `medium` / `low` / `dormant` — controls txn frequency |

Eight personas, each an archetype (CBD office worker, heartland family, young professional, student, frequent traveller, retiree, wellness regular, weekend socialiser). Individual cardholders draw from their persona's distribution with noise, so segments are real but not artificially clean.

---

## 5a. Showcase personas — `public/data/showcase_personas.json`

Six hand-authored cardholders with deterministic, legible transaction histories. Their purpose is narrative: a judge should understand the recommendation in five seconds by reading one person, not by trusting a number.

**These are labelled composite illustrations, not customer records**, and the field `is_illustrative: true` must appear on every one. They render only in a "what this segment looks like" panel — never as a browsable list, never with export.

Each entry carries `name`, `age`, `occupation`, `home_district`, `card_product`, a one-line description, a `signature_pattern` string, `top_merchants` (5 with visit counts), and `cohort_membership` naming which hero cohorts they fall into.

`signature_pattern` is the memorable line — one concrete habit with a number attached, not an adjective. It is what a judge repeats back afterwards, so write it before writing anything else.

| persona | personality | `signature_pattern` | role |
|---|---|---|---|
| **Alvin, 34** — accounts manager, Tanjong Pagar | Creature of habit to an almost comic degree. Same flat white, same 8:40am, same corner table, fourteen months running. Has never ordered anything else on the menu. | *"127 visits to `M0001`. 127 flat whites."* | The **fingerprint** — this is who already converts here. |
| **Bernice, 29** — consultant, one street over | Alvin's statistical twin. Same daypart, same price band, same category mix, same S$6–7 ticket. The only difference is which way she turns out of the lift lobby. | *"Buys the identical coffee, 200 metres away, 4 days a week. Zero visits to `M0001`."* | The **target**, and the H1 hero. |
| **Charles, 52** — director, Orchard | Does not look at prices. Hotel dining, premium retail, business class. A 15% discount changes nothing about his behaviour — he was buying it regardless. | *"Average ticket S$180. Has never used a voucher."* | The **exclusion** case. Rejecting him *is* the incrementality argument, made visible. |
| **Denise, 31** — Tampines, two young kids | Spends in bursts, not streams. Silent for six weeks, then clears a whole season's shopping in one Saturday. Everything is timed to school holidays and CNY. | *"Nothing for 41 days, then S$430 in a single afternoon."* | H3 apparel cohort — the seasonal buyer. |
| **Edwin, 26** — Bugis, first job | Highest transaction count in the entire dataset and the smallest tickets. Tries every new opening within a week. Loyal to nothing. | *"142 transactions. Average S$9."* | H2 cold start — reachable only through category peers. |
| **Farah, 58** — Toa Payoh | Card lives in a drawer. Kopitiam, wet market and hawker all in cash. The card comes out for the clinic and almost nothing else. | *"9 card transactions in 12 months. All at the same clinic."* | Dormant reactivation, and the honest limit: too little data to recommend confidently, and the UI should say so. |

**Alvin, Bernice and Charles carry the demo.** Put them on screen together: this is who converts, here is someone identical the merchant could never have found, and here is someone we deliberately rejected. That third one is what separates a real recommender from a mailing list.

Merchant names should be plausible Singapore businesses — no real brands. `M0001` is the Tanjong Pagar café with the Tuesday gap, `M0055` its rival across the road.

Every bio must stand alone. A judge reading nothing but the `signature_pattern` line should understand why Bernice is in the cohort and Charles isn't.

Generate their transactions **first**, hand-specified, then generate the remaining ~4,994 cardholders around them. The `signature_pattern` numbers must be *true of the generated data*, not decorative — if Alvin's history shows 118 visits, the line says 118.

---

### `data/raw/card_transactions.parquet` — issuing side, all merchants

| field | type |
|---|---|
| `txn_id`, `card_id`, `merchant_id`, `descriptor_raw` | str |
| `mcc` | int |
| `amount_sgd` | float |
| `txn_datetime` | timestamp |
| `channel` | `pos` / `contactless` / `ecom` |
| `country` | `SG` (≈92%), plus MY, ID, TH, JP, AU |
| `merchant_district` | int |

Sampling per transaction: pick daypart from cardholder availability → pick category from affinity → pick merchant from that category, weighted by district proximity, price-band fit, and merchant daypart profile → draw amount from the merchant's ticket distribution.

Layer in weekly seasonality (weekend F&B lift), monthly seasonality (CNY, year-end retail), and a mild growth trend.

### `data/raw/acquiring_transactions.parquet` — OCBC-acquired merchants only

| field | type |
|---|---|
| `txn_id`, `merchant_id`, `terminal_id` | str |
| `amount_sgd` | float |
| `txn_datetime` | timestamp |
| `card_scheme` | `visa` / `mastercard` / `amex` / `unionpay` |
| `card_bin_country` | `SG` mostly; foreign share varies by `catchment_type` |
| `is_ocbc_card` | bool |

**Generate transaction-level acquiring data only for the hero merchants (§7).** Every other acquired merchant gets monthly totals instead. The dashboard only ever renders the logged-in merchant's own detail, so nothing is lost and the file stays small.

**Join consistency is required.** For a hero merchant, every OCBC-card transaction must appear in *both* files with identical `txn_id`, amount and timestamp. Non-OCBC cards appear only in acquiring. Roughly 25% of a merchant's acquiring volume should be OCBC cards — this is the "you only see a quarter of your customers, we see all of them" argument in the pitch.

### `public/data/deposit_flows.json` — one row per merchant-month

`merchant_id`, `month`, `paynow_inflow_count`, `paynow_inflow_sgd`, `card_settlement_sgd`, `outflow_sgd`, `closing_balance_sgd`, `has_ocbc_operating_account`.

Deliberately light. One dashboard tile, not a pillar.

---

## 7. Planted hero patterns

These drive the demo. Generate the base population first, then inject.

**H1 — Off-peak gap (`M0001`, `cafe`, Tanjong Pagar, OCBC-acquired, full 12 months history).**
Tue–Thu 14:00–17:00 volume runs 40% below its own weekly average, and below the other nine cafés in the benchmark set. Plant a non-OCBC competitor `M0055` (also `cafe`) in the same district, 200 metres away, with strong lift against `M0001`'s converting profile: cardholders who transact at `M0055`, are available in that daypart, are within catchment, match the price band — and have **zero** transactions at `M0001`. Verify the cohort lands between 350 and 800, and that Bernice (§5a) is inside it.

**H2 — Cold start (`M0002`, `bubble tea`, OCBC-acquired, `acquiring_start_date` 3 weeks before `PERIOD_END`).**
Almost no history. Forces the category-and-catchment fallback path. The target cohort must be derivable from the other nine bubble tea merchants, not from `M0002`'s own data.

**H3 — Seasonal trough (`M0003`, `apparel`, OCBC-acquired).**
Clear post-CNY dip, recovering by mid-year. Tests changepoint detection against genuine seasonality rather than a one-off anomaly.

**H4 — Prospect (`M0004`, `cafe`, NOT OCBC-acquired).**
Preview mode. No acquiring data at all. Only district-and-category benchmarks are available — which is exactly the switching pitch.

---

## 8. Precomputed aggregates — `public/data/`

Everything the app renders. Nothing raw ships.

| file | contents |
|---|---|
| `merchant_profiles.json` | **daily** series for hero merchants only; **monthly** for all others. Plus daypart breakdown, ticket distribution, repeat rate, foreign-card share, top adjacent categories |
| `demand_gaps.json` | detected gaps: merchant, daypart window, magnitude vs own baseline and vs district peers, confidence |
| `affinity.json` | for hero merchants only: ranked merchant-pair lift with support counts, aggregators excluded |
| `segments.json` | target cohorts: size, category/price/daypart/district profile, over- and under-indexing attributes for the fairness panel |
| `benchmarks.json` | district × category aggregates for preview mode and cold start |
| `campaign_results.json` | one completed campaign (§9) |
| `rationales.json` | precomputed LLM output, keyed by merchant and segment |

**Enforce `MIN_SEGMENT_SIZE`.** Any segment below 250 is suppressed and emitted as `{"suppressed": true, "reason": "below minimum segment size"}`. The app must render that state — the privacy floor is a feature you want visible on screen, not a promise in the appendix.

### Lift specification

For target merchant A and candidate merchant B:

```
lift(A,B) = P(shops at A | shops at B) / P(shops at A)
support(A,B) = |cardholders(A) ∩ cardholders(B)|
```

Exclude any B where `is_aggregator`. Require `support ≥ 20`. Rank by lift, break ties by support. Target cohort = `cardholders(B) \ cardholders(A)`, filtered by daypart availability, catchment distance and price-band fit.

Use lift rather than raw co-occurrence — raw counts surface only the most popular merchants for every query.

---

## 9. Campaign results — `public/data/campaign_results.json`

One completed campaign for `M0001`, closing the flywheel visually.

Treated cohort and a held-out control drawn from the same segment. Include: offer terms, treated/control sizes, redemption count and rate, incremental transactions and sales versus control, the merchant's reward cost (the merchant funds the reward in full — there is no OCBC-funded figure), net contribution, and — the closing beat — `merchant_opened_ocbc_operating_account: true` with a date.

A second, losing campaign for `M0001` is required alongside it: high redemption rate, mostly existing customers, control spent nearly as much, net negative. Both are planted by the generator as `campaigns.parquet` + `allocations.parquet` + tagged redemption rows and measured by `pipeline/campaign.py`.

Make control-group uplift **positive but modest**. An implausibly large effect reads as fabricated; a realistic one reads as measured.

---

## 10. Deliverables

1. `generate.py` — single entry point, fully seeded, reproducible.
2. `validate.py` — assertions that must pass:
   - every category has at least 8 merchants
   - H1 target cohort size falls between 350 and 800
   - Bernice is in the H1 cohort; Charles and Alvin are not (Alvin already transacts at M0001)
   - every `signature_pattern` figure matches the persona's actual generated transactions
   - all six showcase personas carry `is_illustrative: true`
   - `lift(M0001, M0055) > 2.5` with `support ≥ 50`
   - no aggregator appears in any `affinity.json` top-10
   - every OCBC-card acquiring txn has a matching card txn with identical amount and timestamp
   - no shipped segment falls below `MIN_SEGMENT_SIZE` unless flagged suppressed
   - `public/data/` total size under 600 KB
   - two consecutive runs produce identical output hashes
3. `README.md` — how to run, what each file contains, and how the hero patterns were planted.

Print a summary table on completion: row counts per file, hero cohort sizes, top-5 lift pairs for each hero merchant.
