# Build prompt — Mobius, retail customer view

The third of three interfaces. The merchant view (`build_prompt_merchant_view.md`) and the RM
view (`build_prompt_rm_view.md`) are separate builds sharing one state contract (§10). Read
§2 of the merchant prompt first — privacy, determinism, human-in-the-loop — it governs this
build too.

This is a **demo for a 6-minute hackathon pitch**. It is also the only screen in the system a
member of the public would ever see, so it carries a burden the other two do not: everything
the bank does with card data has to look, to the person whose data it is, like something done
for them rather than to them.

---

## 1. Who this is for

An OCBC cardholder opening the app. Not a user of a rewards platform — someone checking their
banking who encounters an offer. They did not ask for this, they did not sign up for Mobius,
and they will judge the whole idea in about four seconds.

Three jobs, in order of how often they happen:
1. Notice an offer that is actually relevant and act on it.
2. Browse what else they have, and find the one they were thinking of.
3. Understand why they are being shown this, and change it if they want to.

The third is the smallest in usage and the largest in the pitch. It is the answer to the
question a judge will ask about consent, and it is better answered by a screen than by a
paragraph.

---

## 2. Constraints carried from the rest of the system

- **The merchant never learns who redeemed.** It sees that a redemption happened and gets
  aggregate profiles afterwards. Say this in the interface, once, where it is relevant —
  the detail view of a reward is the natural place. One quiet line, not a banner.
- **Consent precedes everything.** Only cardholders who turned offers on are in any segment.
  The customer view should show *that they turned it on* and let them turn it off, in one
  place, without hunting.
- **The global frequency cap applies here and is felt here.** No more than two pushes a week
  across all merchants. Suppressed offers still land in the feed; the feed is uncapped
  because it is low-intrusion and the push is not. Build that asymmetry: every approved offer
  appears in the feed, push is the exception.
- **No demographic targeting the customer would find creepy on inspection.** If a customer
  asking "why am I seeing this?" would get an uncomfortable answer, the targeting was wrong
  upstream. The explanation string is a design constraint on the segmentation, not a caption.

**Settled.** Six reward types everywhere: discount, cashback, voucher, spend-and-save,
bundle / 1-for-1, overseas/FX-linked. The reward-type filter chips are the first five;
overseas/FX never reaches a feed in this build. Points is not a type and is not a chip.

---

## 3. Screen 1 — Banking home

The offer arrives in the middle of ordinary banking, which is the point. Do not build a
rewards app home screen.

- **Flat illustrated header** in slate, with an OCBC logo treatment and a greeting. Flat and
  restrained — no gradients, no photography.
- **Push notification card**, the most prominent thing below the header: *"Looking for a
  mid-day boost? Check out vouchers from your nearby coffee shop, Soujourner."* Two actions —
  view the offer, or dismiss. Dismissing should say the offer is still in Rewards, not
  disappear silently; a customer who dismisses a notification has not declined the offer.
- **Quick actions**: Scan & Pay, PayNow, Wealth Insights, Rewards, More, Support. Rewards
  carries a count badge. Everything else raises a toast saying it is outside the prototype —
  honest, and it stops a judge tapping into a dead end.
- **Secure login card** with a log-in button. Mock only: never build a password field that
  submits anything, and say on the card that no credential is collected. Rewards are viewable
  without logging in; balances are not.

Three routes into Rewards — the notification, the quick action, the bottom nav — because in
the demo whichever one the presenter reaches for must work.

---

## 4. Screen 2 — Rewards

### 4.1 The list

Each reward card shows: company, business nature, reward type, the offer itself, permitted
redemption window, expiry date with days remaining, availability or expiry status, and View
details / Redeem actions.

The newly pushed reward sorts first under the default *Most recent* and is visually
distinguished — a warmer border, not a badge shouting NEW.

**Include at least one expired reward**, with Redeem disabled and the status shown. A status
that never has a negative case is decorative. Include one reward redeemable right now and one
that is not, so the *Available now* sort and filter have something to do.

### 4.2 Why these offers

Above the list, one short passage: these came from the customer's own card activity, they
turned offers on, and the business does not receive their name or details. Link it to the
preferences screen (§5).

This is three lines of copy carrying most of the system's defensibility with the public. Write
it carefully and do not let it become a cookie banner.

### 4.3 Filters

Multi-select within a group, AND across groups:
- **Business nature** — F&B, Hospitality, Travel
- **Reward type** — see the taxonomy conflict in §2
- **Time to redeem** — Now, Weekdays, Weekends, Anytime
- **Time to expiry** — within 7 days, within 30 days, more than 30 days

With: active-filter count on the trigger, matching-result count in a live region, an empty
state that offers a way out rather than just reporting nothing, clear-all, and Escape to
close the panel with focus returning to the trigger.

*Now* is computed against a fixed demo clock — Friday 11 September 2026, 3:12pm. State the
clock in the build; several behaviours depend on it and a different demo time silently breaks
the *Available now* logic.

### 4.4 Sorting

Most recent, Expiring soon, Available to redeem now, Company A–Z. Expired items sort last
under every order.

---

## 5. Screen 3 — Spending profile and preferences

From the original programme overview and missing from the customer spec: the cardholder can
see their own spending profile and adjust what they want to be shown.

Build it. It is the consent surface, it is what "customer profile weights update" in the state
contract actually means, and it converts the system's central privacy claim from an assertion
into something a judge can click.

- **Their own profile**, in plain language: the categories they spend in, roughly when, and
  the areas Mobius currently thinks are relevant. Their own data, shown back to them — the one
  place in the system where individual-level detail is appropriate, because it is theirs.
- **Interest controls**: which categories of deal they want more or less of. Changes take
  effect on the Rewards list immediately, or the control is theatre.
- **Notification settings**: offers on or off, and push on or off separately. State the cap —
  never more than two a week — as a commitment rather than a setting they have to discover.
- **Location relevance**: whether offers should be tied to where they usually are. On by
  default with a clear explanation, or off by default with a reason to turn it on; pick one
  deliberately and be able to defend it.
- **Turning offers off entirely** must be available here and must actually empty the feed in
  the demo. A consent control that cannot be exercised is worse than none.

---

## 6. Redemption

The spec treats Redeem as a button. It is the event the whole system is built around, so give
it a screen.

- Tapping Redeem produces something usable at the counter — a code or a scannable artefact —
  with the terms, the merchant, and the window visible above it.
- It states, quietly, that the merchant sees a redemption rather than a person.
- It fires the redemption event. That event updates the merchant dashboard, the RM campaign
  detail, and this customer's own profile weights, live, without a reload.

That live propagation is the flywheel. In the pitch it is roughly thirty seconds — push
arrives, customer redeems, two other screens move — and it is the only moment where the system
does something instead of displaying something. Everything else in this build serves it.

---

## 7. Receiving the push

The RM view has a manual trigger that fires a push into this interface. It must:
- arrive without a reload,
- respect the frequency cap, so a customer already at two offers this week receives the feed
  card and no push,
- land in the feed identically either way.

Support being triggered while this view is open on a second screen. In the pitch the two views
are shown side by side, and a push that requires a refresh to appear kills the effect.

---

## 8. Data

Synthetic records only. **Superseded:** the customer view is part of the app, reads
`public/data/` like the other two views, and uses the shared state module. The record shape
below is the reward-card contract, not a standalone data file.

```js
{
  id, company, title, description,
  nature: "F&B" | "Hospitality" | "Travel",
  type,                    // see §2 taxonomy conflict
  redeem: String[],        // e.g. ["Now","Weekdays"]
  redeemText, expiryDays, expiryText,
  recent: Boolean, icon
}
```

Twelve or so records spread across the filter dimensions so that every chip has a non-empty
result and at least one combination is genuinely empty. Company names must be plausible
Singapore businesses and must match the ones used in the merchant and RM views — a judge
comparing screens should see the same campaign.

The pushed Soujourner Coffee reward should be **the same campaign the merchant configured**:
weekday afternoons, the trough window. Three screens showing one campaign from three sides is
the demo; three screens showing three unrelated offers is three demos.

---

## 9. Design system

Inherits the shared palette: OCBC Red `#ED1C24`, Dark Slate `#1E293B`, Canvas `#F8FAFC`, Card
`#FFFFFF`, Border `#E2E8F0`, Success `#10B981`, Warning `#F59E0B`, baseline `#94A3B8` dashed.
No gradients, no glassmorphism, flat financial aesthetic, tabular numerals on dates and
counts, 8–24px spacing rhythm, clear borders and restrained shadows.

**Responsive.** Mobile: single column, sticky rewards controls, bottom navigation. Desktop: a
wider app frame, two-column home, two-column rewards grid, recent reward spanning full width.
Below ~520px the outer device frame comes off entirely to reclaim the space.

**Prototype chrome** — a sticky bar outside the device frame for switching screens — stays
visually separate from the app itself so nobody mistakes it for product.

**Patterns**: `SectionHeader`, `QuickAction`, `RewardCard`, `FilterChip`, `FilterGroup`,
`BottomNav`, `Toast`. `RewardCard` must match the preview rendered in the RM configuration
page exactly; if they drift, the RM's preview is lying.

**Accessibility**: semantic sections and headings, real buttons rather than clickable divs,
labels on icon-only controls, visible focus, fieldset and legend on filter groups, live regions
for result counts and toasts, Escape closing the filter panel with focus restored, reduced
motion respected.

---

## 10. State contract

- RM fires push → notification appears here without a reload; cardholders over the weekly cap
  get the feed card only.
- Customer redeems → merchant dashboard statistics, RM campaign detail, and this customer's
  profile weights all update live.
- Redemption limit or reach cap reached → offer closes in the feed and shows why.
- Campaign ends or merchant stops it → offers already delivered stay valid until expiry.
  Never revoke a reward a customer is holding; say when it expires instead.
- Customer turns offers off → they leave every future segment, and the feed empties.

---

## 11. Out of scope

Balances, transfers, statements, card management, real authentication, overseas and FX offers,
anything on the home screen other than the offer and the quick actions.

---

## 12. Self-check

- Does the offer arrive inside ordinary banking rather than inside a rewards app?
- Do all three routes into Rewards work?
- Is there an expired reward with Redeem disabled?
- Does "why am I seeing this" have an answer a stranger would find reasonable?
- Can offers actually be turned off, and does the feed empty when they are?
- Does changing an interest change the list immediately?
- Does redemption update two other screens without a reload?
- Does a push arriving while this view is open land without a refresh?
- Does the reward card match the RM configuration preview exactly?
- Is the Soujourner offer the same campaign the merchant view configured?
