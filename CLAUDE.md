# Mobius — OCBC hackathon build

Two-sided rewards engine linking OCBC cardholders to EmB/SME merchants. Demo for a 6-minute
pitch at the end of September 2026, with a 2–3 minute video. The app exists to be shown on a
projector and to survive a banker's follow-up question. Optimise for legibility at 3 metres
and defensibility under questioning, not feature count.

## Read first

`docs/MOBIUS_BUILD_BRIEF_V2.md` — entry point. Sets document precedence and owns the data,
compute and state layers. Read it before writing any code.

## Document precedence

1. `docs/build_prompt_merchant_view.md`, `_rm_view.md`, `_customer_view.md` — **authoritative
   for all UI**, scope, copy and behaviour. Three interfaces sharing one state contract.
2. `docs/mock_data_spec.md` — authoritative for data generation, with the patches in §3 of the
   brief applied.
3. `docs/MOBIUS_BUILD_BRIEF_V2.md` — authoritative where the above disagree.
4. `docs/design-decisions-log.md` — control-layer rationale. Don't relitigate what's settled there.
5. `docs/sme-relationship-value-score.md` — RM caseload prioritisation score.

`docs/skills/*/SKILL.md` are the analysis logic the compute layer implements, and are run
offline to produce narrative text. They are reference documents, not installed skills, and
nothing in the app invokes them at runtime.

`docs/mobius_integrated.html` is a working prototype — a source of already-settled visual
decisions, not a spec.

Anything in `docs/archive/` is superseded. Don't build from it.

## Settled — do not reopen

- **The merchant funds the reward in full.** No cost split, no co-funding slider, no OCBC
  contribution anywhere. OCBC supplies targeting, delivery and measurement. Every cost figure
  shown to a merchant is that merchant's whole cost. Cost-sharing is a future phase.
- **Six reward types:** discount, cashback, voucher, spend-and-save, bundle / 1-for-1,
  overseas/FX-linked. Overseas/FX is always shown ranked and disabled. Points is not a type.
- **Demo clock:** 2026-09-11 15:12 SGT, one exported constant used by all three views.
- **Data period:** 2025-10-01 to 2026-09-30.
- **Segment floor 250**, reach rounded to the nearest 50, refused narrowings never report their
  count. Floor and rounding together close the differencing attack; either alone does not.
  Exception (round 8): Customer Profile's RFM and age-band breakdowns display at 50
  (`MIN_BREAKDOWN_SIZE`). Anything targetable keeps 250.
- **Cardholder base 800,000.** Never ">1 million".
- **Acquisition targeting uses merchant-pair lift; retention uses RFM.**
- Primary merchant is **Soujourner Coffee**; the logged-in cardholder is **Bernice**; the
  suppressed push recipient is **Edwin**.

## Non-negotiable

- **Synthetic data only.** No real customer data, no real brands, no real named people.
- **No number without a basis.** Every headline figure lives in `pipeline/config.py` or
  `src/data/constants.js` with a `basis` string. Nothing typed into a component. A figure with
  no basis doesn't ship; a provisional figure renders with a visible `provisional` tag.
- **AI explains, rules decide.** Segment matching, reach counts, uplift, thresholds and all
  campaign statistics are deterministic and auditable. AI generates narrative summaries, segment
  names and offer copy only, and every generated sentence sits next to the number that produced
  it. Pre-compute AI output into JSON; the live demo must not depend on a network call.
- **No one-click launch.** Nothing sends an offer to a customer in a single step. Merchant
  applies → RM contacts and configures → OCBC approves.
- **The merchant never receives a cardholder identity or a targetable list**, and there is no
  screen where it could.
- Every screen carries a visible "Mock data" marker.

## Build order

1. Generator patches + `validate.py` — a green dataset before any logic
2. Shared state module + constants
3. Compute layer under `pipeline/`
4. Merchant view, then RM view, then customer view
5. Skills run offline → `rationales.json` → hand-review

Never cut: the manual push trigger with its suppression count, the refused narrowing, the
suppressed demographic band, the losing campaign, the eligibility gate's failing state. Each is
small and each carries most of the pitch's credibility.

## Repo

- `data-generator/` — seeded synthetic data generator. Output: `data-generator/data/raw/` (Parquet,
  gitignored). It writes nothing else: the generator plants patterns, the pipeline detects them.
- `pipeline/` — deterministic compute layer, the only writer of `public/data/*.json` (under 600 KB
  total). Per-customer intermediates go to `data-generator/data/derived/` (gitignored).
- `validate.py` at the repo root — spec §10 + brief §7; `--no-rerun` skips the reproducibility re-run
- `src/` — Vite + React, three views, one shared state module
- The app loads precomputed aggregates only. Nothing raw ships, and no per-customer record ships
  except the showcase personas, each flagged `is_illustrative: true`

## Working style

Say what you're about to do before doing it on anything that spans more than one file. Where a
spec is ambiguous or two documents conflict, stop and ask rather than picking one — the conflicts
that remain are the ones nobody has settled yet, and guessing at them silently is how the demo
ends up indefensible.
