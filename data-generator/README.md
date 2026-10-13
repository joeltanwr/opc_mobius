# Data generator — Mobius

Seeded synthetic data for the Mobius demo. **The generator writes `data/raw/` only.** It plants
patterns; `pipeline/` detects them and is the only thing that writes `public/data/`. If the
generator both planted the Tue–Thu trough and wrote `demand_gaps.json`, nothing would have
detected anything and the central pitch claim would be circular.

Spec: `docs/mock_data_spec.md` with the patches in `docs/MOBIUS_BUILD_BRIEF_V2.md` §3 (1–13).

## Running it

```bash
python data-generator/generate.py     # ~50 s → data-generator/data/raw/  (gitignored)
python pipeline/run_all.py            # ~30 s → public/data/*.json        (shipped, < 600 KB)
python validate.py                    # spec §10 + brief §7; re-runs both and checks the hashes
python validate.py --no-rerun         # checks only
```

Requires `pandas`, `numpy`, `pyarrow`. `SEED = 42`; two runs are byte-identical.

## What is in `data/raw/`

| file | rows | what it is |
|---|---|---|
| `merchants.parquet` | 200 | 10 per category. Score bands (1–5, nullable), `relationship_start_date`, outlets, owner and products held. JSON-string columns: `daypart_profile`, `outlets`, `products_held`. |
| `merchant_descriptors.parquet` | ~310 | Messy card-network descriptor variants for ~15% of merchants. |
| `cardholders.parquet` | 12,000 | Persona-driven cardholders. `marketing_consent` (20% false), `mailing_country` (2% ≠ transaction-majority country). |
| `card_transactions.parquet` | ~906k | Issuing side, all merchants, dated 2025-10-01 → 2026-09-30. `campaign_id` marks planted redemptions. |
| `acquiring_transactions.parquet` | ~235k | Acquiring side for M0001 / M0002 / M0003 only. **Every row carries a `customer_token`.** OCBC rows share `txn_id`, amount and timestamp with the card row; non-OCBC rows exist only here. Issuer bank, scheme, PayNow and outlet per row. |
| `token_map.parquet` | ~3.4k | `customer_token → card_id` for OCBC rows only. Non-OCBC tokens map to nothing — that asymmetry is the pitch. Raw-only. |
| `deposit_flows.parquet` | ~830 | Monthly PayNow inflow, card settlement, outflow, closing balance for all 69 OCBC business customers (68 acquired + Tanjong Kopi House), ≥ 6 months each. |
| `campaigns.parquet` | 14 | Two completed Hanami campaigns (winner + loser), 3 completed and 3 live from other merchants, 6 applications awaiting RM contact. |
| `allocations.parquet` | ~4.6k | Who was allocated to which campaign, treated/control arm, status, `pushed_at`. Concentrated on a subset that includes Edwin. |
| `taxonomy.json`, `showcase_personas.json`, `cohorts.json` | — | The 20 categories; the six persona bios with **templated** signature lines (the pipeline fills the numbers from the data); the planted cohort ids and plant merchant ids. |

## How the patterns are planted

- **Population.** Eight persona archetypes; each cardholder is a Dirichlet-noised draw around
  one. Merchant choice weights category affinity, home/work distance, price-band fit and the
  merchant's daypart profile, so co-occurrence is real signal. Dormant-tier cardholders are
  capped at 12 transactions for the year by construction (patch 8).
- **H1 — Hanami Matcha (M0001) and Green Whisk Matcha (M0055), same district.** Excluded from the
  generic sampler; their customer bases are three explicit corridor cohorts (1,300 Hanami-only,
  700 both, 800 Green Whisk-only) sized so lift clears 2.5 at N = 12,000, B \ A lands in 350–800 after
  the past campaign converts ~67, and Hanami's OCBC base (~2,000) lets RFM segments and age
  bands clear the 250 floor — except one age band, on purpose. The Tue/Wed/Thu 14–17 cells of
  M0001's weekday × daypart table are multiplied by 0.4 before every visit is drawn, on the OCBC
  and non-OCBC sides alike. Both shops are matcha bars kept in the café category, so the lift pair,
  peer set and ticket range are unchanged.
- **Hanami's hours and customer mix.** Open 08:00–18:00 (`M0001_OPEN_HOURS`): no sale rings outside
  it. Non-OCBC customers are a repeat pool plus 1,500 one-time visitors spread over the year and a
  first-timer flow of 75 a day from 21 days before the demo clock, so ~30% of everyone Hanami has seen
  came once. 700 OCBC cardholders who drink at Green Whisk Matcha tried Hanami once, 5–8 days
  before the clock — the RFM Promising band — so the Promising pool clears the 250 floor; drawing
  them from Green Whisk's own customers keeps the lift above 2.5. RFM stays quintile-scored, which
  caps how far the mix can move: Promising lands near 5%, Champions near 23%, Loyal near 10%.
- **H2 — Boba Lane (M0002).** Card-issuing base collapsed to 15 cardholders and acquiring starts
  21 days before period end, so the 100-transaction gate fires and no lookalike pair reaches support.
- **H3 — M0003 (apparel).** Post-CNY date resampling. Data only; seasonal detection is out of demo scope.
- **Tanjong Kopi House (M0004).** Ordinary café in the emergent data, OCBC business customer, not
  OCBC-acquired: the reduced card-mix state.
- **Campaigns (patch 11).** Winner: 20% off Tue–Thu 2–5pm, 27 Jul – 24 Aug 2026, 420 treated /
  140 control from the Green Whisk Matcha cohort, 67 converters with tagged redemptions, 35% of them
  returning unprompted, 6 control organics. Loser: 25% off weekday lunch to existing regulars,
  March 2026, 400 / 400, redemptions tagged onto the visits they were already making. The pipeline
  measures both; nothing about the result is typed in.
- **Plants (patch 9).** One merchant with average balance ≈ S$18k (balance gate), one with both
  score bands at 4/5, one with no scores on file (unranked), Hanami with the priority worked
  example's turnover and balance. Edwin holds two live offers, both pushed in the demo week.

## Showcase personas

Joel, Kelly, Charles, Denise, Edwin and Farah have hand-specified histories, all dated on or
before the demo clock so that as-of-clock computation and the full period agree on every quoted
figure. Charles has four premium coffees at Green Whisk Matcha so he is a candidate for the Hanami
cohort and is rejected on price band rather than by absence; Edwin has eight, works in Tanjong
Pagar, and is at the weekly push cap. `validate.py` re-derives every signature figure from
`card_transactions.parquet` and diffs it against `public/data/showcase_personas.json`.
Jieru is the seventh: an ordinary generated cardholder from the first-timer group (the consented,
active one whose acquiring token sorts first, so RFM's tie-break scores her F = 1), given a bio.
One S$5.90 visit seven days before the clock makes her Promising.
