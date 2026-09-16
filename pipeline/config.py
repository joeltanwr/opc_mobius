"""
pipeline/config.py — every headline figure the compute layer uses, each with a basis.

Nothing in pipeline/ or src/ may carry a number that isn't here or in
src/data/constants.js. A figure without a basis does not ship; a PROVISIONAL
figure renders with a visible tag.
"""

import os
from datetime import datetime, date

_PIPE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(_PIPE_DIR)
RAW_DIR = os.path.join(REPO_ROOT, "data-generator", "data", "raw")
DERIVED_DIR = os.path.join(REPO_ROOT, "data-generator", "data", "derived")   # raw-only intermediates, gitignored
PUB_DIR = os.path.join(REPO_ROOT, "public", "data")


class C:
    """A constant with a basis string. `provisional=True` means the value has no calibrated basis yet."""
    def __init__(self, value, basis, provisional=False):
        self.value, self.basis, self.provisional = value, basis, provisional

    def __repr__(self):
        return f"C({self.value!r}, provisional={self.provisional})"


CONSTANTS = {
    "DEMO_CLOCK": C("2026-09-11T15:12:00+08:00", "Brief §2 — one exported clock for all views and all as-of computation"),
    # The hero merchant's own application, which the RM queue must not depend on someone having
    # clicked earlier in the demo. Two days before the demo clock, matching the other applications
    # the generator plants, so the pending row ages like a real one and is still inside the week
    # the merchant was promised.
    "DEMO_APPLICATION_DATE": C("2026-09-09T11:20:00+08:00",
                               "The hero merchant's application to the programme. Stamped before the demo clock so the RM's pending queue is populated on a cold load rather than depending on the merchant screen having been walked first; the same two-day wait the generator plants for C-APP-02."),
    "PERIOD_START": C("2025-10-01", "Brief §2 — data period start"),
    "PERIOD_END": C("2026-09-30", "Brief §2 — data period end"),
    "CARDHOLDER_BASE": C(800_000, "Brief §2 — pitch-level OCBC cardholder base; the dataset is a 12,000-cardholder sample"),
    "SAMPLE_CARDHOLDERS": C(12_000, "generate.py N_CARDHOLDERS — every count in public/data/ is in sample units"),
    "ELIG_MIN_BALANCE_SGD": C(30_000, "design-decisions-log — SME gate, strictly greater than, mean closing balance over trailing 6 months"),
    "ELIG_MAX_SCORE_BAND": C(3, "design-decisions-log — internal OR external band ≤ 3 clears (lower = better, PD-band convention, unconfirmed)"),
    "ELIG_BALANCE_MONTHS": C(6, "sme-relationship-value-score §0 — balance window"),
    "GATE_MIN_OCBC_TXNS": C(100, "sme-business-customer-analysis Step 1 — below this only the demand-gap detector runs"),
    "DORMANT_TXN_PER_MONTH": C(10, "retailer-transaction-data-analysis Step 1 — fixed cutoff; the operative threshold is min(this, 10th percentile)"),
    "DORMANT_PERCENTILE": C(10, "retailer-transaction-data-analysis Step 1 — distribution cutoff"),
    "MIN_SEGMENT_SIZE": C(250, "Brief §2 — privacy floor for every cell shown to a merchant or RM"),
    "REACH_ROUNDING": C(10, "Brief §2 — reach rounded to nearest 10; the 250 floor remains the primary control against sequential differencing"),
    "NARROW_MAX_REFINEMENTS": C(5, "Merchant prompt §7.1 — narrowing cap per campaign; applied narrowings and floor refusals both count, a refusal is still a query"),
    "NARROW_PROTECTED_TERMS": C({"nationality": ["nationality", "national", "foreigner", "foreigners", "expat", "expats", "citizen", "citizens", "pr", "singaporean", "singaporeans", "malaysian", "chinese national", "indian national", "filipino", "indonesian"],
                                 "race": ["race", "ethnic", "ethnicity", "chinese", "malay", "indian", "eurasian", "caucasian", "asian"],
                                 "religion": ["religion", "religious", "muslim", "christian", "buddhist", "hindu", "catholic", "halal", "church", "mosque", "temple"],
                                 "gender": ["gender", "sex", "women", "woman", "female", "females", "men", "man", "male", "males", "ladies", "girls", "boys", "guys"],
                                 "marital status": ["married", "single", "divorced", "widowed", "marital", "spouse", "wife", "husband"],
                                 "health": ["health", "pregnant", "pregnancy", "disabled", "disability", "diabetic", "illness", "medical", "patients"]},
                                "Merchant prompt §7.1 — narrowing that amounts to a differential offer by protected characteristic is refused and explained; "
                                "age band and location stay permitted as ordinary commercial targeting"),
    "PRIORITY_TIERS": C([(70, "high"), (40, "medium"), (0, "low")], "sme-relationship-value-score Step 2"),
    "LIFT_MIN_SUPPORT": C(20, "mock_data_spec §8 lift specification"),
    "LIFT_PRICE_BAND_TOLERANCE": C(1, "Brief §5 — |cardholder pref − merchant band| ≤ 1; excludes Charles, keeps Bernice"),
    "LIFT_MIN_DAYPART_AVAILABILITY": C(0.15, "Brief §5 — daypart_availability[gap_daypart] ≥ 0.15"),
    "GAP_SLOT_RATIO": C(0.75, "Brief §5 — slot ≤ 75% of own daypart-matched mean slot volume"),
    "GAP_MIN_WEEKS": C(8, "Brief §5 — in ≥ 8 of trailing 12 weeks"),
    "GAP_HIGH_CONF_WEEKS": C(10, "Brief §5 — high confidence needs own-baseline ≥ 10/12 weeks and the peer test"),
    "GAP_TRAILING_WEEKS": C(12, "Brief §5"),
    "GAP_COLD_START_WEEKS": C(4, "Brief §5 — under 4 weeks of history → cold-start branch"),
    "GAP_MIN_SLOT_BASELINE": C(5, "A week counts toward the own-baseline test only when the daypart's mean slot volume that week is >= 5 transactions; below that a slot is too thin to call"),
    "GAP_MIN_VOLUME_12W": C(500, "Gap detection needs >= 500 transactions in the trailing 12 weeks; below that the merchant is told the data is too thin rather than shown noise"),
    "GAP_PEER_RATIO": C(0.8, "Peer test margin: own slot share must sit below 80% of the peer-median share, so ordinary weekend/weekday variation is not read as a gap"),
    "PUSH_CAP_PER_WEEK": C(2, "design-decisions-log anti-spam — not yet calibrated", provisional=True),
    "FREQ_CAP_OFFERS": C(3, "portfolio-allocator Step 3 — concurrent offers per cardholder per 30 days, placeholder", provisional=True),
    "PORTFOLIO_WEEKLY_CEIL_SHARE": C(0.0625, "RM prompt §3.2 — 50,000 cardholders contactable per week is 6.25% of the 800,000 base. "
                                            "Held as a share of the consented base, not a headcount, so the ceiling lands in whatever units the "
                                            "panel is counting; the share is still a placeholder until it has a basis", provisional=True),
    "PROFILE_WEIGHT_STEP": C(0.05, "Customer view §5 / brief §4 — how much one redemption moves a cardholder's category weight toward the "
                                   "redeemed merchant's category before renormalising; a placeholder learning rate until relevance is calibrated",
                             provisional=True),
    "ASSUMED_GROSS_MARGIN": C(0.65, "Brief §5 — café gross margin assumed for net contribution; not merchant-reported", provisional=True),
    "RETURN_WINDOW_DAYS": C(30, "Brief §5 — unprompted return measured within 30 days of last redemption"),
    "RECENT_REPEATER_DAYS": C(30, "sme-business-customer-analysis Step 2"),
    "TRAILING_MONTHS": C(6, "Merchant prompt §6 trading summary — trailing 6 months"),
    "INCREMENTAL_SHARE": C({"non_customers": 0.75, "New Customers": 0.60, "Promising": 0.60, "Potential Loyalists": 0.40,
                            "Need Attention": 0.45, "At Risk": 0.45, "Can't Lose Them": 0.45,
                            "Champions": 0.15, "Loyal Customers": 0.15, "Hibernating": 0.35, "Lost": 0.30},
                           "Expected share of redemptions that would not have happened anyway, by target pool. "
                           "Ordered by the reward skill's caution column; the acquisition figure is the winner campaign's "
                           "(16% − 4%) / 16% = 0.75; the rest are assumptions", provisional=True),
}

# Plain values for code
DEMO_CLOCK = datetime.fromisoformat(CONSTANTS["DEMO_CLOCK"].value)
DEMO_CLOCK_NAIVE = DEMO_CLOCK.replace(tzinfo=None)
DEMO_DATE = DEMO_CLOCK.date()
PERIOD_START = date.fromisoformat(CONSTANTS["PERIOD_START"].value)
PERIOD_END = date.fromisoformat(CONSTANTS["PERIOD_END"].value)
CARDHOLDER_BASE = CONSTANTS["CARDHOLDER_BASE"].value
SAMPLE_CARDHOLDERS = CONSTANTS["SAMPLE_CARDHOLDERS"].value
ELIG_MIN_BALANCE_SGD = CONSTANTS["ELIG_MIN_BALANCE_SGD"].value
ELIG_MAX_SCORE_BAND = CONSTANTS["ELIG_MAX_SCORE_BAND"].value
ELIG_BALANCE_MONTHS = CONSTANTS["ELIG_BALANCE_MONTHS"].value
GATE_MIN_OCBC_TXNS = CONSTANTS["GATE_MIN_OCBC_TXNS"].value
DORMANT_TXN_PER_MONTH = CONSTANTS["DORMANT_TXN_PER_MONTH"].value
DORMANT_PERCENTILE = CONSTANTS["DORMANT_PERCENTILE"].value
MIN_SEGMENT_SIZE = CONSTANTS["MIN_SEGMENT_SIZE"].value
REACH_ROUNDING = CONSTANTS["REACH_ROUNDING"].value
NARROW_MAX_REFINEMENTS = CONSTANTS["NARROW_MAX_REFINEMENTS"].value
NARROW_PROTECTED_TERMS = CONSTANTS["NARROW_PROTECTED_TERMS"].value
PRIORITY_TIERS = CONSTANTS["PRIORITY_TIERS"].value
LIFT_MIN_SUPPORT = CONSTANTS["LIFT_MIN_SUPPORT"].value
LIFT_PRICE_BAND_TOLERANCE = CONSTANTS["LIFT_PRICE_BAND_TOLERANCE"].value
LIFT_MIN_DAYPART_AVAILABILITY = CONSTANTS["LIFT_MIN_DAYPART_AVAILABILITY"].value
GAP_SLOT_RATIO = CONSTANTS["GAP_SLOT_RATIO"].value
GAP_MIN_WEEKS = CONSTANTS["GAP_MIN_WEEKS"].value
GAP_HIGH_CONF_WEEKS = CONSTANTS["GAP_HIGH_CONF_WEEKS"].value
GAP_TRAILING_WEEKS = CONSTANTS["GAP_TRAILING_WEEKS"].value
GAP_COLD_START_WEEKS = CONSTANTS["GAP_COLD_START_WEEKS"].value
GAP_PEER_RATIO = CONSTANTS["GAP_PEER_RATIO"].value
GAP_MIN_SLOT_BASELINE = CONSTANTS["GAP_MIN_SLOT_BASELINE"].value
GAP_MIN_VOLUME_12W = CONSTANTS["GAP_MIN_VOLUME_12W"].value
PUSH_CAP_PER_WEEK = CONSTANTS["PUSH_CAP_PER_WEEK"].value
FREQ_CAP_OFFERS = CONSTANTS["FREQ_CAP_OFFERS"].value
PORTFOLIO_WEEKLY_CEIL_SHARE = CONSTANTS["PORTFOLIO_WEEKLY_CEIL_SHARE"].value
PROFILE_WEIGHT_STEP = CONSTANTS["PROFILE_WEIGHT_STEP"].value
ASSUMED_GROSS_MARGIN = CONSTANTS["ASSUMED_GROSS_MARGIN"].value
RETURN_WINDOW_DAYS = CONSTANTS["RETURN_WINDOW_DAYS"].value
RECENT_REPEATER_DAYS = CONSTANTS["RECENT_REPEATER_DAYS"].value
TRAILING_MONTHS = CONSTANTS["TRAILING_MONTHS"].value
INCREMENTAL_SHARE = CONSTANTS["INCREMENTAL_SHARE"].value

LOGIN_MERCHANTS = ["M0001", "M0002", "M0004"]          # brief §2 — three selectable at login
HERO_ACQUIRING_MERCHANTS = ["M0001", "M0002", "M0003"]  # transaction-level acquiring data exists for these
LIFT_SOURCE_MERCHANT = "M0055"

DAYPARTS = ["morning", "lunch", "afternoon", "evening", "late"]
DAYPART_HOURS = {"morning": (7, 11), "lunch": (11, 14), "afternoon": (14, 17), "evening": (17, 21), "late": (21, 24)}
WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]

# Hand-authored adjacency for Singapore postal districts 1–28 (brief §5). Symmetrised at import.
_ADJ = {
    1: [2, 3, 4, 6, 7], 2: [1, 3, 4, 6], 3: [2, 4, 5, 10], 4: [2, 3, 5], 5: [3, 4, 10, 21, 22],
    6: [1, 2, 7, 9], 7: [1, 6, 8, 14, 15], 8: [7, 9, 11, 12, 13], 9: [6, 8, 10, 11], 10: [3, 5, 9, 11, 21],
    11: [8, 9, 10, 12, 20, 26], 12: [8, 11, 13, 20], 13: [8, 12, 14, 19, 20], 14: [7, 13, 15, 19],
    15: [7, 14, 16], 16: [15, 17, 18], 17: [16, 18], 18: [16, 17, 19, 28], 19: [13, 14, 18, 20, 28],
    20: [11, 12, 13, 19, 26, 27], 21: [5, 10, 22, 23], 22: [5, 21, 23, 24], 23: [21, 22, 24, 25],
    24: [22, 23, 25], 25: [23, 24, 27], 26: [11, 20, 27], 27: [20, 25, 26, 28], 28: [18, 19, 27],
}
DISTRICT_ADJACENCY = {d: set() for d in range(1, 29)}
for d, ns in _ADJ.items():
    for n in ns:
        DISTRICT_ADJACENCY[d].add(n); DISTRICT_ADJACENCY[n].add(d)


def in_catchment(cardholder_home, cardholder_work, district):
    return any(x == district or x in DISTRICT_ADJACENCY[district] for x in (cardholder_home, cardholder_work))


# RFM lookup (brief §5) — evaluated top-down; complete and disjoint.
RFM_SEGMENTS = [
    ("Champions", (4, 5), (4, 5)), ("Loyal Customers", (3, 3), (4, 5)), ("Potential Loyalists", (4, 5), (2, 3)),
    ("New Customers", (5, 5), (1, 1)), ("Promising", (4, 4), (1, 1)), ("Need Attention", (3, 3), (1, 3)),
    ("Can't Lose Them", (1, 2), (5, 5)), ("At Risk", (1, 2), (3, 4)), ("Hibernating", (2, 2), (1, 2)), ("Lost", (1, 1), (1, 2)),
]
RETENTION_POOLS = ["Champions", "Loyal Customers", "Potential Loyalists", "Need Attention", "At Risk", "Can't Lose Them"]
ACQUISITION_ARCHETYPES = ["New Customers", "Promising"]

# Six reward types (brief §2). Rankings per demand-gap type from reward-programme-recommendation Step 3 / 3b.
REWARD_TYPES = {
    "discount": "Discount", "cashback": "Cashback", "voucher": "Voucher",
    "spend_and_save": "Spend-and-save", "bundle_1for1": "Bundle / 1-for-1", "overseas_fx": "Overseas / FX-linked",
}
REWARD_RANKINGS = {
    "off_peak": ["discount", "bundle_1for1", "cashback", "voucher", "spend_and_save", "overseas_fx"],
    "new_outlet": ["voucher", "discount", "bundle_1for1", "overseas_fx", "cashback", "spend_and_save"],
    "seasonal": ["spend_and_save", "cashback", "discount", "bundle_1for1", "voucher", "overseas_fx"],
    "win_back": ["cashback", "discount", "voucher", "bundle_1for1", "spend_and_save", "overseas_fx"],
    "sku": ["voucher", "bundle_1for1", "discount", "spend_and_save", "cashback", "overseas_fx"],
}
ACQUISITION_RANKINGS = {
    "champion_lookalike": ["voucher", "spend_and_save", "bundle_1for1", "discount"],
    "new_promising_lookalike": ["voucher", "discount", "bundle_1for1", "spend_and_save"],
}
# Target RFM segments per reward type (skill Step 3 table).
REWARD_TARGET_SEGMENTS = {
    "discount": ["New Customers", "Promising", "Hibernating", "Lost"],
    "cashback": ["At Risk", "Can't Lose Them", "Need Attention"],
    "voucher": ["New Customers", "Promising"],
    "spend_and_save": ["Champions", "Loyal Customers", "Potential Loyalists"],
    "bundle_1for1": ["New Customers", "Promising", "Potential Loyalists"],
    "overseas_fx": [],
}
REWARD_REASONS = {
    "off_peak": {
        "discount": "Most tangible and immediate; time-boxed to the trough it is meant to fill.",
        "bundle_1for1": "Two covers instead of one in a window with spare capacity.",
        "cashback": "Similar immediacy, slightly less tangible at the counter.",
        "voucher": "Lowers trial friction but is not naturally tied to a narrow time window.",
        "spend_and_save": "Needs several visits; a weak fit for one narrow window.",
        "overseas_fx": "No overseas or FX signal at a domestic café. Ranked and rejected.",
    },
    "new_outlet": {
        "voucher": "Fixed-value gift framing gives the lowest first-trial friction.",
        "discount": "Also low friction for a first visit, slightly more salesy than a voucher.",
        "bundle_1for1": "Brings a second person through the door on the first visit.",
        "overseas_fx": "Only relevant in a travel catchment; none detected. Ranked and rejected.",
        "cashback": "Less immediate for a first visit to an unfamiliar merchant.",
        "spend_and_save": "Assumes repeat visits; mismatched with a single-trial goal.",
    },
    "win_back": {
        "cashback": "Simplest 'come back, get money back' message; no need to spend more than before.",
        "discount": "Low friction, reactivation-focused.",
        "voucher": "Works as a reactivation nudge, slightly less flexible.",
        "bundle_1for1": "Asks a lapsed customer to bring someone, a bigger ask than returning alone.",
        "spend_and_save": "Assumes ongoing engagement; mismatched with a lapsed customer.",
        "overseas_fx": "No travel-pattern signal in the lapse. Ranked and rejected.",
    },
    "seasonal": {
        "spend_and_save": "Built for multi-visit or basket-building across a period.",
        "cashback": "Encourages repeat spend without a hard threshold.",
        "discount": "Works, but less suited to sustaining a season-long pattern.",
        "bundle_1for1": "Single-occasion mechanic, weaker across a season.",
        "voucher": "One-off in nature, weaker for a recurring push.",
        "overseas_fx": "Seasonality is not travel-linked here. Ranked and rejected.",
    },
    "sku": {
        "voucher": "Most precise; protects margin on the rest of the basket.",
        "bundle_1for1": "Moves volume on one line without touching headline price.",
        "discount": "Precise, but more margin-erosive than a fixed voucher.",
        "spend_and_save": "Workable if repeat purchase of that item is realistic.",
        "cashback": "Hard to restrict cleanly to one item.",
        "overseas_fx": "The item is not travel-related. Ranked and rejected.",
    },
}

STATUS_DISPLAY = {"applied": "Applied", "draft": "In setup", "pending": "Submitted", "active": "Live",
                  "capped": "Fully redeemed", "stopped": "Stopped", "completed": "Completed"}

# `capped` is one ladder state reached two ways, and the display map above was settled before the
# two were distinguished. A campaign closed because every reward was claimed is fully redeemed; a
# campaign closed because the whole allocation now holds a card may have no redemptions at all,
# and calling that "Fully redeemed" is simply false. One state, one refinement keyed by the reason
# the reducer records — not a second ladder.
CAPPED_DISPLAY = {"redemption limit reached": "Fully redeemed",
                  "reach cap reached": "Reach cap reached"}


def round_reach(n):
    """Reach rounded to the nearest REACH_ROUNDING. Never call on a value below the floor — suppress it instead."""
    return int(round(n / REACH_ROUNDING) * REACH_ROUNDING)


def cell(n, label=None):
    """A privacy-floored count cell: {count: rounded} or {suppressed: true} with no count."""
    n = int(n)
    if n < MIN_SEGMENT_SIZE:
        out = {"suppressed": True, "reason": "below minimum segment size"}
    else:
        out = {"suppressed": False, "count": round_reach(n)}
    if label is not None:
        out["label"] = label
    return out


# ----------------------------------------------------------------------------------------------
# Composition breakdowns vs direct observations
#
# The 250 floor exists to stop a merchant learning who its reached cardholders are. It belongs
# on *composition* breakdowns — age bands, RFM segments, card mix: the cells that say what a
# group of people is made of. It does not belong on the merchant's own observations of its own
# trade: how many people redeemed, how many of them had bought there before, how many came back,
# what came in and what it cost. Those are the merchant's records, it can read them off its own
# till, and floored or rounded they would make the campaign drill-down unreadable for nothing.
#
# A suppressed composition breakdown must state the population it declined to break down. A
# column of suppressed cells with no denominator reads as a broken pipeline, and the merchant
# cannot tell a privacy decision from missing data.
# ----------------------------------------------------------------------------------------------

def composition(counts, population, breakdown, subject):
    """A count-based composition breakdown under the floor, with the population named.

    `counts` is {label: raw count}; `population` is the group being broken down (a direct
    observation, reported exactly); `breakdown` names the cut ("age band"); `subject` is the
    phrase that follows the population count ("cardholders redeemed this offer").
    """
    population = int(population)
    cells = {k: cell(int(v)) for k, v in counts.items()}
    n = f"{population:,}"
    below_as_a_group = population < MIN_SEGMENT_SIZE
    if population == 0:
        note = f"No {subject}, so there is no breakdown by {breakdown} to show."
    elif below_as_a_group:
        note = (f"{n} {subject} — fewer than the {MIN_SEGMENT_SIZE}-cardholder reporting floor as a single group, so no "
                f"breakdown by {breakdown} is shown for them. The {n} itself is your own record and is reported in full.")
    elif any(c["suppressed"] for c in cells.values()):
        note = (f"{n} {subject}. Any {breakdown} under {MIN_SEGMENT_SIZE} is withheld and the rest are rounded to the "
                f"nearest {REACH_ROUNDING}, so the shown cells do not sum to {n}.")
    else:
        note = (f"{n} {subject}. Every {breakdown} clears the {MIN_SEGMENT_SIZE} floor and is rounded to the nearest "
                f"{REACH_ROUNDING}, so the cells do not sum exactly to {n}.")
    return dict(population=population, floor=MIN_SEGMENT_SIZE, breakdown=breakdown,
                all_suppressed=below_as_a_group, cells=cells, note=note)


def composition_shares(shares, population, breakdown, subject):
    """A share-based composition breakdown (the card-mix panel) under the same floor.

    Percentages carry no count of their own, so the floor lands on the population behind them:
    below it the whole mix is withheld rather than shown as percentages of a handful of people.
    """
    population = int(population)
    n = f"{population:,}"
    below = population < MIN_SEGMENT_SIZE
    if population == 0:
        note = f"No {subject} yet, so there is no {breakdown} to show."
    elif below:
        note = (f"{n} {subject} — fewer than the {MIN_SEGMENT_SIZE}-cardholder reporting floor, so the {breakdown} is "
                f"withheld: percentages of {n} people would describe individuals.")
    else:
        note = f"Share of transactions by tender across {n} {subject}."
    return dict(population=population, floor=MIN_SEGMENT_SIZE, breakdown=breakdown,
                all_suppressed=below, shares=None if below else shares, note=note)


def observation(count, subject):
    """A direct merchant observation: exact, unrounded, with an empty state instead of a bare 0.

    The merchant reads this off its own till, so neither the floor nor the rounding applies. Zero
    is a state rather than a quantity — a literal 0 next to a chart reads as a broken feed, so it
    is worded the way the card-mix panel words its own empty state.
    """
    count = int(count)
    return dict(count=count, floor_applies=False,
                note=(f"No {subject} yet." if count == 0 else
                      f"{count:,} {subject}, counted exactly from your own records — your own "
                      f"observation, so no floor or rounding applies."))


def floor_policy(composition_keys, direct_observation_keys):
    """The floor's scope, shipped next to the numbers it governs so a view cannot guess wrong."""
    return dict(floor=MIN_SEGMENT_SIZE, rounding=REACH_ROUNDING,
                floored_composition=list(composition_keys), direct_observations=list(direct_observation_keys),
                note=(f"The {MIN_SEGMENT_SIZE}-cardholder floor applies to composition breakdowns of the people in this "
                      f"campaign — age bands, RFM segments, card mix. New versus returning, repeat purchases against "
                      f"control, incremental sales and net contribution are counted from your own transactions and are "
                      f"reported exactly, unrounded."))


# ----------------------------------------------------------------------------------------------
# Scale policy
#
# public/data ships sample units (SAMPLE_CARDHOLDERS); the pitch speaks at CARDHOLDER_BASE. A cap
# on how many people may be contacted therefore cannot be a headcount: 50,000 set at the 800,000
# base next to a count drawn from 12,000 is not a ceiling, it is two scales on one panel. Caps
# live here as a share and become an absolute number at render time, against the base the panel
# is actually counting. Every cap-like constant is classified below and validate.py fails if a
# new one appears unclassified.
# ----------------------------------------------------------------------------------------------

SCALE_POLICY = dict(
    share_of_consented_base=["PORTFOLIO_WEEKLY_CEIL_SHARE"],
    per_cardholder_rates=["PUSH_CAP_PER_WEEK", "FREQ_CAP_OFFERS", "NARROW_MAX_REFINEMENTS", "DORMANT_TXN_PER_MONTH"],
    absolute_by_design={
        "MIN_SEGMENT_SIZE": "A privacy floor in cardholders. As a share it would shrink with the sample and stop closing the differencing attack.",
        "REACH_ROUNDING": "Rounding granularity in cardholders, paired with the floor for the same reason.",
        "GATE_MIN_OCBC_TXNS": "Evidence threshold on the merchant's own transactions, not a cap on the cardholder base.",
        "LIFT_MIN_SUPPORT": "Evidence threshold on how many cardholders a merchant pair shares, not a cap on reach.",
        "LIFT_MIN_DAYPART_AVAILABILITY": "Already a fraction, of one cardholder's own week rather than of the base.",
        "LIFT_PRICE_BAND_TOLERANCE": "A distance in price bands, on a scale that does not grow with the base.",
        "GAP_MIN_WEEKS": "A count of weeks in the trailing window, unrelated to the size of the base.",
        "GAP_MIN_SLOT_BASELINE": "Evidence threshold on a daypart's mean slot volume.",
        "GAP_MIN_VOLUME_12W": "Evidence threshold on the merchant's own trailing volume.",
        "ELIG_MIN_BALANCE_SGD": "A currency threshold on one merchant's balance.",
        "ELIG_MAX_SCORE_BAND": "A credit-band position on a 1–5 scale.",
    },
)

SCALE_DISCLOSURE = (f"Counts are in sample units: {SAMPLE_CARDHOLDERS:,} synthetic cardholders standing in for OCBC's "
                    f"{CARDHOLDER_BASE:,}. Caps are held as a share of the consented base and computed into sample "
                    f"units, so no panel mixes the two scales.")


def cap_from_share(share, base):
    """An absolute cap, computed at render time from its share of the base on screen.

    Caps are fractions in this file; only the render knows which base it is counting against.
    """
    return int(round(share * int(base)))


def constants_manifest():
    return {k: {"value": v.value, "basis": v.basis, "provisional": v.provisional} for k, v in CONSTANTS.items()}
