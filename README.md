# Mock Data Generator — OCBC Merchant Dashboard Demo

Seeded synthetic data for an SME-facing merchant dashboard demo: card-issuing
and acquiring transactions with a real latent-persona structure, plus four
deliberately planted "hero" merchant patterns that drive the demo narrative.

Full spec: `mock_data_spec.md`.

## Running it

```bash
python generate.py   # writes data/raw/*.parquet and public/data/*.json (~100s)
python validate.py   # re-runs generate.py once more and checks every assertion in §10
```

Requires `pandas`, `numpy`, `pyarrow`. Everything is seeded (`SEED = 42`); two
runs produce byte-identical output (`validate.py` checks this directly).

`data/raw/` is a build artifact (gitignored, ~tens of MB). `public/data/` is
what actually ships to the app — currently ~424 KB, under the 600 KB budget.

## Why the data looks like this

Card issuing data is only interesting if it has real structure: cardholders
need to look like they have habits, so that "cardholders who shop at merchant
B also shop at merchant A" is a genuine, minable signal rather than noise.
Every cardholder is drawn from one of 8 persona archetypes (CBD office
worker, heartland family, young professional, student, frequent traveller,
retiree, wellness regular, weekend socialiser), each with its own category
affinity, price-band preference, daypart availability, and home/work
districts. Individual cardholders then get their own Dirichlet-noised draw
around their persona's profile, so segments are real but not artificially
clean. Merchant choice is weighted by category affinity, distance from
home/work (decaying faster for "neighbourhood" merchants than "destination"
ones), price-band fit, and the merchant's own daypart profile — so
co-occurrence between merchants emerges from actual shared customer
preference, not chance.

## File-by-file

### `data/raw/` (Parquet — build artifacts, not shipped)

| file | what it is |
|---|---|
| `merchants.parquet` | 200 merchants, 10 per taxonomy category. `daypart_profile` is stored as a JSON string (Parquet doesn't round-trip nested dict columns cleanly). |
| `merchant_descriptors.parquet` | Messy card-network descriptor variants for ~15% of merchants (outlet suffixes, terminal numbers, spacing collapse, diacritic drift, truncation, case inversion, acquirer prefixes) — this is what `card_transactions.descriptor_raw` actually references, not `canonical_name`. |
| `cardholders.parquet` | 5,000 cardholders. `category_affinity` and `daypart_availability` are JSON-string columns for the same Parquet reason. |
| `card_transactions.parquet` | Issuing side — every merchant, all 5,000 cardholders, ~352k rows. This is OCBC's "where do our cardholders spend" view, independent of who OCBC acquires. |
| `acquiring_transactions.parquet` | Acquiring side — **hero merchants only** (`M0001`, `M0002`, `M0003`; per spec §6, everyone else gets monthly totals baked directly into `merchant_profiles.json` instead of a transaction-level file). Every OCBC-card row here shares its `txn_id`, `amount_sgd` and `txn_datetime` verbatim with the matching `card_transactions.parquet` row; non-OCBC cards appear only here. OCBC cards run to ~25% of each hero merchant's acquiring volume. |

### `public/data/` (JSON — what the app loads)

| file | what it is |
|---|---|
| `taxonomy.json` | 20 flat categories (~10 merchants each), plus the attribute vocab (price band, frequency archetype, catchment type, daypart). |
| `deposit_flows.json` | One row per OCBC-acquired merchant-month: PayNow inflow, card settlement, outflow, closing balance. Deliberately light — one dashboard tile. |
| `affinity.json` | Per hero merchant: ranked lookalike-merchant lift with support counts (aggregators excluded, support ≥ 20 required). `M0002` instead carries `cold_start_fallback: true` (see below); `M0004` carries `available: false` (not OCBC-acquired). |
| `segments.json` | Target-cohort definitions behind the top affinity pairs: size, profile (price band, daypart, home districts), over/under-indexing attributes. Segments below `MIN_SEGMENT_SIZE` (250) ship as `{"suppressed": true, "reason": "below minimum segment size"}` with `size`/`profile` nulled out — the privacy floor is visible in the data, not just a doc comment. |
| `demand_gaps.json` | The two detected anomalies: `M0001`'s Tue–Thu 14:00–17:00 dip (magnitude vs. its own baseline *and* vs. district cafe peers) and `M0003`'s post-CNY seasonal trough. |
| `benchmarks.json` | District × category aggregates (txn count, avg ticket, unique cardholders) — powers preview mode (`M0004`) and the cold-start fallback (`M0002`). |
| `merchant_profiles.json` | One entry per OCBC-acquired merchant. **Daily** series for `M0001`/`M0002`/`M0003` (from `acquiring_transactions.parquet`); **monthly** series for everyone else (synthesized directly from merchant attributes, per spec — no transaction-level truth needed). Also: ticket percentiles, repeat rate, foreign-card share, top adjacent categories. |
| `rationales.json` | Precomputed one-paragraph natural-language justification per hero merchant, built from the actual computed lift/support/gap numbers. |
| `campaign_results.json` | One completed campaign for `M0001`: treated vs. held-out control, redemption rate, incremental transactions/sales vs. control, reward cost split, net contribution, and `merchant_opened_ocbc_operating_account: true`. |
| `showcase_personas.json` | The 6 hand-authored cardholders (see below). All carry `is_illustrative: true` and are meant for a "what this segment looks like" panel, never a browsable list. |

## How the four hero patterns were planted

The base population (§ above) is generated first; hero merchants are then
layered on top, using deterministic, hand-controlled cohorts rather than
hoping the emergent structure lands in the right ranges by chance:

- **`M0001` / `M0055` are excluded from the generic (emergent) transaction
  sampler entirely.** Their entire customer base comes from three explicit
  cohorts built in `build_cardholders_and_cohorts`: 140 `M0001`-only regulars
  (the "Alvin" profile), 70 who transact at both (support for the lift
  computation), and 550 `M0055`-only regulars (the "Bernice" / target-cohort
  profile) — all drawn from CBD-office / young-professional personas forced
  into the Tanjong Pagar corridor with a shared price band and daypart
  profile. This gives `lift(M0001, M0055) ≈ 2.7` with `support ≈ 70` and a
  target cohort of ≈547 by construction, not by luck.
- **`M0001`'s off-peak gap** is baked into the *sampling weights*, not
  subtracted after the fact: its Tue/Wed/Thu-afternoon cells in the
  weekday×daypart table are multiplied by 0.6 before every hero-cohort visit
  is drawn, so the resulting Tue–Thu 14:00–17:00 volume comes out ~40–44%
  below its own Mon/Fri-afternoon baseline (`demand_gaps.json`).
- **`M0002`'s cold start** is two independent restrictions: (1) its
  card-issuing customer base is deliberately collapsed to 15 cardholders
  (`_thin_out_merchant`) so that no lookalike-merchant pair can ever reach
  the `support ≥ 20` threshold, and (2) its acquiring relationship only
  starts 21 days before `PERIOD_END`. Together they force `affinity.json` to
  fall back to a `category_catchment_fallback` cohort built from the other
  nine bubble-tea merchants instead of `M0002`'s own (nonexistent) history.
- **`M0003`'s seasonal trough** is a post-hoc date resampling: every
  `card_transactions` row already assigned to `M0003` gets its date redrawn
  from a custom monthly-weight curve with a sharp Mar–Apr 2026 dip (recovering
  by June), while its hour-of-day is left untouched. `demand_gaps.json`
  reports this against a genuine 12-month baseline so it reads as seasonality,
  not a one-off anomaly.
- **`M0004`** simply never appears in `acquiring_transactions.parquet` or
  `merchant_profiles.json`; `affinity.json` marks it `available: false`. It's
  a real, ordinary cafe in the emergent card-issuing data — OCBC just has no
  acquiring relationship with it, which is the entire "preview mode" pitch.

## Showcase personas

`Alvin`, `Bernice`, `Charles`, `Denise`, `Edwin` and `Farah` are excluded from
the generic sampler too — their *entire* transaction history is hand-specified
in `generate_showcase_transactions` so that every number in their
`signature_pattern` (127 visits, zero visits, S$180 average, 41-day gap /
S$430 burst, 142 transactions at S$9, 9 transactions at one clinic) is
literally true of the generated data, not decorative copy. `validate.py`
re-derives each figure independently from `card_transactions.parquet` and
diffs it against the shipped `signature_pattern` string.

## Known spec note

The spec states `MIN_SEGMENT_SIZE = 250` in the config block (§1) but says
"any segment below **500** is suppressed" in prose (§8). This generator uses
the named config constant (250) consistently in both the suppression logic
and `validate.py`.
