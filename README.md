# opc_mobius

An SME-facing merchant dashboard demo built on OCBC card data. The pitch:
card issuing data reveals where OCBC cardholders spend at merchants OCBC
does *not* acquire — that asymmetry is the product. A merchant logs in and
sees a recommendation like *"2,300 cardholders who regularly visit merchants
like yours have never transacted with you,"* backed by a real lift
computation, not a mailing list.

## Repo layout

```
opc_mobius/
├── public/data/       # shipped data — the interface reads only from here
├── data-generator/    # produces public/data/*.json (and local-only raw parquet)
└── (interface TBD)    # the dashboard itself; not built yet
```

**`public/data/`** is the contract between the two halves of this project.
It holds precomputed aggregates only — taxonomy, merchant profiles, detected
demand gaps, lift-based affinity/segments, district benchmarks, one
completed campaign, precomputed rationale text, and six hand-authored
showcase personas. Nothing raw ships: no individual transaction ever leaves
`data-generator/`. Total size is kept under 600 KB so the interface can
fetch these as static JSON with no backend in between — see
[`data-generator/README.md`](data-generator/README.md) for the full
file-by-file breakdown.

**`data-generator/`** is a self-contained Python pipeline (seeded, fully
reproducible) that builds a synthetic population of cardholders and
merchants with real persona-driven co-occurrence structure, plants four
"hero" merchant patterns that drive the demo narrative (an off-peak gap, a
cold-start merchant, a seasonal trough, and a preview-mode prospect), and
precomputes every aggregate above. It has no dependency on the interface and
can be re-run on its own at any time:

```bash
cd data-generator
python generate.py
python validate.py
```

**The interface** — the actual dashboard a merchant would log into — is not
built yet. When it is, it should live in its own top-level folder (e.g.
`app/` or `web/`) and read exclusively from `public/data/*.json` via plain
relative fetches (`/data/taxonomy.json`, etc.), the same way it would once
deployed. It should never need to know how that data was produced, and
should never reach into `data-generator/` or its local `data/raw/` output.

## Where to look for what

- Data schema, hero-pattern mechanics, why the numbers are what they are →
  [`data-generator/README.md`](data-generator/README.md)
- Original product/data spec → [`data-generator/mock_data_spec.md`](data-generator/mock_data_spec.md)
- What ships to the app, and its exact shape → `public/data/*.json` directly
