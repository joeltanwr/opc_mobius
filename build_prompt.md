# Build prompt — OCBC hackathon demo (merchant-facing dashboard)

You are building a **demo for a 6-minute hackathon pitch**, not a SaaS product and not a
marketing site. Every screen exists to be shown on a projector for 30–60 seconds and to
survive a banker's follow-up question. Optimise for legibility at 3 metres and for
defensibility under questioning, not for feature count.

Read this whole file before writing code. The constraints in §2 are the argument; if a
design choice conflicts with them, the constraint wins.

---

## 1. The one-sentence thesis

A merchant can only see the customers who already walk in. OCBC, as a card **issuer**,
can also see where those customers spend when they *don't* walk in — including at
merchants OCBC does not acquire. The product turns that asymmetry into a named, reachable
demand gap and hands it to the merchant.

The demo must make a judge feel this asymmetry in the first 20 seconds. If a screen shows
something a merchant's own POS could already tell them, that screen is not earning its
place in the pitch.

Corollary — **do not lead with time-of-day heatmaps, peak/off-peak charts, or basket-size
trends.** They are commodity POS features. They appear only as *context* beside the
demand gap, never as the headline.

---

## 2. Non-negotiable constraints

### 2.1 Privacy is visible in the UI, not just in policy

The merchant sees:

- **Its own transactions** — richly. Line items, times, tickets, repeat rates. This is the
  merchant's own data.
- **Everyone else's cardholders** — only as **counts with labels**. "1,840 cardholders who
  visit a similar café within 400m at least twice a week and have never visited you."

Hard rules, enforced in code and *shown* in the interface:

- Minimum segment size **250**. Segments below the floor render as a visibly **suppressed**
  card ("Segment too small to display — minimum 250 cardholders"). Include at least one
  suppressed segment in the demo data on purpose. It is a feature, and judges notice it.
- **No free-form filtering.** The merchant picks from pre-computed segments. There is no
  query builder, no "add filter" button. Free-form filtering is a re-identification vector
  and its absence is deliberate.
- **No export.** No CSV, no download, no print view of segment data.
- **No demographics of other people's cardholders.** No age breakdown, no gender donut, no
  nationality, no card-product mix. If a chart would show the composition of cardholders
  the merchant has never served, do not build it.
- **OCBC delivers all offers.** The merchant never receives a cardholder identity, contact
  detail, or targetable list. The merchant approves an offer; OCBC sends it.
- Individual-level records stay in the build layer. Only aggregates are serialised into
  the JSON that ships to the browser. Do not put a cardholder-level table in the bundle,
  even unused.

Put a persistent, quiet privacy affordance in the merchant chrome — a small line stating
what the merchant can and cannot see, linked to a short explainer panel. Quiet, not a
banner. It should look like a bank built it.

### 2.2 Determinism vs LLM

LLM calls scale with **the number of decisions a human sees**, never with rows of data.

Deterministic and auditable (plain code, no model in the path):
- segment matching and lift computation
- incrementality estimation and control-group construction
- funding-split arithmetic
- anomaly and demand-gap detection thresholds

LLM-generated (and in this demo, **pre-computed and baked into JSON**):
- merchant entity resolution
- segment naming
- demand-gap explanation prose
- offer copy
- fairness summary
- the merchant-facing report

Every LLM-generated string in the UI must be visibly attributable to the deterministic
number that produced it. A generated sentence with no number under it is decoration.

State the cost honestly if a cost line appears anywhere: under ~S$1,000/year at pilot
scale, because the model runs per-decision, not per-transaction.

### 2.3 Human in the loop

There is **no one-click launch**. Do not build one.

- Per-campaign gate: a human reviews segment + offer + cost share before anything goes out.
  Tiered — small reach auto-approves, above a threshold it forces review.
- Portfolio-level frequency cap, enforced at the send layer, independent of any single
  approval. Surface it as an OCBC-side control, not a merchant-side one: no individual
  reviewer can see the other campaigns targeting the same cardholder that week.
- Consent filtering happens *before* segmentation, not as part of review.

The merchant journey **ends at a "Discuss with your OCBC relationship manager" button.**
Reward operational structuring is deliberately out of scope. Frame the handoff as the
output — a qualified SME lead with a quantified demand gap attached — not as a gap in the
prototype. The button should feel like the destination, not a dead end: show what the RM
will receive.

### 2.4 Numbers

There is exactly **one constants file** (`src/data/constants.js`) holding every headline
figure, each with a `basis` string stating where it came from. No number is typed into a
component. If a figure has no basis, it does not appear in the UI.

Known contradictions in the source write-up — resolve to the base case and do not mix:
- cardholder base: **800,000** (not ">1M")
- engagement assumption: **15%** base case (the 25% figure is an aspiration, not a base case
  — if it appears at all, label it as the upside scenario)
- pilot length: pick **one** and use it everywhere (12–16 weeks controlled pilot is the
  defensible one; the 26-day figure describes the hackathon-period survey, not the pilot)

**No fabricated traction.** No invented testimonials, no named executives of fictional
companies, no "S$12.4M generated", no "450+ merchants onboarded", no logo wall. The
prototype runs on mock data and says so. Where a projection is shown, show the assumption
and a confidence level beside it — this maps directly to Appendix A of the pitch template
and a range with a basis beats a precise number without one.

Every screen carries a small, permanent **"Mock data"** marker. Do not hide it.

---

## 3. Data

Use the existing generator spec (`mock_data_spec.md`). Summary of what matters for the UI:

- Seeded Python generator. 5,000 cardholders, 200 merchants, 20 flat categories at ~10
  merchants each, 12 months, ~300k transactions. ~5 MB working file, ~250 KB shipped.
- **Transactions are sampled from latent cardholder personas, never uniformly at random.**
  Uniform sampling makes lift return noise and the entire demo collapses.
- Merchant names are plausible Singapore businesses. No real brands.

Four planted hero patterns, each of which a screen must be able to find:
1. **off-peak gap** — the primary demo path
2. **cold start** — merchant with too little history for its own analytics
3. **seasonal trough**
4. **non-acquired prospect** — drives preview mode

Six hand-authored showcase cardholders, generic names, each with a `signature_pattern`
that **must be literally true of the generated rows**:

| | pattern | role in the pitch |
|---|---|---|
| Alvin | 127 visits, 127 flat whites | the converting-customer fingerprint |
| Bernice | identical coffee 200m away, 4×/week, **zero** visits to target | the lookalike target — H1 hero |
| Charles | avg ticket S$180, never used a voucher | the **exclusion** case — he'd have bought anyway |
| Denise | nothing for 41 days, then S$430 in an afternoon | seasonal apparel buyer |
| Edwin | 142 transactions, avg S$9 | cold start |
| Farah | 9 card transactions in 12 months, all at one clinic | dormant card — the honest limit |

Alvin, Bernice and Charles on screen together carry the demo: *this is who converts, here
is someone identical who has never walked in, and here is who we deliberately exclude.*
Each bio must read standalone. These are illustrative composites over mock data — label
them as such, never as customers.

---

## 4. Screens, in build order

Build in this order. Each stage should be demoable before starting the next.

**1 — Merchant's own view.** What the merchant already knows: its own transactions, repeat
rate, ticket distribution, trading pattern. Deliberately unremarkable. This screen exists
to establish the baseline that the next screen breaks. Keep it short.

**2 — Demand gap.** The turn. Same merchant, now with issuing-side context: the merchant
sees roughly a quarter of its addressable cardholders; here is the rest. Name the gap
(off-peak Tuesday–Thursday afternoons), size it in cardholders and estimated spend, and
show the lift computation behind it. Show *why* these cardholders were identified — high
affinity to a comparable merchant nearby, zero visits here — as counts, never as people.

**3 — Opportunity panel.** Ranked demand gaps with expected value, the deterministic
scoring visible on hover or expand. Sorted by expected incremental value, not by size.

**4 — Reward recommendation + RM handoff.** Four reward mechanics (percentage cashback,
fixed-dollar cashback, return voucher, bundle), ranked with the reasoning attached.
Funding split shown as arithmetic, not as a slider that implies negotiation happens here.
Incrementality is explicit: show the estimated incremental portion *and the excluded
portion* — Charles is in the excluded bucket and the UI says why. Ends at the RM button.

**5 — Campaign results.** Test vs control, not before vs after. The control group is the
point; make it visible in the chart. Show reward cost against incremental margin, and show
at least one result that is *not* flattering — a campaign where incremental value did not
clear reward cost. A dashboard that only reports wins is not a measurement system, and a
judge will say so.

**6 — Preview mode (cold start / prospect).** For a merchant OCBC does **not** acquire:
category-and-district benchmarks only, no merchant-specific transaction view, with the
locked panels visibly locked. This doubles as the acquisition path and the cold-start
answer. It is the screen that proves the flywheel starts from a standing stop.

**7 — Landing page. Last, if there is time, and thin.** One screen: what it is, who it's
for, one CTA into the dashboard demo. No pricing, no FAQ, no testimonials, no free-trial
copy, no ROI calculator on the landing page. If time runs out, cut this entirely — the
pitch deck is the landing page.

**Optional, only if 1–6 are finished:** a single consumer-side screen showing the offer as
the cardholder receives it in the OCBC app feed. One screen, not a flow. It closes the
two-sided story visually in about eight seconds of pitch time.

---

## 5. Design system

Use the tokens below. Where this section is silent, follow the project design skill.

**Colour**
- OCBC Red `#ED1C24`; hover `#D0121A`; active `#A60E14`
- Navy charcoal `#1E293B`
- Canvas `#F8FAFC`; card `#FFFFFF`; border `#E2E8F0`
- Text primary `#0F172A`; secondary `#64748B`; light `#94A3B8`
- Success `#10B981` (bg `#ECFDF5`); warning `#F59E0B` (bg `#FEF3C7`); info `#2563EB`
  (bg `#EFF6FF`); analytics neutral `#6366F1`

Red is for primary action and brand only. Do **not** use red to mean "good" in charts —
in a bank interface red carries a loss connotation. Growth series use emerald; baseline
and control series use slate `#94A3B8`, dashed.

**Type** — Open Sans / Helvetica Neue / Arial; tabular numerals (Inter or system-ui
variant) for all financial figures. Display 36–44px bold; H1 28–32px; H2 20–24px; H3
16–18px; body 14–15px; caption 12–13px. On a projector, nothing meaningful below 14px.

**Layout** — 8px scale, 1280px max container, 48–64px section padding. Cards: white,
1px `#E2E8F0`, radius 12px, shadow `0 1px 3px rgba(0,0,0,.05)`. Hover lift `translateY(-2px)`.

**Buttons** — primary red/white 600-weight radius 8px; secondary white with `#CBD5E1`
border; ghost/tab transparent with red active indicator.

**Icons** — Lucide.

Restraint reads as financial-grade. No gradients, no glassmorphism, no animated counters,
no confetti on campaign success. One accent colour doing one job.

---

## 6. Technical

- **Static site.** No backend. All LLM outputs pre-computed and baked into JSON so the
  live demo cannot fail on a conference wifi connection or a rate limit.
- Exactly **one** optional button that fires a real API call live, clearly marked, with a
  pre-computed fallback that renders if the call fails or times out in 3 seconds. This is
  the "it's really doing it" moment; everything else is deterministic playback.
- If that live button is kept, deploy to **Vercel or Netlify** (needs a server-side route
  to hold the API key). GitHub Pages is fine only if the live button is dropped. Never put
  an API key in client-side code.
- React. Recharts for charts. No `localStorage` or `sessionStorage`.
- Keyboard-navigable between the six demo screens — during a pitch you cannot fumble a
  mouse. Bind left/right arrows or number keys to screen order.
- Deep-link each screen by URL so a specific screen can be opened cold in Q&A.

---

## 7. Explicitly out of scope

Do not build these; they are expansion paths named in the appendix, not prototype scope:
overseas/FX offers, Great Eastern data, multi-market rollout, reward operational
structuring and settlement, merchant billing, pricing tiers, real authentication.

If a screen would need one of these to make sense, the screen is wrong.

---

## 8. Self-check before finishing

- Does screen 2 show something a merchant's POS could not? If not, the pitch has no moat.
- Is there any chart showing demographics of cardholders the merchant has never served?
- Is there a suppressed segment visible somewhere?
- Is Charles's exclusion on screen with a reason attached?
- Does the results screen show a control group and at least one unflattering outcome?
- Does every headline number trace to `constants.js` with a stated basis?
- Is "Mock data" visible on every screen?
- Can the whole thing be driven in six minutes without a mouse?
