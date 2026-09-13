# Build prompt — Mobius, OCBC relationship manager view

The second of three interfaces. The merchant view (`build_prompt_merchant_view.md`) and the
retail customer view are separate builds sharing one state contract (§9). Read the merchant
prompt first: §2 of that document — privacy, determinism, human-in-the-loop, funding — governs
this build too and is not restated here except where the RM view changes it.

This is a **demo for a 6-minute hackathon pitch**. Optimise for legibility at 3 metres and for
defensibility under questioning.

---

## 1. Who this is for

An OCBC relationship manager covering a portfolio of Emerging Business and Middle Market
merchants. They are not a campaign operator and not a data analyst. Their day is relationship
work: a merchant applies, the RM reads what Mobius has found, calls the owner, configures a
programme with them on the phone, and watches it run.

The RM is also **the control point for the whole system**. Per-campaign approval sits here,
and so does the portfolio-level view that no individual merchant can see: how many cardholders
are being contacted this week, across how many concurrent campaigns. Build that in. A reviewer
approving campaigns one at a time cannot see the other campaigns targeting the same cardholder,
and the portfolio panel is the answer to that.

**This is not a merchant screen with more buttons.** The merchant sees one business; the RM
sees a caseload and a shared exposure budget.

---

## 2. What changes from the merchant view

- **Segment authorship is unchanged.** The RM cannot author or widen a segment either. The
  RM selects among the pools Mobius proposed and narrows within them. §7.1 of the merchant
  prompt (250 floor, reach rounded to the nearest 50, refusals that do not report their
  count, no narrowing on protected characteristics) applies in full to every reach control on
  the configuration page — including the reach slider, which is narrowing by another name.
- **One reward per campaign.** This supersedes §7.2 of the merchant prompt, which allowed
  several. Drop the stacking logic; it existed to handle the multi-reward case.
- **Push is granted here.** The merchant requests it; the RM decides. Subject to the relevance
  threshold and the global per-cardholder frequency cap.
- **Funding is unchanged.** The merchant bears the reward cost in full. The RM never sets a
  split, because there isn't one. Every cost figure the RM sees is the merchant's cost, and
  the RM's job is to make sure the merchant knows its ceiling before going live.

**Settled.** Six reward types everywhere: discount, cashback, voucher, spend-and-save,
bundle / 1-for-1, overseas/FX-linked (ranked and disabled). Points is not a type.

---

## 3. Screen 1 — Portfolio dashboard

The RM's landing screen. Three things on it, in this order.

### 3.1 Caseload summary

Four figures: merchants in portfolio, applications awaiting contact, campaigns live,
campaigns finished this quarter. Keep it to a strip; this is orientation, not analysis.

### 3.2 Portfolio exposure

The panel that exists nowhere else in the system. Show:
- Cardholders contacted this week, against the weekly ceiling
- Share of the consented base reached
- How many cardholders are currently eligible for two or more concurrent campaigns —
  **concentration is the risk the per-campaign gate cannot see**
- A **throttle** and a **kill switch**, with the kill switch styled as a deliberate,
  hard-to-hit control rather than a red button sitting next to routine actions

State the cap numerically and state that the number is provisional until it has a basis. A
round number presented as a policy is worse than a round number presented as a placeholder.

### 3.3 Programme lists, by status

**Pending** — applications from merchants awaiting RM contact. **No statistics**: nothing has
run, so there is nothing to report, and showing empty metric cards teaches the RM to ignore
metric cards. Show merchant, sector, when they applied, how long they have been waiting, the
Mobius-recommended reward, and the eligibility result. Age the row visually once it passes a
few days — the RM's failure mode is a queue that quietly grows.

**Ongoing** — live campaigns with running statistics: reach, redemptions, incremental sales,
merchant's reward cost to date, days remaining. Each row opens a detail view (§6) and carries
a **manual push trigger** (§3.4).

**Completed** — finished campaigns with final results including net contribution, signed. At
least one must have lost money.

### 3.4 Manual push trigger

A demo control, and it must look like one — labelled as a demonstration trigger, visually
distinct from production actions, never a bare "Send" next to routine buttons.

Behaviour: opens a confirmation showing **exactly what will be sent, to how many cardholders,
and the frequency-cap status** — how many of those recipients have already had an offer this
week, and how many will be suppressed as a result. Confirming fires the push into the retail
customer view's Rewards page.

The suppression count is the thing worth showing. It is the frequency cap doing visible work
in front of a judge, in the one moment the system is doing something rather than displaying
something.

---

## 4. Screen 2 — Pending programme

Opened from a pending row. This is the RM's brief before they pick up the phone, so it is a
reading screen, not a working one. Everything here is read-only except the single action at
the end.

Order matters — it is the order the RM will talk through it with the owner:

1. **The business.** Name, sector, outlet count, years with OCBC, products held, the owner's
   name and role, the last contact. Ordinary relationship context, and the RM needs it at the
   top because that is the conversation they are about to have.
2. **Eligibility.** The SME gate: average balance above S$30,000, and internal *or* external
   transaction score at band 3 or better. Show which of the two scores cleared and both values.
   A merchant that fails shows a not-eligible state and no recommendation at all — build that
   state, because the gate is only credible if it can be seen to bite.
3. **Transaction background.** A condensed version of the merchant's own profile: volume trend,
   ticket size, repeat rate, hourly pattern with the trough named. Enough for the RM to speak
   to it, not the full merchant page.
4. **`/sme-business-customer-analysis` output.** Customer profile, top-20% behaviour, demand
   gap, RFM segmentation with counts. Attributed to the skill by name.
5. **`/reward-programme-recommendation` output.** All types ranked with target segment and
   reasoning, rejected ones shown with the reason rather than filtered out.
6. **Start configuring** — the only action. Label it so it reads as something done *with* the
   owner, not to them. Note beside it that configuration is a joint conversation.

Where transaction history is too thin for a full analysis, the skill's gated output applies:
demand-gap detection only, no customer profile. Show the gate rather than a half-confident
profile, and say what would lift it.

---

## 5. Screen 3 — Reward configuration

Two columns: the form on the left, a **live customer preview** on the right, sticky. The
preview updates as fields change. Everything is prefilled from
`/reward-programme-recommendation` and everything except the segment definition is editable.

Mark prefilled fields visibly and offer **Reset to the Mobius draft** per section. An RM who
cannot tell what they changed cannot explain the result afterwards.

### 5.1 Target customer group

- Select among the RFM segments the analysis produced — Champions, Loyal, New/Promising, Needs
  attention, At Risk, Hibernating — each with a rounded count.
- Plus **Non-customers**: cardholders with no prior transaction at this merchant, drawn from
  the lookalike pool. Selecting this is choosing a proposed pool, not authoring one.
- Live combined reach, rounded to the nearest 50, updating as selections change.
- Refuse and explain when a selection falls below the 250 floor, without reporting its count.

### 5.2 Location

Outlet multi-select with per-outlet reach. Outlets that do not clear the floor alone show as
unavailable with a prompt to group, never as a small number.

### 5.3 Timing

Days of week and hours, prefilled to the detected trough. When the window is moved onto the
peak, warn with the number attached: peak hours are already full, so the reward mostly
discounts trade the merchant was going to take anyway. Recompute expected incremental value
live as the window moves, so the cost of leaving the trough is visible while choosing.

### 5.4 Reward

**One type only.** Selecting a type reveals its own configuration:

| Type | Configures |
|---|---|
| Discount | percentage off, minimum spend, exclusions |
| Cashback | percentage back, cap per transaction |
| Voucher | absolute amount off, minimum spend, validity window |
| Spend-and-save | save S$X on S$Y across the period |
| Bundle / 1-for-1 | which item, quantity rule |
| Overseas / FX | out of scope for this build — show ranked and disabled |

Then the redemption limit: **available to the first N customers**, on or off, with N editable.

Show **maximum cost to the merchant** — N × maximum reward value — as a hard, unmissable
number that recomputes as the reward is configured. With the merchant funding the whole
reward, this is the figure the RM is accountable for having made clear.

### 5.5 Reach cap

Separate from the segment and separate from the redemption limit, and the interface must say
so — three different numbers that all sound like limits, and they will be confused.

- **Segment** is who qualifies.
- **Reach cap** is how many of them get contacted, for when the merchant's budget will not
  stretch to the full recommendation.
- **Redemption limit** is how many can actually claim it.

A slider or numeric input over the selected segment, rounded to 50, floor enforced. State the
selection rule when the cap bites — highest propensity first, not random, not alphabetical —
because the RM will be asked which customers got left out.

### 5.6 Frequency, dates

- **Redemption frequency per customer** — once per campaign, once a week, once a day.
- **Promotion frequency** — how often the offer resurfaces in the customer's feed, bounded by
  the global cap.
  *These two are both called "frequency" in the source spec and mean different things. Label
  them distinctly or they will be confused in the demo.*
- Start date and expiry date, with duration derived and shown. Warn when the window is too
  short to accumulate a measurable result against a control group.

### 5.7 Terms and message

- Free-text terms and exclusions, with the common ones as insertable presets.
- **Notification message**: headline and body as the cardholder will see them, with a
  character budget shown. Prefilled; editable.
- **Channel**: in-app offer feed always. Push is a checkbox the **RM grants**, with the
  frequency cap stated beside it and the merchant's request shown as context.

### 5.8 Preview

A phone-shaped render of the reward exactly as the customer view will show it — company,
sector, reward type, offer line, redemption window, expiry with days remaining, status tags.
Use the same card structure as the customer view mockup so the two cannot drift.

Preview both surfaces: the feed card and the push notification. They are different artefacts
and the push copy is the one that gets written carelessly.

### 5.9 Going live

**Set campaign live** — final confirmation summarising segment and reach, reward and its
configuration, window, outlets, channel, limit, maximum cost to merchant, and dates. On
confirming, the campaign moves to Ongoing and becomes visible on the merchant's dashboard.

Every field the RM changed from the Mobius draft is recorded, attributed and timestamped. This
record is the reason a result can be explained six months later.

---

## 6. Screen 4 — Ongoing and completed programme detail

Opened from an ongoing or completed row. The merchant-facing drill-down (§8 of the merchant
prompt) plus the context only the RM has:

- **Company information and transaction background** at the top, as in §4.
- **Campaign statistics** as the merchant sees them — reach, redemptions, redeemer profile
  (aggregate, 250 floor, suppressed band visible), repeat purchases against control,
  incremental sales, reward cost, net contribution.
- **The configuration as set**, with RM edits away from the Mobius draft flagged inline. When
  a campaign underperforms, this is where the explanation lives.
- **A written verdict**, including on the losing campaign. Redemption rate measures popularity,
  not incremental trade, and the RM needs that distinction in language they can repeat to a
  merchant who is pleased with a high redemption rate.

---

## 7. Design system

Inherits §10 of the merchant prompt in full. Additions for this build:

- Give the RM view a quiet **internal marker** — a slate chrome bar or a persistent "OCBC
  internal" label — so a judge can tell at a glance which side of the platform they are
  looking at. Do not restyle the whole interface; one consistent signal.
- Status colours: pending amber, live emerald, completed slate, kill-switch and throttle in
  red and nothing else in red except primary actions.
- Demo controls (the manual push trigger) get a visually distinct treatment — dashed border or
  an explicit demo label — so they are never mistaken for production actions.
- Long numbers in tabular figures; the RM view has more tables than the merchant view and
  misaligned digits are the fastest way to look unfinished.

---

## 8. Out of scope

Overseas and FX offers, Great Eastern data, multi-market rollout, settlement and billing,
merchant onboarding paperwork, real authentication, RM performance management.

---

## 9. State contract

Shared with the merchant and customer views; define it once.

- Merchant applies → `applied`, appears in RM pending list, no statistics anywhere.
- RM opens and starts configuring → `draft`, visible to the merchant as in setup.
- RM sets live → `active`, appears under Ongoing for both RM and merchant.
- RM fires the manual push → notification appears in the customer view's Rewards page;
  suppressed recipients are logged and counted, not silently dropped.
- Customer redeems → merchant dashboard and RM detail both update; customer profile weights
  update to improve future relevance.
- Redemption limit or reach cap reached → `capped`, offer closes in the customer feed.
- Campaign ends or merchant stops it → `completed`, results frozen.

Propagation must be live. Redemptions appearing on two screens without a reload *is* the
flywheel; if the demo has to be refreshed, the pitch loses its best thirty seconds.

---

## 10. Self-check

- Can the RM see something on the portfolio panel that no merchant can see?
- Does the pending list show no statistics at all?
- Does the push confirmation show the suppression count?
- Does the eligibility gate have a visible failing state?
- Are segment, reach cap and redemption limit distinguishable by a reader who did not build it?
- Does maximum cost to the merchant recompute as the reward changes?
- Does the preview match the customer view card exactly?
- Are RM edits away from the Mobius draft visible on the results screen?
- Is the manual trigger unmistakably a demo control?
- Can all four screens be driven by keyboard in under two minutes?
