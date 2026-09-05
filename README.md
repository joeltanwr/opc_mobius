# opc_mobius

An SME-facing merchant dashboard demo built on OCBC card data, for a 6-minute
hackathon pitch. The thesis: card issuing data reveals where OCBC cardholders
spend at merchants OCBC does *not* acquire — that asymmetry is the product. A
merchant logs in and sees a recommendation like *"547 cardholders who
regularly visit a comparable café have never transacted with you,"* backed by
a real lift computation, not a mailing list.

Build brief: `build_prompt.md` (interface/UX/privacy constraints). Data spec:
[`data-generator/mock_data_spec.md`](data-generator/mock_data_spec.md).

## Repo layout

```
opc_mobius/
├── src/                # the dashboard interface (React + Vite)
├── public/data/        # shipped data — the interface reads only from here
├── data-generator/      # produces public/data/*.json (and local-only raw parquet)
├── index.html, vite.config.js, tailwind.config.js, package.json
```

**`src/`** is the interface — a static React site, no backend. It fetches
every number it shows from `public/data/*.json` at runtime and holds every
hardcoded business assumption (cardholder base, engagement rate, pilot
length, privacy floor, approval thresholds) in the single
[`src/data/constants.js`](src/data/constants.js), each with a `basis` string.
Run it:

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # static output in dist/, deployable anywhere (no backend)
```

Screens (keyboard-navigable — ← → or 1–7, deep-linked by URL):

| # | Route | What it shows |
|---|---|---|
| — | `/` | Landing — one CTA into the demo |
| 1 | `/merchant-view` | The merchant's own POS-level view (deliberately unremarkable) |
| 2 | `/demand-gap` | The turn: a named, sized, reachable demand gap via lift, plus the Alvin/Bernice/Charles trio |
| 3 | `/opportunity` | Every reachable gap for this merchant, ranked by expected value — includes a suppressed segment |
| 4 | `/reward-rm` | Reward mechanic, incrementality (Charles's exclusion made explicit), funding split, human-review gate, RM handoff |
| 5 | `/results` | Test vs. control campaign results — a win *and* an unflattering scenario, side by side |
| 6 | `/preview` | Preview mode for a non-acquired prospect and a freshly-acquired cold-start merchant |
| 7 | `/consumer` | Bonus: the offer as the cardholder receives it in the OCBC app |

**`public/data/`** is the contract between the interface and the generator.
It holds precomputed aggregates only — taxonomy, merchant profiles, detected
demand gaps, lift-based affinity/segments, district benchmarks, one
completed campaign, precomputed rationale text, a merchant name directory,
and six hand-authored showcase personas. Nothing raw ships: no individual
transaction, and no demographic breakdown of cardholders a merchant hasn't
served, ever leaves `data-generator/`. Total size is kept under 600 KB. See
[`data-generator/README.md`](data-generator/README.md) for the full
file-by-file breakdown.

**`data-generator/`** is a self-contained, seeded Python pipeline that builds
the synthetic population and plants the four hero patterns (off-peak gap,
cold start, seasonal trough, non-acquired prospect). It has no dependency on
the interface and can be re-run on its own at any time:

```bash
cd data-generator
python generate.py
python validate.py
```

## Deliberate scope cuts

- **No live API call.** The build brief allows exactly one optional
  button that fires a real request with a pre-computed fallback. It's
  skipped here so the whole thing stays a static site deployable anywhere
  (including GitHub Pages) with no server-side route or API key to manage.
- **RM handoff and campaign approval are simulated client-side state**, not
  real sends — there is no backend, by design.
- **Screen 7 (landing) and the bonus consumer screen are intentionally thin**,
  per the build brief's own priority order.

## Where to look for what

- Interface constants and their basis → [`src/data/constants.js`](src/data/constants.js)
- Data schema, hero-pattern mechanics, why the numbers are what they are →
  [`data-generator/README.md`](data-generator/README.md)
- Original product/data spec → [`data-generator/mock_data_spec.md`](data-generator/mock_data_spec.md)
- What ships to the app, and its exact shape → `public/data/*.json` directly
