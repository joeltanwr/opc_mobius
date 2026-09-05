"""
generate.py — Seeded synthetic data generator for the OCBC merchant-dashboard demo.

Produces card-issuing + acquiring transaction data with a real latent-persona
structure (so lift/co-occurrence is meaningful) plus four deliberately planted
"hero" merchant patterns used to drive the demo narrative. See README.md.

Run:
    python generate.py
Then:
    python validate.py
"""

import json
import os
import math
import random
from datetime import datetime, timedelta, date

import numpy as np
import pandas as pd

# ============================================================================
# 1. CONFIGURATION
# ============================================================================

SEED = 42
N_CARDHOLDERS = 5_000
N_MERCHANTS = 200
PERIOD_START = "2025-07-01"
PERIOD_END = "2026-06-30"
TXN_PER_CARDHOLDER_MEAN = 60
DESCRIPTOR_NOISE_RATE = 0.15
MIN_SEGMENT_SIZE = 250

# Paths are resolved relative to this script's own location (not the caller's
# cwd), so `python generate.py` works the same whether invoked from
# data-generator/ or from the repo root. data/raw/ is a local build artifact;
# public/data/ is shipped one level up, at the repo root, where a future
# frontend (Next.js/Vite-style `public/` convention) actually serves it from.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_SCRIPT_DIR)
RAW_DIR = os.path.join(_SCRIPT_DIR, "data", "raw")
PUB_DIR = os.path.join(_REPO_ROOT, "public", "data")

os.makedirs(RAW_DIR, exist_ok=True)
os.makedirs(PUB_DIR, exist_ok=True)

RNG = np.random.default_rng(SEED)
random.seed(SEED)

PERIOD_START_D = date.fromisoformat(PERIOD_START)
PERIOD_END_D = date.fromisoformat(PERIOD_END)
N_DAYS = (PERIOD_END_D - PERIOD_START_D).days + 1
ALL_DATES = [PERIOD_START_D + timedelta(days=i) for i in range(N_DAYS)]

DAYPARTS = ["morning", "lunch", "afternoon", "evening", "late"]
DAYPART_HOURS = {
    "morning": (7, 11),
    "lunch": (11, 14),
    "afternoon": (14, 17),
    "evening": (17, 21),
    "late": (21, 24),
}
PRICE_BANDS = [1, 2, 3, 4]
FREQ_ARCHETYPES = ["habitual", "routine", "considered", "rare"]
CATCHMENT_TYPES = ["neighbourhood", "office", "destination", "transit"]

# Approximate Singapore postal-district centroids (plausible, not survey-grade).
DISTRICT_CENTROIDS = {
    1: (1.2840, 103.8510), 2: (1.2760, 103.8450), 3: (1.2860, 103.8280),
    4: (1.2650, 103.8200), 5: (1.2950, 103.7900), 6: (1.2930, 103.8510),
    7: (1.3010, 103.8570), 8: (1.3070, 103.8520), 9: (1.3040, 103.8320),
    10: (1.3140, 103.8100), 11: (1.3220, 103.8440), 12: (1.3270, 103.8550),
    13: (1.3320, 103.8830), 14: (1.3200, 103.8950), 15: (1.3050, 103.9040),
    16: (1.3240, 103.9300), 17: (1.3600, 103.9630), 18: (1.3530, 103.9450),
    19: (1.3700, 103.8850), 20: (1.3690, 103.8460), 21: (1.3400, 103.7770),
    22: (1.3330, 103.7070), 23: (1.3840, 103.7620), 24: (1.4300, 103.7100),
    25: (1.4380, 103.7890), 26: (1.3700, 103.8320), 27: (1.4290, 103.8350),
    28: (1.3900, 103.8690),
}

print(f"[generate.py] seed={SEED} cardholders={N_CARDHOLDERS} merchants={N_MERCHANTS} "
      f"period={PERIOD_START}..{PERIOD_END} ({N_DAYS} days)")

# ============================================================================
# 2. TAXONOMY — public/data/taxonomy.json
# ============================================================================

CATEGORIES = [
    # F&B (8)
    dict(id="cafe", label="Cafe", group="F&B", typical_mcc=[5812, 5814],
         ticket_range_sgd=[6, 22], frequency_archetype="routine", daypart_peak="morning"),
    dict(id="bubble_tea", label="Bubble Tea", group="F&B", typical_mcc=[5812],
         ticket_range_sgd=[4, 9], frequency_archetype="habitual", daypart_peak="afternoon"),
    dict(id="hawker_kopitiam", label="Hawker & Kopitiam", group="F&B", typical_mcc=[5812],
         ticket_range_sgd=[3, 10], frequency_archetype="habitual", daypart_peak="lunch"),
    dict(id="zichar_chinese_casual", label="Zichar & Chinese Casual", group="F&B", typical_mcc=[5812],
         ticket_range_sgd=[15, 45], frequency_archetype="considered", daypart_peak="evening"),
    dict(id="japanese", label="Japanese", group="F&B", typical_mcc=[5812],
         ticket_range_sgd=[15, 60], frequency_archetype="considered", daypart_peak="evening"),
    dict(id="bakery_dessert", label="Bakery & Dessert", group="F&B", typical_mcc=[5462, 5812],
         ticket_range_sgd=[5, 18], frequency_archetype="routine", daypart_peak="afternoon"),
    dict(id="fast_food", label="Fast Food", group="F&B", typical_mcc=[5814],
         ticket_range_sgd=[6, 15], frequency_archetype="routine", daypart_peak="lunch"),
    dict(id="bar_pub", label="Bar & Pub", group="F&B", typical_mcc=[5813],
         ticket_range_sgd=[15, 50], frequency_archetype="considered", daypart_peak="late"),
    # Retail (5)
    dict(id="apparel", label="Apparel", group="Retail", typical_mcc=[5651, 5691],
         ticket_range_sgd=[20, 150], frequency_archetype="considered", daypart_peak="afternoon"),
    dict(id="beauty_cosmetics", label="Beauty & Cosmetics", group="Retail", typical_mcc=[5977],
         ticket_range_sgd=[15, 120], frequency_archetype="considered", daypart_peak="afternoon"),
    dict(id="convenience_grocery", label="Convenience & Grocery", group="Retail", typical_mcc=[5411, 5499],
         ticket_range_sgd=[5, 40], frequency_archetype="habitual", daypart_peak="evening"),
    dict(id="electronics", label="Electronics", group="Retail", typical_mcc=[5732],
         ticket_range_sgd=[30, 500], frequency_archetype="rare", daypart_peak="afternoon"),
    dict(id="books_gifts", label="Books & Gifts", group="Retail", typical_mcc=[5942, 5947],
         ticket_range_sgd=[10, 60], frequency_archetype="rare", daypart_peak="afternoon"),
    # Services & lifestyle (5)
    dict(id="hair_nail_salon", label="Hair & Nail Salon", group="Services & Lifestyle", typical_mcc=[7230],
         ticket_range_sgd=[20, 120], frequency_archetype="considered", daypart_peak="afternoon"),
    dict(id="gym_fitness", label="Gym & Fitness Studio", group="Services & Lifestyle", typical_mcc=[7997, 7991],
         ticket_range_sgd=[15, 200], frequency_archetype="routine", daypart_peak="morning"),
    dict(id="clinic_wellness", label="Clinic & Wellness", group="Services & Lifestyle", typical_mcc=[8011, 8099],
         ticket_range_sgd=[30, 150], frequency_archetype="considered", daypart_peak="afternoon"),
    dict(id="cinema_arcade", label="Cinema & Arcade", group="Services & Lifestyle", typical_mcc=[7832, 7994],
         ticket_range_sgd=[10, 40], frequency_archetype="rare", daypart_peak="evening"),
    dict(id="pet_services", label="Pet Services", group="Services & Lifestyle", typical_mcc=[742, 5995],
         ticket_range_sgd=[20, 100], frequency_archetype="rare", daypart_peak="afternoon"),
    # Other (2) — aggregators
    dict(id="ride_hailing_transit", label="Ride-hailing & Transit", group="Other", typical_mcc=[4121, 4111],
         ticket_range_sgd=[5, 30], frequency_archetype="habitual", daypart_peak="evening", is_aggregator=True),
    dict(id="online_marketplace", label="Online Marketplace", group="Other", typical_mcc=[5999, 5311],
         ticket_range_sgd=[10, 100], frequency_archetype="habitual", daypart_peak="evening", is_aggregator=True),
]
for c in CATEGORIES:
    c.setdefault("is_aggregator", False)

CATEGORY_IDS = [c["id"] for c in CATEGORIES]
CATEGORY_BY_ID = {c["id"]: c for c in CATEGORIES}
AGGREGATOR_IDS = {c["id"] for c in CATEGORIES if c["is_aggregator"]}

TAXONOMY_ATTRIBUTES = {
    "price_band": PRICE_BANDS,
    "frequency_archetype": FREQ_ARCHETYPES,
    "catchment_type": CATCHMENT_TYPES,
    "daypart": DAYPARTS,
}

# Cross-category adjacency: categories that a shared persona is likely to co-visit.
ADJACENCY_GROUPS = [
    ["cafe", "bubble_tea", "bakery_dessert"],           # afternoon treat crowd
    ["zichar_chinese_casual", "bar_pub"],                 # evening social
    ["gym_fitness", "clinic_wellness", "beauty_cosmetics"],  # wellness persona
    ["hawker_kopitiam", "convenience_grocery"],           # heartland routine
    ["japanese", "bar_pub"],                              # weekend socialiser
]


def build_taxonomy_json():
    taxonomy = {
        "categories": [
            {
                "id": c["id"], "label": c["label"], "group": c["group"],
                "typical_mcc": c["typical_mcc"], "ticket_range_sgd": c["ticket_range_sgd"],
                "frequency_archetype": c["frequency_archetype"], "daypart_peak": c["daypart_peak"],
                "is_aggregator": c["is_aggregator"],
            }
            for c in CATEGORIES
        ],
        "attributes": TAXONOMY_ATTRIBUTES,
    }
    with open(os.path.join(PUB_DIR, "taxonomy.json"), "w") as f:
        json.dump(taxonomy, f, indent=2)
    return taxonomy

# ============================================================================
# 3. MERCHANTS — data/raw/merchants.parquet
# ============================================================================

# Plausible Singapore-style business names per category (no real brands).
NAME_POOL = {
    "cafe": ["Kopi & Co", "Third Wave Coffee", "The Daily Grind", "Nook Cafe", "Brew Lab",
             "The Roastery", "Morning Ritual", "Latte House", "Bean There Cafe", "Sunrise Cafe",
             "The Coffee Post", "Milk & Bean", "Filter Co", "Cafe Meridian"],
    "bubble_tea": ["Koi The", "Tea Alley", "Sweet Leaf", "Pearl & Milk", "Boba Loca",
                   "The Tea Press", "Chill Tea Bar", "Milkfoam", "Tea Trail", "Bubble Bros",
                   "Leaf & Pearl", "Tea Society"],
    "hawker_kopitiam": ["Heng Heng Kopitiam", "Good Fortune Coffeeshop", "Ah Huat Eating House",
                        "Sin Sin Kopitiam", "Golden Wok Hawker", "Uncle Tans Corner",
                        "Fu Lai Coffeeshop", "Lucky Star Eating House", "Chuan Kee Kopitiam",
                        "Hup Seng Hawker Centre", "Kim Guan Coffeeshop"],
    "zichar_chinese_casual": ["Wok Hei Zichar", "Golden Dragon Zichar", "Ah Boy Zichar",
                              "Fortune Kitchen", "Village Zichar", "Jade Wok",
                              "Home Taste Zichar", "Lao Ban Zichar", "Kim Heng Zichar",
                              "Full House Zichar"],
    "japanese": ["Sakura Sushi", "Izakaya Ume", "Ramen Ichiban", "Tori Yaki", "Sushi Doraku",
                 "Wafu Kitchen", "Kaisen Don House", "Robata Grill", "Nami Ramen", "Edomae Sushi"],
    "bakery_dessert": ["Sweet Crumb Bakery", "Butter and Bloom", "The Dessert Bar", "Flour Power Bakery",
                       "Cocoa Lane", "Sugar Rush Desserts", "The Cake Studio", "Warm Oven Bakery",
                       "Gelato Grove", "Honeycomb Patisserie"],
    "fast_food": ["Crispy Bite", "Grill Express", "Burger Loft", "QuickBite Diner", "Golden Fry",
                  "Snap Chicken", "Bite Stop", "Fry Co", "Speedy Meals", "Munch House"],
    "bar_pub": ["The Tipsy Fox", "Hoppy Hour", "The Brass Tap", "Alley Cat Bar", "The Last Round",
                "Barrel and Vine", "The Nightcap", "Rooftop 8", "The Copper Still", "Smoke and Barrel"],
    "apparel": ["Thread and Co", "Urban Weave", "The Closet Edit", "Linen and Lime", "Stitch Society",
                "Wardrobe Lab", "The Fit Room", "Denim Draft", "Muse Apparel", "Fold Studio"],
    "beauty_cosmetics": ["Glow Room", "Bare Skin Studio", "The Vanity Bar", "Petal Cosmetics",
                         "Skin Society", "Lush Palette", "Dewy Beauty Bar", "The Blush Room",
                         "Radiance Studio", "Pure Glow Beauty"],
    "convenience_grocery": ["QuickMart", "Corner Grocer", "Handy Mart", "Daily Needs Grocer",
                            "Neighbours Mart", "24Seven Grocer", "PocketMart", "FreshStop Grocer",
                            "EasyBuy Mart", "The Grocery Nook"],
    "electronics": ["CircuitHub", "GadgetWorks", "ByteStore", "TechNest", "Volt Electronics",
                    "The Device Shop", "Pixel and Watt", "ChipTown Electronics", "NextGen Gadgets",
                    "Signal Electronics"],
    "books_gifts": ["Paper Trail Books", "The Gift Nook", "Ink and Page", "Wrapped With Love",
                    "Chapter One Books", "Trinket Box", "The Bookmark", "Little Wonders Gifts",
                    "Storyline Books", "Keepsake Corner"],
    "hair_nail_salon": ["Snip and Style", "The Nail Bar", "Silk Strands Salon", "Polished Nail Studio",
                        "Studio 88 Hair", "The Vanity Chair", "Glaze Nail Lounge", "Fringe Hair Studio",
                        "The Clip House", "Lacquer Nail Bar"],
    "gym_fitness": ["Iron Circuit Gym", "The Fit Lab", "Pulse Fitness Studio", "Core and Barbell",
                    "FlexZone Gym", "The Strength Room", "Momentum Fitness", "Sweat Society",
                    "Ascend Fitness Studio", "The Rep Room"],
    "clinic_wellness": ["Wellview Clinic", "Family Care Clinic", "The Wellness Room", "Vital Health Clinic",
                        "Harmony Clinic", "CityCare Clinic", "Renew Wellness", "The Health Post",
                        "Balance Clinic", "Everwell Clinic"],
    "cinema_arcade": ["Starlight Cinema", "Pixel Arcade", "The Screening Room", "Neon Arcade",
                      "CineHub", "Retro Arcade Bar", "The Reel House", "Flicker Cinema"],
    "pet_services": ["Pawfect Grooming", "The Pet Nook", "Furry Friends Care", "Whisker Wellness",
                     "Tail Waggers Grooming", "The Pet Parlour", "Happy Paws Studio", "Pet Haven"],
    "ride_hailing_transit": ["GoHop Rides", "CityLink Transit", "SwiftRide", "MoveNow Transit",
                             "ZoomCar Rides", "TransitLink Express"],
    "online_marketplace": ["ShopLoop", "MarketNest", "BuyHive", "ClickBasket", "TradeLane",
                           "EverBuy Marketplace"],
}

HERO_MERCHANT_IDS = {"M0001", "M0002", "M0003", "M0004", "M0055"}

CHAIN_SUFFIXES = [" @ Suntec", " @ AMK Hub", " @ VivoCity", " @ Jurong Point", " @ Bugis Junction",
                   " @ Tampines Mall", " @ Plaza Sing", " @ Northpoint", " @ Clementi Mall",
                   " @ Junction 8", " @ Compass One", " @ Century Sq", " @ Causeway Point"]


def jitter_latlng(district, r):
    lat0, lng0 = DISTRICT_CENTROIDS[district]
    return lat0 + r.normal(0, 0.006), lng0 + r.normal(0, 0.006)


def build_merchants():
    r = np.random.default_rng(SEED + 1)
    n_per_cat = N_MERCHANTS // len(CATEGORIES)  # 10
    assert n_per_cat * len(CATEGORIES) == N_MERCHANTS

    all_ids = [f"M{i:04d}" for i in range(1, N_MERCHANTS + 1)]

    reserved = {
        "M0001": "cafe", "M0002": "bubble_tea", "M0003": "apparel",
        "M0004": "cafe", "M0055": "cafe",
    }
    remaining_ids = [mid for mid in all_ids if mid not in reserved]
    r.shuffle(remaining_ids)

    slots_needed = {c["id"]: n_per_cat for c in CATEGORIES}
    for mid, cat in reserved.items():
        slots_needed[cat] -= 1

    cat_assignment = dict(reserved)
    idx = 0
    for c in CATEGORIES:
        need = slots_needed[c["id"]]
        for _ in range(need):
            cat_assignment[remaining_ids[idx]] = c["id"]
            idx += 1
    assert idx == len(remaining_ids)

    from collections import Counter
    counts = Counter(cat_assignment.values())
    for c in CATEGORIES:
        assert counts[c["id"]] == n_per_cat, (c["id"], counts[c["id"]])

    rows = []
    used_names_by_cat = {}
    for mid in all_ids:
        cat_id = cat_assignment[mid]
        cat = CATEGORY_BY_ID[cat_id]
        pool = NAME_POOL[cat_id]
        used = used_names_by_cat.setdefault(cat_id, set())
        avail = [n for n in pool if n not in used]
        if not avail:
            avail = pool
        name = avail[r.integers(0, len(avail))]
        used.add(name)

        is_chain = r.random() < 0.10
        outlet_count = int(r.integers(3, 41)) if is_chain else 1

        if r.random() < 0.10:
            other_cats = [c2 for c2 in CATEGORY_IDS if c2 != cat_id and c2 not in AGGREGATOR_IDS]
            wrong_cat = other_cats[r.integers(0, len(other_cats))]
            mcc = int(r.choice(CATEGORY_BY_ID[wrong_cat]["typical_mcc"]))
        else:
            mcc = int(r.choice(cat["typical_mcc"]))

        lo, hi = cat["ticket_range_sgd"]
        band_center = 1 + 3 * (math.log(hi + 1) - math.log(8)) / (math.log(500) - math.log(8))
        band_center = min(max(band_center, 1), 4)
        price_band = int(np.clip(round(r.normal(band_center, 0.8)), 1, 4))

        freq_archetype = cat["frequency_archetype"] if r.random() < 0.7 else FREQ_ARCHETYPES[r.integers(0, 4)]

        if cat_id in AGGREGATOR_IDS:
            catchment_type = "transit" if cat_id == "ride_hailing_transit" else "destination"
        else:
            catchment_weights = {"neighbourhood": 0.4, "office": 0.25, "destination": 0.2, "transit": 0.15}
            catchment_type = r.choice(list(catchment_weights.keys()), p=list(catchment_weights.values()))

        peak_idx = DAYPARTS.index(cat["daypart_peak"])
        alpha = np.ones(5) * 1.2
        alpha[peak_idx] = 6.0
        daypart_profile_vec = r.dirichlet(alpha)
        daypart_profile = {d: round(float(w), 4) for d, w in zip(DAYPARTS, daypart_profile_vec)}

        if mid == "M0001":
            district = 2
        elif mid == "M0055":
            district = 4
        elif mid == "M0004":
            district = 2
        else:
            district = int(r.integers(1, 29))
        lat, lng = jitter_latlng(district, r)

        if cat_id in AGGREGATOR_IDS:
            is_ocbc_acquired = False
        elif mid in ("M0001", "M0002", "M0003"):
            is_ocbc_acquired = True
        elif mid in ("M0004", "M0055"):
            is_ocbc_acquired = False
        else:
            is_ocbc_acquired = r.random() < 0.35

        if is_ocbc_acquired:
            if mid == "M0002":
                acquiring_start = PERIOD_END_D - timedelta(days=21)
            else:
                earliest = PERIOD_START_D - timedelta(days=365)
                span = (PERIOD_END_D - timedelta(days=30) - earliest).days
                acquiring_start = earliest + timedelta(days=int(r.integers(0, max(span, 1))))
        else:
            acquiring_start = None

        rows.append(dict(
            merchant_id=mid,
            canonical_name=name + (CHAIN_SUFFIXES[r.integers(0, len(CHAIN_SUFFIXES))] if is_chain else ""),
            category=cat_id,
            mcc=mcc,
            price_band=price_band,
            frequency_archetype=freq_archetype,
            catchment_type=catchment_type,
            daypart_profile=daypart_profile,
            postal_district=district,
            lat=round(float(lat), 5),
            lng=round(float(lng), 5),
            outlet_count=outlet_count,
            is_chain=bool(is_chain),
            is_aggregator=cat_id in AGGREGATOR_IDS,
            is_ocbc_acquired=bool(is_ocbc_acquired),
            acquiring_start_date=acquiring_start.isoformat() if acquiring_start else None,
        ))

    df = pd.DataFrame(rows)
    df = df.sort_values("merchant_id").reset_index(drop=True)
    return df


# ============================================================================
# 4. DESCRIPTORS — data/raw/merchant_descriptors.parquet
# ============================================================================

def _collapse_spacing(s):
    return s.replace(" ", "").upper()


def _diacritic_drift(s):
    subs = {"e": "é", "a": "á", "o": "ô", "i": "í"}
    out = []
    replaced = False
    for ch in s:
        low = ch.lower()
        if not replaced and low in subs:
            out.append(subs[low])
            replaced = True
        else:
            out.append(ch)
    return "".join(out)


def build_descriptors(merchants_df):
    r = np.random.default_rng(SEED + 2)
    rows = []
    for _, m in merchants_df.iterrows():
        canonical = m["canonical_name"].upper()
        rows.append(dict(descriptor_raw=canonical, merchant_id=m["merchant_id"], is_canonical=True))

        if r.random() < DESCRIPTOR_NOISE_RATE:
            n_variants = int(r.integers(2, 5))
            transforms = list(range(7))
            r.shuffle(transforms)
            chosen = transforms[:n_variants]
            for t in chosen:
                base = canonical
                if t == 0:  # outlet suffix
                    outlets = ["AMK HUB", "VIVOCITY", "BUGIS", "TAMPINES", "JURONG PT", "CLEMENTI"]
                    variant = f"{base} @ {outlets[r.integers(0, len(outlets))]}"
                elif t == 1:  # terminal numbering
                    variant = f"{base} {int(r.integers(100, 999))}"
                elif t == 2:  # spacing collapse
                    variant = _collapse_spacing(base) + " SG"
                elif t == 3:  # diacritic drift
                    variant = _diacritic_drift(base)
                elif t == 4:  # truncation to 22 chars
                    variant = base[:22]
                elif t == 5:  # case inversion
                    variant = base.swapcase()
                else:  # acquirer prefix
                    prefix = ["SG*", "PAYNOW-"][r.integers(0, 2)]
                    variant = f"{prefix}{base}"
                rows.append(dict(descriptor_raw=variant, merchant_id=m["merchant_id"], is_canonical=False))
    df = pd.DataFrame(rows)
    return df


# ============================================================================
# 5. CARDHOLDERS — data/raw/cardholders.parquet
# ============================================================================

AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]
CARD_PRODUCTS = ["365", "Titanium", "Rewards", "Voyage", "90N"]
ENGAGEMENT_TIERS = ["high", "medium", "low", "dormant"]
ENGAGEMENT_MULT = {"high": 1.6, "medium": 1.0, "low": 0.55, "dormant": 0.15}

# Base (unnormalized) category-affinity weights per persona archetype.
# Keys omitted default to a small baseline weight.
_BASE_W = 0.4


def _persona_vec(overrides):
    vec = {cid: _BASE_W for cid in CATEGORY_IDS}
    vec.update(overrides)
    return vec


PERSONAS = [
    dict(id=0, name="CBD office worker",
         category_weights=_persona_vec({
             "cafe": 8, "japanese": 5, "fast_food": 4, "gym_fitness": 3, "convenience_grocery": 3,
             "bakery_dessert": 3, "online_marketplace": 6, "ride_hailing_transit": 6, "bar_pub": 2,
         }),
         price_band_pref=2.6, price_band_spread=0.7,
         daypart_weights={"morning": 0.28, "lunch": 0.30, "afternoon": 0.12, "evening": 0.22, "late": 0.08},
         home_districts=[19, 20, 12, 13, 27, 18], work_districts=[1, 2, 6, 9],
         engagement_dist={"high": 0.35, "medium": 0.4, "low": 0.2, "dormant": 0.05},
         age_bands=["25-34", "35-44"], card_products=["Titanium", "Rewards", "365"]),
    dict(id=1, name="Heartland family",
         category_weights=_persona_vec({
             "hawker_kopitiam": 8, "convenience_grocery": 7, "apparel": 3, "books_gifts": 3,
             "clinic_wellness": 3, "bakery_dessert": 3, "pet_services": 2, "fast_food": 3,
         }),
         price_band_pref=1.8, price_band_spread=0.6,
         daypart_weights={"morning": 0.18, "lunch": 0.22, "afternoon": 0.22, "evening": 0.3, "late": 0.08},
         home_districts=[18, 19, 20, 22, 23, 25, 27, 28], work_districts=[18, 19, 20, 22, 23, 25, 27, 28],
         engagement_dist={"high": 0.2, "medium": 0.45, "low": 0.28, "dormant": 0.07},
         age_bands=["35-44", "45-54"], card_products=["365", "Rewards"]),
    dict(id=2, name="Young professional",
         category_weights=_persona_vec({
             "cafe": 7, "bubble_tea": 6, "bar_pub": 5, "beauty_cosmetics": 4, "apparel": 5,
             "online_marketplace": 6, "hair_nail_salon": 3, "japanese": 3,
         }),
         price_band_pref=2.4, price_band_spread=0.8,
         daypart_weights={"morning": 0.15, "lunch": 0.2, "afternoon": 0.25, "evening": 0.28, "late": 0.12},
         home_districts=[1, 2, 3, 4, 7, 8, 9, 14, 15], work_districts=[1, 2, 3, 6, 7, 9],
         engagement_dist={"high": 0.4, "medium": 0.4, "low": 0.15, "dormant": 0.05},
         age_bands=["25-34"], card_products=["Rewards", "Titanium"]),
    dict(id=3, name="Student",
         category_weights=_persona_vec({
             "bubble_tea": 8, "fast_food": 6, "cinema_arcade": 4, "books_gifts": 3, "hawker_kopitiam": 5,
             "convenience_grocery": 3, "online_marketplace": 4,
         }),
         price_band_pref=1.3, price_band_spread=0.5,
         daypart_weights={"morning": 0.1, "lunch": 0.25, "afternoon": 0.3, "evening": 0.25, "late": 0.1},
         home_districts=[13, 14, 19, 20, 21, 26, 28], work_districts=[13, 14, 19, 20, 21],
         engagement_dist={"high": 0.25, "medium": 0.35, "low": 0.3, "dormant": 0.1},
         age_bands=["18-24"], card_products=["90N"]),
    dict(id=4, name="Frequent traveller",
         category_weights=_persona_vec({
             "japanese": 6, "bar_pub": 4, "electronics": 3, "ride_hailing_transit": 7,
             "online_marketplace": 5, "apparel": 3, "cafe": 3,
         }),
         price_band_pref=3.2, price_band_spread=0.7,
         daypart_weights={"morning": 0.2, "lunch": 0.2, "afternoon": 0.18, "evening": 0.28, "late": 0.14},
         home_districts=[9, 10, 11, 15, 16], work_districts=[1, 9, 10],
         engagement_dist={"high": 0.3, "medium": 0.4, "low": 0.22, "dormant": 0.08},
         age_bands=["35-44", "45-54"], card_products=["Voyage", "Titanium"]),
    dict(id=5, name="Retiree",
         category_weights=_persona_vec({
             "hawker_kopitiam": 8, "clinic_wellness": 6, "pet_services": 3, "bakery_dessert": 4,
             "convenience_grocery": 4, "books_gifts": 2,
         }),
         price_band_pref=1.6, price_band_spread=0.5,
         daypart_weights={"morning": 0.32, "lunch": 0.24, "afternoon": 0.26, "evening": 0.14, "late": 0.04},
         home_districts=[12, 13, 19, 20, 23, 25, 26, 27, 28], work_districts=[],
         engagement_dist={"high": 0.1, "medium": 0.3, "low": 0.4, "dormant": 0.2},
         age_bands=["55-64", "65+"], card_products=["365"]),
    dict(id=6, name="Wellness regular",
         category_weights=_persona_vec({
             "gym_fitness": 8, "clinic_wellness": 6, "beauty_cosmetics": 5, "cafe": 5,
             "hair_nail_salon": 3, "convenience_grocery": 2,
         }),
         price_band_pref=2.7, price_band_spread=0.7,
         daypart_weights={"morning": 0.34, "lunch": 0.14, "afternoon": 0.22, "evening": 0.24, "late": 0.06},
         home_districts=[3, 4, 5, 9, 10, 11, 15, 20], work_districts=[1, 2, 9, 10],
         engagement_dist={"high": 0.38, "medium": 0.38, "low": 0.18, "dormant": 0.06},
         age_bands=["25-34", "35-44"], card_products=["Rewards", "Titanium"]),
    dict(id=7, name="Weekend socialiser",
         category_weights=_persona_vec({
             "bar_pub": 7, "zichar_chinese_casual": 6, "cinema_arcade": 4, "japanese": 4,
             "ride_hailing_transit": 5, "cafe": 3,
         }),
         price_band_pref=2.5, price_band_spread=0.8,
         daypart_weights={"morning": 0.08, "lunch": 0.18, "afternoon": 0.2, "evening": 0.32, "late": 0.22},
         home_districts=[7, 8, 14, 15, 16, 19], work_districts=[1, 6, 7, 8],
         engagement_dist={"high": 0.3, "medium": 0.4, "low": 0.22, "dormant": 0.08},
         age_bands=["25-34", "35-44"], card_products=["Rewards", "90N"]),
]
PERSONA_BY_ID = {p["id"]: p for p in PERSONAS}


def _normalize_weights(w_dict):
    vals = np.array(list(w_dict.values()), dtype=float)
    vals = vals / vals.sum()
    return dict(zip(w_dict.keys(), vals))


def _sample_cardholder(persona, r, card_id, home_district_override=None, work_district_override=None):
    base_vec = np.array([persona["category_weights"][cid] for cid in CATEGORY_IDS], dtype=float)
    base_vec = base_vec / base_vec.sum()
    affinity_vec = r.dirichlet(base_vec * 25.0 + 0.05)
    category_affinity = {cid: round(float(w), 5) for cid, w in zip(CATEGORY_IDS, affinity_vec)}

    price_band_pref = float(np.clip(r.normal(persona["price_band_pref"], persona["price_band_spread"]), 1, 4))

    dp_base = np.array([persona["daypart_weights"][d] for d in DAYPARTS])
    dp_vec = r.dirichlet(dp_base * 20.0 + 0.1)
    daypart_availability = {d: round(float(w), 4) for d, w in zip(DAYPARTS, dp_vec)}

    home = home_district_override if home_district_override is not None else (
        persona["home_districts"][r.integers(0, len(persona["home_districts"]))]
        if persona["home_districts"] else int(r.integers(1, 29))
    )
    work_pool = persona["work_districts"] if persona["work_districts"] else [home]
    work = work_district_override if work_district_override is not None else work_pool[r.integers(0, len(work_pool))]

    age_band = persona["age_bands"][r.integers(0, len(persona["age_bands"]))]
    card_product = persona["card_products"][r.integers(0, len(persona["card_products"]))]
    tenure_months = int(r.integers(3, 97))

    tiers = list(persona["engagement_dist"].keys())
    probs = list(persona["engagement_dist"].values())
    engagement_tier = tiers[r.choice(len(tiers), p=probs)]

    return dict(
        card_id=card_id,
        persona_id=persona["id"],
        category_affinity=category_affinity,
        price_band_pref=round(price_band_pref, 2),
        home_district=int(home),
        work_district=int(work),
        daypart_availability=daypart_availability,
        age_band=age_band,
        card_product=card_product,
        tenure_months=tenure_months,
        engagement_tier=engagement_tier,
    )


def _card_id(n):
    return f"CH{n:05d}"


# ----------------------------------------------------------------------------
# 5a. Showcase personas + H1 hero cohort — hand-specified cardholder identities
# ----------------------------------------------------------------------------
# Card id ranges (deterministic, non-overlapping):
#   CH00001..CH00006  showcase personas (Alvin, Bernice, Charles, Denise, Edwin, Farah)
#   CH00007..CH00764  H1 hero cohort (a_only, overlap, b_only)  [758 people]
#   CH00765..CH05000  generic population                        [4236 people]

SHOWCASE_IDS = {
    "alvin": "CH00001", "bernice": "CH00002", "charles": "CH00003",
    "denise": "CH00004", "edwin": "CH00005", "farah": "CH00006",
}

N_H1_A_ONLY = 140   # regulars at M0001 (includes Alvin)
N_H1_OVERLAP = 70   # regulars at both M0001 and M0055 (support)
N_H1_B_ONLY = 550   # regulars at M0055 only (target cohort; includes Bernice)
N_H1_TOTAL = N_H1_A_ONLY + N_H1_OVERLAP + N_H1_B_ONLY  # 760 (incl. Alvin & Bernice)

H1_FIRST_ID = 7


def build_cardholders_and_cohorts(merchants_df):
    r = np.random.default_rng(SEED + 3)
    m0001 = merchants_df.set_index("merchant_id").loc["M0001"]
    m0055 = merchants_df.set_index("merchant_id").loc["M0055"]

    rows = []
    cohorts = dict(showcase={}, h1_a_only=[], h1_overlap=[], h1_b_only=[])

    # --- Showcase personas -------------------------------------------------
    # Alvin — persona 0 (CBD office worker), converts at M0001, extreme habitual.
    alvin = _sample_cardholder(PERSONA_BY_ID[0], r, SHOWCASE_IDS["alvin"],
                                home_district_override=2, work_district_override=2)
    alvin["price_band_pref"] = float(m0001["price_band"])
    alvin["daypart_availability"] = {"morning": 0.72, "lunch": 0.08, "afternoon": 0.08, "evening": 0.08, "late": 0.04}
    alvin["engagement_tier"] = "high"
    rows.append(alvin)
    cohorts["showcase"]["alvin"] = alvin["card_id"]

    # Bernice — persona 2 (young professional), Alvin's statistical twin, converts at M0055.
    bernice = _sample_cardholder(PERSONA_BY_ID[2], r, SHOWCASE_IDS["bernice"],
                                  home_district_override=4, work_district_override=2)
    bernice["price_band_pref"] = float(m0055["price_band"])
    bernice["daypart_availability"] = {"morning": 0.68, "lunch": 0.1, "afternoon": 0.1, "evening": 0.08, "late": 0.04}
    bernice["engagement_tier"] = "high"
    rows.append(bernice)
    cohorts["showcase"]["bernice"] = bernice["card_id"]

    # Charles — persona 4 (frequent traveller), premium director, price-insensitive.
    charles = _sample_cardholder(PERSONA_BY_ID[4], r, SHOWCASE_IDS["charles"],
                                  home_district_override=9, work_district_override=9)
    charles["price_band_pref"] = 4.0
    charles["engagement_tier"] = "medium"
    charles["age_band"] = "45-54"
    charles["card_product"] = "Voyage"
    rows.append(charles)
    cohorts["showcase"]["charles"] = charles["card_id"]

    # Denise — persona 1 (heartland family), Tampines, bursty apparel buyer.
    denise = _sample_cardholder(PERSONA_BY_ID[1], r, SHOWCASE_IDS["denise"],
                                 home_district_override=18, work_district_override=18)
    denise["engagement_tier"] = "medium"
    denise["age_band"] = "25-34"
    rows.append(denise)
    cohorts["showcase"]["denise"] = denise["card_id"]

    # Edwin — persona 2 (young professional archetype, first job), Bugis, high-frequency low-ticket.
    edwin = _sample_cardholder(PERSONA_BY_ID[2], r, SHOWCASE_IDS["edwin"],
                                home_district_override=7, work_district_override=7)
    edwin["price_band_pref"] = 1.2
    edwin["engagement_tier"] = "high"
    edwin["age_band"] = "18-24"
    edwin["card_product"] = "90N"
    rows.append(edwin)
    cohorts["showcase"]["edwin"] = edwin["card_id"]

    # Farah — persona 5 (retiree-adjacent), Toa Payoh, dormant, cash-preferring.
    farah = _sample_cardholder(PERSONA_BY_ID[5], r, SHOWCASE_IDS["farah"],
                                home_district_override=12, work_district_override=12)
    farah["engagement_tier"] = "dormant"
    farah["age_band"] = "55-64"
    rows.append(farah)
    cohorts["showcase"]["farah"] = farah["card_id"]

    # --- H1 hero cohort ------------------------------------------------------
    # Drawn from CBD-office / young-professional personas, forced into the
    # Tanjong Pagar corridor (home or work district near M0001 / M0055) with a
    # price-band and daypart profile that fits both cafes.
    next_id = H1_FIRST_ID
    corridor_districts = [1, 2, 3, 4]

    def make_corridor_cardholder(cid, persona_id):
        p = PERSONA_BY_ID[persona_id]
        ch = _sample_cardholder(p, r, cid,
                                 home_district_override=corridor_districts[r.integers(0, len(corridor_districts))],
                                 work_district_override=2)
        ch["price_band_pref"] = float(np.clip(r.normal((m0001["price_band"] + m0055["price_band"]) / 2, 0.4), 1, 4))
        dp = np.array([0.55, 0.1, 0.2, 0.1, 0.05])  # morning/afternoon heavy, like the cafe crowd
        dp = r.dirichlet(dp * 15 + 0.1)
        ch["daypart_availability"] = {d: round(float(w), 4) for d, w in zip(DAYPARTS, dp)}
        return ch

    # a_only (Alvin already counted separately; generate the other N_H1_A_ONLY - 1)
    for _ in range(N_H1_A_ONLY - 1):
        persona_id = 0 if r.random() < 0.6 else 2
        ch = make_corridor_cardholder(_card_id(next_id), persona_id)
        rows.append(ch)
        cohorts["h1_a_only"].append(ch["card_id"])
        next_id += 1
    cohorts["h1_a_only"].append(alvin["card_id"])

    # overlap
    for _ in range(N_H1_OVERLAP):
        persona_id = 0 if r.random() < 0.5 else 2
        ch = make_corridor_cardholder(_card_id(next_id), persona_id)
        rows.append(ch)
        cohorts["h1_overlap"].append(ch["card_id"])
        next_id += 1

    # b_only (Bernice already counted separately; generate the other N_H1_B_ONLY - 1)
    for _ in range(N_H1_B_ONLY - 1):
        persona_id = 2 if r.random() < 0.6 else 0
        ch = make_corridor_cardholder(_card_id(next_id), persona_id)
        rows.append(ch)
        cohorts["h1_b_only"].append(ch["card_id"])
        next_id += 1
    cohorts["h1_b_only"].append(bernice["card_id"])

    assert next_id == H1_FIRST_ID + (N_H1_TOTAL - 2)
    last_h1_id = next_id - 1

    # --- Generic population ---------------------------------------------------
    n_generic = N_CARDHOLDERS - 6 - (N_H1_TOTAL - 2)
    persona_weights = np.array([0.14, 0.16, 0.16, 0.10, 0.09, 0.13, 0.11, 0.11])
    persona_weights = persona_weights / persona_weights.sum()
    persona_choices = r.choice(len(PERSONAS), size=n_generic, p=persona_weights)
    for i in range(n_generic):
        cid = _card_id(last_h1_id + 1 + i)
        ch = _sample_cardholder(PERSONA_BY_ID[int(persona_choices[i])], r, cid)
        rows.append(ch)

    df = pd.DataFrame(rows)
    df = df.sort_values("card_id").reset_index(drop=True)
    assert len(df) == N_CARDHOLDERS, len(df)
    assert df["card_id"].is_unique
    return df, cohorts


# ============================================================================
# 6. TRANSACTION ENGINE (generic / emergent population)
# ============================================================================

MONTH_MULT = {
    "2025-07": 1.00, "2025-08": 1.00, "2025-09": 1.00, "2025-10": 1.03,
    "2025-11": 1.08, "2025-12": 1.18, "2026-01": 1.05, "2026-02": 1.14,
    "2026-03": 0.94, "2026-04": 0.97, "2026-05": 1.00, "2026-06": 1.03,
}
FNB_LIKE = {"cafe", "bubble_tea", "hawker_kopitiam", "zichar_chinese_casual", "japanese",
            "bakery_dessert", "fast_food", "bar_pub"}

# H3 — seasonal trough curve for M0003 (apparel): year-end + CNY peak, sharp
# post-CNY dip in Mar, recovering to baseline by Jun.
H3_MONTH_MULT = {
    "2025-07": 0.95, "2025-08": 0.95, "2025-09": 0.97, "2025-10": 1.02,
    "2025-11": 1.15, "2025-12": 1.35, "2026-01": 1.20, "2026-02": 1.30,
    "2026-03": 0.55, "2026-04": 0.68, "2026-05": 0.85, "2026-06": 1.00,
}


def _day_trend(day_idx):
    return 0.92 + 0.16 * (day_idx / max(N_DAYS - 1, 1))


def precompute_category_daily_weights():
    weights = {}
    for cat_id in CATEGORY_IDS:
        arr = np.zeros(N_DAYS)
        for i, d in enumerate(ALL_DATES):
            month_key = f"{d.year}-{d.month:02d}"
            w = _day_trend(i) * MONTH_MULT[month_key]
            if cat_id in FNB_LIKE and d.weekday() in (4, 5, 6):
                w *= 1.35
            elif cat_id in ("apparel", "beauty_cosmetics", "electronics", "books_gifts") and d.weekday() in (5, 6):
                w *= 1.2
            arr[i] = w
        weights[cat_id] = arr / arr.sum()
    return weights


def h3_daily_weights():
    arr = np.zeros(N_DAYS)
    for i, d in enumerate(ALL_DATES):
        month_key = f"{d.year}-{d.month:02d}"
        w = _day_trend(i) * H3_MONTH_MULT[month_key]
        if d.weekday() in (5, 6):
            w *= 1.15
        arr[i] = w
    return arr / arr.sum()


def build_category_merchant_index(merchants_df, exclude_ids=()):
    idx = {}
    for cat_id in CATEGORY_IDS:
        sub = merchants_df[(merchants_df["category"] == cat_id) & (~merchants_df["merchant_id"].isin(exclude_ids))]
        idx[cat_id] = sub.reset_index(drop=True)
    return idx


def _haversine_km(lat1, lng1, lat2, lng2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


CATCHMENT_DECAY_KM = {"neighbourhood": 2.5, "office": 4.0, "transit": 6.0, "destination": 12.0}


def merchant_weights_for_cardholder(cat_merchants, home_lat, home_lng, work_lat, work_lng,
                                     price_pref, daypart):
    n = len(cat_merchants)
    if n == 0:
        return np.array([])
    dist_home = np.array([_haversine_km(home_lat, home_lng, la, ln)
                           for la, ln in zip(cat_merchants["lat"], cat_merchants["lng"])])
    dist_work = np.array([_haversine_km(work_lat, work_lng, la, ln)
                           for la, ln in zip(cat_merchants["lat"], cat_merchants["lng"])])
    dist = np.minimum(dist_home, dist_work)
    decay = cat_merchants["catchment_type"].map(CATCHMENT_DECAY_KM).values
    dist_w = np.exp(-dist / decay)
    price_w = np.exp(-((price_pref - cat_merchants["price_band"].values) ** 2) / (2 * 1.1 ** 2))
    dp_w = np.array([dp.get(daypart, 0.05) for dp in cat_merchants["daypart_profile"]])
    w = dist_w * price_w * (dp_w + 0.05)
    total = w.sum()
    if total <= 0:
        return np.ones(n) / n
    return w / total


def _sample_amount(r, lo, hi, price_band):
    # price_band in [1,4] shifts the center within [lo, hi] rather than always
    # sampling around the range midpoint, so pricier merchants skew tickets up.
    frac = (price_band - 1) / 3.0
    center = lo + (hi - lo) * (0.3 + 0.4 * frac)
    mu = math.log(center + 1)
    sigma = 0.32
    amt = r.lognormal(mu, sigma) - 1
    return float(np.clip(amt, lo * 0.6, hi * 1.8))


def _channel_for_category(cat_id, r):
    if cat_id == "online_marketplace":
        return "ecom"
    if cat_id == "ride_hailing_transit":
        return r.choice(["contactless", "ecom"], p=[0.3, 0.7])
    return r.choice(["pos", "contactless", "ecom"], p=[0.45, 0.5, 0.05])


COUNTRY_POOL = ["MY", "ID", "TH", "JP", "AU"]


def _country_for(r, is_traveller, catchment_type):
    base_foreign = 0.08
    if is_traveller:
        base_foreign = 0.22
    if catchment_type == "destination":
        base_foreign += 0.03
    if r.random() < base_foreign:
        return COUNTRY_POOL[r.integers(0, len(COUNTRY_POOL))]
    return "SG"


def build_descriptor_lookup(descriptors_df):
    """merchant_id -> (list_of_descriptor_raw, sample_weights); canonical dominates."""
    lookup = {}
    for mid, grp in descriptors_df.groupby("merchant_id"):
        descs = grp["descriptor_raw"].tolist()
        is_canon = grp["is_canonical"].tolist()
        n_variants = len(descs) - 1
        if n_variants <= 0:
            lookup[mid] = (descs, np.array([1.0]))
        else:
            w = [0.8] + [0.2 / n_variants] * n_variants
            order = sorted(range(len(descs)), key=lambda i: not is_canon[i])
            lookup[mid] = ([descs[i] for i in order], np.array(w))
    return lookup


def generate_generic_transactions(cardholders_df, merchants_df, cat_merchant_idx, cat_daily_weights,
                                   descriptor_lookup, txn_id_start=1):
    r = np.random.default_rng(SEED + 4)
    merchants_by_id = merchants_df.set_index("merchant_id")
    rows = []
    txn_counter = txn_id_start

    engagement_mean_mult = ENGAGEMENT_MULT
    for _, ch in cardholders_df.iterrows():
        base_n = TXN_PER_CARDHOLDER_MEAN * engagement_mean_mult[ch["engagement_tier"]]
        n_txn = int(np.clip(r.lognormal(math.log(max(base_n, 1)), 0.45), 3, 500))

        daypart_p = np.array([ch["daypart_availability"][d] for d in DAYPARTS])
        daypart_p = daypart_p / daypart_p.sum()
        daypart_draws = r.choice(5, size=n_txn, p=daypart_p)

        cat_ids_arr = np.array(CATEGORY_IDS)
        base_affinity = np.array([ch["category_affinity"][c] for c in CATEGORY_IDS])

        home_lat, home_lng = DISTRICT_CENTROIDS[ch["home_district"]]
        work_lat, work_lng = DISTRICT_CENTROIDS[ch["work_district"]]
        is_traveller = ch["persona_id"] == 4

        for dp_idx in range(5):
            daypart = DAYPARTS[dp_idx]
            bucket_mask = daypart_draws == dp_idx
            bucket_size = int(bucket_mask.sum())
            if bucket_size == 0:
                continue

            boost = np.ones(len(CATEGORY_IDS))
            for i, cid in enumerate(CATEGORY_IDS):
                if CATEGORY_BY_ID[cid]["daypart_peak"] == daypart:
                    boost[i] = 1.6
            cat_p = base_affinity * boost
            cat_p = cat_p / cat_p.sum()
            cat_draws = r.choice(len(CATEGORY_IDS), size=bucket_size, p=cat_p)

            for cat_i in np.unique(cat_draws):
                cat_id = CATEGORY_IDS[cat_i]
                n_this = int((cat_draws == cat_i).sum())
                cat_merchants = cat_merchant_idx[cat_id]
                if len(cat_merchants) == 0:
                    continue
                mw = merchant_weights_for_cardholder(
                    cat_merchants, home_lat, home_lng, work_lat, work_lng,
                    ch["price_band_pref"], daypart)
                merch_draws = r.choice(len(cat_merchants), size=n_this, p=mw)
                day_idx_draws = r.choice(N_DAYS, size=n_this, p=cat_daily_weights[cat_id])

                lo_hi = CATEGORY_BY_ID[cat_id]["ticket_range_sgd"]
                for k in range(n_this):
                    merch_row = cat_merchants.iloc[merch_draws[k]]
                    d = ALL_DATES[day_idx_draws[k]]
                    h_lo, h_hi = DAYPART_HOURS[daypart]
                    hour = int(r.integers(h_lo, h_hi))
                    minute = int(r.integers(0, 60))
                    second = int(r.integers(0, 60))
                    dt = datetime(d.year, d.month, d.day, hour, minute, second)
                    amount = _sample_amount(r, lo_hi[0], lo_hi[1], merch_row["price_band"])
                    channel = _channel_for_category(cat_id, r)
                    country = _country_for(r, is_traveller, merch_row["catchment_type"])
                    descs, dweights = descriptor_lookup[merch_row["merchant_id"]]
                    descriptor = descs[r.choice(len(descs), p=dweights)] if len(descs) > 1 else descs[0]
                    rows.append((
                        f"T{txn_counter:08d}", ch["card_id"], merch_row["merchant_id"],
                        descriptor, int(merch_row["mcc"]),
                        round(amount, 2), dt, channel, country, int(merch_row["postal_district"]),
                    ))
                    txn_counter += 1

    cols = ["txn_id", "card_id", "merchant_id", "descriptor_raw", "mcc", "amount_sgd",
            "txn_datetime", "channel", "country", "merchant_district"]
    df = pd.DataFrame(rows, columns=cols)
    return df, txn_counter


# ============================================================================
# 7. PLANTED HERO PATTERNS
# ============================================================================

WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
H1_SUPPRESS_FACTOR = 0.6  # Tue/Wed/Thu 14-17 runs 40% below its own weekday-matched baseline


def build_weekday_date_index():
    """weekday(0=Mon) -> (day_indices, normalized trend/month weights)."""
    idx = {wd: [] for wd in range(7)}
    for i, d in enumerate(ALL_DATES):
        idx[d.weekday()].append(i)
    out = {}
    for wd, day_idxs in idx.items():
        w = np.array([_day_trend(i) * MONTH_MULT[f"{ALL_DATES[i].year}-{ALL_DATES[i].month:02d}"]
                      for i in day_idxs])
        out[wd] = (np.array(day_idxs), w / w.sum())
    return out


def weekday_daypart_table(daypart_profile, suppress=False):
    """7x5 joint pmf over (weekday, daypart), flat weekday marginal times the
    merchant's own daypart profile, with the H1 gap applied when suppress=True."""
    base = np.array([daypart_profile[d] for d in DAYPARTS])
    table = np.tile(base, (7, 1))  # 7 weekdays x 5 dayparts
    if suppress:
        aft_idx = DAYPARTS.index("afternoon")
        for wd in (1, 2, 3):  # Tue, Wed, Thu
            table[wd, aft_idx] *= H1_SUPPRESS_FACTOR
    table = table / table.sum()
    return table


def sample_hero_visits(r, n_visits, weekday_date_index, table):
    flat = table.flatten()
    draws = r.choice(len(flat), size=n_visits, p=flat)
    weekdays = draws // 5
    dayparts = draws % 5
    dates = []
    for wd in weekdays:
        idxs, w = weekday_date_index[wd]
        day_i = idxs[r.choice(len(idxs), p=w)]
        dates.append(ALL_DATES[day_i])
    return dates, dayparts


def _make_txn_row(txn_counter, card_id, merch_row, descriptor, amount, dt, channel, country):
    mid = merch_row["merchant_id"] if "merchant_id" in merch_row.index else merch_row.name
    return (
        f"T{txn_counter:08d}", card_id, mid, descriptor,
        int(merch_row["mcc"]), round(amount, 2), dt, channel, country,
        int(merch_row["postal_district"]),
    )


def generate_h1_transactions(cardholders_df, merchants_df, cohorts, descriptor_lookup, txn_id_start):
    r = np.random.default_rng(SEED + 5)
    m0001 = merchants_df.set_index("merchant_id").loc["M0001"]
    m0055 = merchants_df.set_index("merchant_id").loc["M0055"]
    ch_by_id = cardholders_df.set_index("card_id")
    wd_index = build_weekday_date_index()
    table_m0001 = weekday_daypart_table(m0001["daypart_profile"], suppress=True)
    table_m0055 = weekday_daypart_table(m0055["daypart_profile"], suppress=False)

    rows = []
    txn_counter = txn_id_start
    lo_hi = CATEGORY_BY_ID["cafe"]["ticket_range_sgd"]

    def visits_for(card_id, merch_row, table, n_visits, price_pref):
        nonlocal txn_counter
        dates, dayparts = sample_hero_visits(r, n_visits, wd_index, table)
        descs, dweights = descriptor_lookup[merch_row.name]
        for dt_date, dp in zip(dates, dayparts):
            daypart = DAYPARTS[dp]
            h_lo, h_hi = DAYPART_HOURS[daypart]
            hour = int(r.integers(h_lo, h_hi))
            minute = int(r.integers(0, 60))
            second = int(r.integers(0, 60))
            dt = datetime(dt_date.year, dt_date.month, dt_date.day, hour, minute, second)
            amount = _sample_amount(r, lo_hi[0], lo_hi[1], merch_row["price_band"])
            descriptor = descs[r.choice(len(descs), p=dweights)] if len(descs) > 1 else descs[0]
            channel = _channel_for_category("cafe", r)
            country = "SG"
            rows.append(_make_txn_row(txn_counter, card_id, merch_row, descriptor, amount, dt, channel, country))
            txn_counter += 1

    # a_only (excluding Alvin, handled separately): visit only M0001
    for card_id in cohorts["h1_a_only"]:
        if card_id == cohorts["showcase"]["alvin"]:
            continue
        n_visits = int(np.clip(r.lognormal(math.log(30), 0.4), 8, 90))
        visits_for(card_id, m0001, table_m0001, n_visits, ch_by_id.loc[card_id, "price_band_pref"])

    # overlap: visit both M0001 and M0055
    for card_id in cohorts["h1_overlap"]:
        n1 = int(np.clip(r.lognormal(math.log(16), 0.4), 5, 60))
        n2 = int(np.clip(r.lognormal(math.log(16), 0.4), 5, 60))
        visits_for(card_id, m0001, table_m0001, n1, ch_by_id.loc[card_id, "price_band_pref"])
        visits_for(card_id, m0055, table_m0055, n2, ch_by_id.loc[card_id, "price_band_pref"])

    # b_only (excluding Bernice, handled separately): visit only M0055
    for card_id in cohorts["h1_b_only"]:
        if card_id == cohorts["showcase"]["bernice"]:
            continue
        n_visits = int(np.clip(r.lognormal(math.log(28), 0.4), 8, 90))
        visits_for(card_id, m0055, table_m0055, n_visits, ch_by_id.loc[card_id, "price_band_pref"])

    cols = ["txn_id", "card_id", "merchant_id", "descriptor_raw", "mcc", "amount_sgd",
            "txn_datetime", "channel", "country", "merchant_district"]
    df = pd.DataFrame(rows, columns=cols)
    return df, txn_counter


def _weekday_dates_in_period():
    return [d for d in ALL_DATES if d.weekday() < 5]


def generate_showcase_transactions(cardholders_df, merchants_df, cohorts, descriptor_lookup, txn_id_start):
    """Hand-specified, deterministic transaction histories for the six showcase
    personas. Numbers here are the ground truth that signature_pattern strings
    (built later in showcase_personas.json) must quote verbatim."""
    r = np.random.default_rng(SEED + 6)
    txn_counter = txn_id_start
    rows = []
    m_by_id = merchants_df.set_index("merchant_id")

    def desc_for(mid):
        descs, w = descriptor_lookup[mid]
        return descs[0]

    def add_row(card_id, mid, amount, dt, channel="pos", country="SG"):
        nonlocal txn_counter
        mrow = m_by_id.loc[mid]
        rows.append(_make_txn_row(txn_counter, card_id, mrow, desc_for(mid), amount, dt, channel, country))
        txn_counter += 1

    # --- Alvin: 127 visits, all M0001, same flat white, ~8:40am, weekdays only.
    alvin_id = cohorts["showcase"]["alvin"]
    weekdays = _weekday_dates_in_period()
    chosen_idx = np.sort(r.choice(len(weekdays), size=127, replace=False))
    for i in chosen_idx:
        d = weekdays[i]
        minute_jitter = int(r.integers(-3, 4))
        dt = datetime(d.year, d.month, d.day, 8, max(0, min(59, 40 + minute_jitter)), int(r.integers(0, 60)))
        add_row(alvin_id, "M0001", 6.20, dt, channel="contactless")

    # --- Bernice: ~4 days/week, all M0055, same coffee, ~8:40am, zero at M0001.
    bernice_id = cohorts["showcase"]["bernice"]
    n_bernice = 205
    chosen_idx = np.sort(r.choice(len(weekdays), size=n_bernice, replace=False))
    for i in chosen_idx:
        d = weekdays[i]
        minute_jitter = int(r.integers(-4, 5))
        dt = datetime(d.year, d.month, d.day, 8, max(0, min(59, 42 + minute_jitter)), int(r.integers(0, 60)))
        add_row(bernice_id, "M0055", 6.50, dt, channel="contactless")

    # --- Charles: price-insensitive premium spend, average ticket S$180, never a voucher.
    charles_id = cohorts["showcase"]["charles"]
    premium_cats = ["japanese", "bar_pub", "apparel", "electronics"]
    non_hero = ~merchants_df["merchant_id"].isin(HERO_MERCHANT_IDS)
    premium_merchants = {c: merchants_df[(merchants_df["category"] == c) & non_hero].iloc[0]["merchant_id"]
                          for c in premium_cats}
    n_charles = 46
    amounts = []
    dates_pool = r.choice(N_DAYS, size=n_charles, replace=False)
    for k in range(n_charles):
        cat = premium_cats[k % len(premium_cats)]
        mid = premium_merchants[cat]
        d = ALL_DATES[dates_pool[k]]
        hour = int(r.integers(11, 22))
        base_amt = float(r.normal(180, 55))
        amounts.append(base_amt)
    # rescale so the mean is exactly 180.00
    amounts = np.array(amounts)
    amounts = amounts * (180.0 / amounts.mean())
    amounts = np.clip(amounts, 40, 520)
    amounts = amounts * (180.0 / amounts.mean())
    for k in range(n_charles):
        cat = premium_cats[k % len(premium_cats)]
        mid = premium_merchants[cat]
        d = ALL_DATES[dates_pool[k]]
        hour = int(r.integers(11, 22))
        dt = datetime(d.year, d.month, d.day, hour, int(r.integers(0, 60)), int(r.integers(0, 60)))
        add_row(charles_id, mid, round(float(amounts[k]), 2), dt, channel="pos",
                country="SG" if r.random() > 0.15 else COUNTRY_POOL[r.integers(0, len(COUNTRY_POOL))])

    # --- Denise: bursty apparel buyer. Hand-placed burst days, one preceded by
    # exactly a 41-day silent gap and summing to S$430.
    denise_id = cohorts["showcase"]["denise"]
    apparel_merchant = merchants_df[(merchants_df["category"] == "apparel") & non_hero].iloc[0]["merchant_id"]
    # Engineered so the 2025-12-14 -> 2026-01-24 gap is exactly 41 days (the
    # longest silent stretch in her year) and that burst sums to exactly S$430
    # — the two numbers the signature_pattern line quotes verbatim.
    burst_specs = [
        (date(2025, 7, 15), [55.0, 40.0]),
        (date(2025, 8, 20), [68.0, 50.0, 30.0]),
        (date(2025, 9, 28), [45.0, 60.0]),
        (date(2025, 11, 5), [90.0, 65.0]),
        (date(2025, 12, 14), [70.0, 55.0, 40.0]),
        (date(2026, 1, 24), [180.0, 150.0, 100.0]),  # sums to 430 — the 41-day-gap burst
        (date(2026, 3, 1), [60.0, 45.0]),
        (date(2026, 4, 8), [95.0, 70.0, 50.0]),
        (date(2026, 5, 15), [40.0, 35.0]),
        (date(2026, 6, 10), [120.0, 80.0]),
    ]
    assert sum(burst_specs[5][1]) == 430.0
    assert (burst_specs[5][0] - burst_specs[4][0]).days == 41
    _gaps = [(burst_specs[i + 1][0] - burst_specs[i][0]).days for i in range(len(burst_specs) - 1)]
    assert max(_gaps) == 41, _gaps  # the engineered gap must be the longest of the year
    for d, amts in burst_specs:
        for j, amt in enumerate(amts):
            hour = 13 + j  # "a single afternoon"
            dt = datetime(d.year, d.month, d.day, hour, int(r.integers(0, 60)), int(r.integers(0, 60)))
            add_row(denise_id, apparel_merchant, amt, dt, channel="pos")

    # --- Edwin: 142 transactions, average S$9, spread across many distinct merchants.
    edwin_id = cohorts["showcase"]["edwin"]
    diverse_cats = ["bubble_tea", "fast_food", "hawker_kopitiam", "bakery_dessert", "cafe"]
    candidate_merchants = merchants_df[merchants_df["category"].isin(diverse_cats) & non_hero]["merchant_id"].tolist()
    n_edwin = 142
    merch_choices = r.choice(candidate_merchants, size=n_edwin, replace=True)
    date_choices = np.sort(r.choice(N_DAYS, size=n_edwin, replace=True))
    amt_raw = r.normal(9.0, 2.2, size=n_edwin)
    amt_raw = np.clip(amt_raw, 3.5, 18.0)
    amt_raw = amt_raw * (9.0 / amt_raw.mean())
    amt_raw = np.round(amt_raw, 2)
    for k in range(n_edwin):
        d = ALL_DATES[date_choices[k]]
        hour = int(r.integers(10, 22))
        dt = datetime(d.year, d.month, d.day, hour, int(r.integers(0, 60)), int(r.integers(0, 60)))
        add_row(edwin_id, merch_choices[k], float(amt_raw[k]), dt, channel="contactless")

    # --- Farah: 9 card transactions in 12 months, all at the same clinic.
    farah_id = cohorts["showcase"]["farah"]
    clinic_merchant = merchants_df[merchants_df["category"] == "clinic_wellness"].iloc[0]["merchant_id"]
    farah_day_idxs = sorted(r.choice(N_DAYS, size=9, replace=False))
    for i in farah_day_idxs:
        d = ALL_DATES[i]
        hour = int(r.integers(10, 17))
        dt = datetime(d.year, d.month, d.day, hour, int(r.integers(0, 60)), int(r.integers(0, 60)))
        amt = round(float(r.uniform(45, 95)), 2)
        add_row(farah_id, clinic_merchant, amt, dt, channel="pos")

    cols = ["txn_id", "card_id", "merchant_id", "descriptor_raw", "mcc", "amount_sgd",
            "txn_datetime", "channel", "country", "merchant_district"]
    df = pd.DataFrame(rows, columns=cols)

    facts = dict(
        alvin_visits=127, alvin_merchant="M0001",
        bernice_visits=n_bernice, bernice_merchant="M0055",
        charles_avg_ticket=round(float(np.mean(amounts)), 2), charles_n=n_charles,
        denise_gap_days=41, denise_burst_total=430.0,
        edwin_n=n_edwin, edwin_avg=round(float(np.mean(amt_raw)), 2),
        farah_n=9, farah_merchant=clinic_merchant,
    )
    return df, txn_counter, facts


def apply_h3_seasonal_override(card_txns_df):
    """H3 — resample M0003's transaction dates onto the post-CNY-trough curve,
    keeping each transaction's time-of-day (and therefore daypart) unchanged."""
    r = np.random.default_rng(SEED + 7)
    mask = card_txns_df["merchant_id"] == "M0003"
    n = int(mask.sum())
    if n == 0:
        return card_txns_df
    weights = h3_daily_weights()
    day_idxs = r.choice(N_DAYS, size=n, p=weights)
    new_dts = []
    for i, old_dt in zip(day_idxs, card_txns_df.loc[mask, "txn_datetime"]):
        d = ALL_DATES[i]
        new_dts.append(datetime(d.year, d.month, d.day, old_dt.hour, old_dt.minute, old_dt.second))
    card_txns_df.loc[mask, "txn_datetime"] = new_dts
    return card_txns_df


# ============================================================================
# 6b. ACQUIRING TRANSACTIONS — data/raw/acquiring_transactions.parquet
#     (hero merchants only: M0001, M0002, M0003)
# ============================================================================

CARD_SCHEMES = ["visa", "mastercard", "amex", "unionpay"]
CATCHMENT_FOREIGN_SHARE = {"neighbourhood": 0.03, "office": 0.05, "transit": 0.10, "destination": 0.18}
HERO_ACQUIRING_MERCHANTS = ["M0001", "M0002", "M0003"]
TARGET_OCBC_SHARE = 0.25


def generate_acquiring_transactions(card_txns_df, merchants_df):
    r = np.random.default_rng(SEED + 8)
    m_by_id = merchants_df.set_index("merchant_id")
    rows = []
    txn_counter = 1

    for mid in HERO_ACQUIRING_MERCHANTS:
        mrow = m_by_id.loc[mid]
        acq_start = date.fromisoformat(mrow["acquiring_start_date"])
        sub = card_txns_df[(card_txns_df["merchant_id"] == mid) &
                            (card_txns_df["txn_datetime"].dt.date >= acq_start)].copy()
        n_ocbc = len(sub)
        terminals = [f"{mid}-T{k:02d}" for k in range(1, 1 + int(r.integers(1, 4)))]

        for _, txn in sub.iterrows():
            scheme = r.choice(["visa", "mastercard"], p=[0.6, 0.4])
            # Reuse the card-side txn_id verbatim: acquiring/issuing join consistency
            # requires identical txn_id, amount and timestamp for OCBC-card rows.
            rows.append((
                txn["txn_id"], mid, terminals[r.integers(0, len(terminals))],
                txn["amount_sgd"], txn["txn_datetime"], scheme, "SG", True,
            ))

        target_total = int(round(n_ocbc / TARGET_OCBC_SHARE)) if n_ocbc > 0 else 0
        n_foreign = max(target_total - n_ocbc, 0)

        window_days = [d for d in ALL_DATES if d >= acq_start]
        if n_foreign > 0 and window_days:
            trend_w = np.array([_day_trend(ALL_DATES.index(d)) *
                                 MONTH_MULT[f"{d.year}-{d.month:02d}"] for d in window_days])
            trend_w = trend_w / trend_w.sum()
            day_choices = r.choice(len(window_days), size=n_foreign, p=trend_w)
            lo_hi = CATEGORY_BY_ID[mrow["category"]]["ticket_range_sgd"]
            foreign_share = CATCHMENT_FOREIGN_SHARE.get(mrow["catchment_type"], 0.05)
            for k in range(n_foreign):
                d = window_days[day_choices[k]]
                hour = int(r.integers(7, 23))
                dt = datetime(d.year, d.month, d.day, hour, int(r.integers(0, 60)), int(r.integers(0, 60)))
                amount = _sample_amount(r, lo_hi[0], lo_hi[1], mrow["price_band"])
                scheme = r.choice(CARD_SCHEMES, p=[0.45, 0.3, 0.15, 0.10])
                bin_country = "SG" if r.random() > foreign_share else COUNTRY_POOL[r.integers(0, len(COUNTRY_POOL))]
                rows.append((
                    f"A{txn_counter:08d}", mid, terminals[r.integers(0, len(terminals))],
                    round(amount, 2), dt, scheme, bin_country, False,
                ))
                txn_counter += 1

    cols = ["txn_id", "merchant_id", "terminal_id", "amount_sgd", "txn_datetime",
            "card_scheme", "card_bin_country", "is_ocbc_card"]
    df = pd.DataFrame(rows, columns=cols).sort_values("txn_datetime").reset_index(drop=True)
    return df


# ============================================================================
# 6c. Monthly acquiring totals for non-hero acquired merchants (feeds
#     merchant_profiles.json only — no raw transaction-level file, per spec).
# ============================================================================

PERIOD_MONTHS = sorted(set(f"{d.year}-{d.month:02d}" for d in ALL_DATES))


def synthesize_monthly_totals(merchant_row, seed_extra):
    r = np.random.default_rng(SEED + 9000 + seed_extra)
    cat = CATEGORY_BY_ID[merchant_row["category"]]
    lo, hi = cat["ticket_range_sgd"]
    freq_base = {"habitual": 260, "routine": 140, "considered": 55, "rare": 18}[merchant_row["frequency_archetype"]]
    scale = 0.6 + 0.3 * merchant_row["price_band"] / 4 + 0.4 * math.log1p(merchant_row["outlet_count"])
    monthly = []
    acq_start = date.fromisoformat(merchant_row["acquiring_start_date"]) if merchant_row["acquiring_start_date"] else None
    for month_key in PERIOD_MONTHS:
        y, mo = int(month_key[:4]), int(month_key[5:7])
        month_start = date(y, mo, 1)
        if acq_start and month_start < acq_start.replace(day=1):
            continue
        mult = MONTH_MULT[month_key]
        txn_count = max(int(r.normal(freq_base * scale * mult, freq_base * scale * 0.12)), 0)
        avg_ticket = _sample_amount(r, lo, hi, merchant_row["price_band"])
        total_sales = round(txn_count * avg_ticket, 2)
        monthly.append(dict(month=month_key, txn_count=int(txn_count),
                             total_sales_sgd=total_sales, avg_ticket_sgd=round(avg_ticket, 2)))
    return monthly


# ============================================================================
# 8b. DEPOSIT FLOWS — public/data/deposit_flows.json
# ============================================================================

def build_deposit_flows(merchants_df):
    r = np.random.default_rng(SEED + 10)
    rows = []
    for _, m in merchants_df.iterrows():
        has_account = bool(m["is_ocbc_acquired"] and r.random() < 0.7)
        if not m["is_ocbc_acquired"]:
            continue
        cat = CATEGORY_BY_ID[m["category"]]
        base_inflow = 8000 * (0.6 + 0.3 * m["price_band"] / 4) * math.log1p(m["outlet_count"] + 1)
        acq_start = date.fromisoformat(m["acquiring_start_date"])
        balance = base_inflow * 0.5
        for month_key in PERIOD_MONTHS:
            y, mo = int(month_key[:4]), int(month_key[5:7])
            if date(y, mo, 1) < acq_start.replace(day=1):
                continue
            mult = MONTH_MULT[month_key]
            inflow_count = max(int(r.normal(40 * mult, 6)), 0)
            inflow_sgd = round(float(r.normal(base_inflow * mult, base_inflow * 0.1)), 2)
            settlement_sgd = round(inflow_sgd * float(r.uniform(0.55, 0.85)), 2)
            outflow_sgd = round((inflow_sgd + settlement_sgd) * float(r.uniform(0.75, 0.95)), 2)
            balance = max(balance + inflow_sgd + settlement_sgd - outflow_sgd, 0)
            rows.append(dict(
                merchant_id=m["merchant_id"], month=month_key,
                paynow_inflow_count=inflow_count, paynow_inflow_sgd=max(inflow_sgd, 0),
                card_settlement_sgd=max(settlement_sgd, 0), outflow_sgd=outflow_sgd,
                closing_balance_sgd=round(balance, 2),
                has_ocbc_operating_account=has_account,
            ))
    return rows


# ============================================================================
# 8. PRECOMPUTED AGGREGATES — public/data/*.json
# ============================================================================

def lift_and_support(cardholders_by_merchant, a, b, n_total):
    A = cardholders_by_merchant.get(a, set())
    B = cardholders_by_merchant.get(b, set())
    if not A or not B:
        return 0.0, 0
    support = len(A & B)
    p_a = len(A) / n_total
    p_a_given_b = support / len(B) if len(B) else 0.0
    lift = (p_a_given_b / p_a) if p_a > 0 else 0.0
    return lift, support


def over_under_index(cohort_ids, cardholders_df, field, top_n=3):
    pop = cardholders_df[field].value_counts(normalize=True)
    coh = cardholders_df[cardholders_df["card_id"].isin(cohort_ids)][field].value_counts(normalize=True)
    idx = {}
    for k in sorted(set(pop.index) | set(coh.index), key=str):
        p = pop.get(k, 1e-6)
        c = coh.get(k, 0.0)
        idx[k] = c / p if p > 0 else 0.0
    ranked = sorted(idx.items(), key=lambda kv: kv[1], reverse=True)
    over = [{"value": str(k), "index": round(float(v), 2)} for k, v in ranked if v > 1.2][:top_n]
    under = [{"value": str(k), "index": round(float(v), 2)} for k, v in ranked if v < 0.8][-top_n:]
    return over, under


def cohort_profile(cohort_ids, cardholders_df, merchants_df, card_txns_df, focus_category=None):
    sub = cardholders_df[cardholders_df["card_id"].isin(cohort_ids)]
    price_avg = round(float(sub["price_band_pref"].mean()), 2) if len(sub) else None
    daypart_tot = {d: 0.0 for d in DAYPARTS}
    for dpavail in sub["daypart_availability"]:
        for d in DAYPARTS:
            daypart_tot[d] += dpavail.get(d, 0)
    top_daypart = max(daypart_tot, key=daypart_tot.get) if len(sub) else None
    top_districts = sub["home_district"].value_counts().head(3).index.tolist() if len(sub) else []
    over_engagement, under_engagement = over_under_index(cohort_ids, cardholders_df, "engagement_tier")
    over_age, under_age = over_under_index(cohort_ids, cardholders_df, "age_band")
    return dict(
        avg_price_band_pref=price_avg,
        top_daypart=top_daypart,
        top_home_districts=[int(d) for d in top_districts],
        over_indexing=over_engagement + over_age,
        under_indexing=under_engagement + under_age,
    )


HERO_TARGETS = ["M0001", "M0002", "M0003", "M0004"]


def build_affinity_and_segments(card_txns_df, cardholders_df, merchants_df, cohorts):
    cardholders_by_merchant = card_txns_df.groupby("merchant_id")["card_id"].apply(set).to_dict()
    m_by_id = merchants_df.set_index("merchant_id")
    n_total = len(cardholders_df)

    affinity = {}
    segments = {}

    for a in HERO_TARGETS:
        a_cat = m_by_id.loc[a, "category"]
        a_acquired = bool(m_by_id.loc[a, "is_ocbc_acquired"])
        if not a_acquired:
            # H4 — prospect merchant: preview mode only, no personalized lift/segment.
            affinity[a] = {"available": False, "reason": "not_ocbc_acquired_preview_mode"}
            continue

        candidates = []
        for _, mrow in merchants_df.iterrows():
            b = mrow["merchant_id"]
            if b == a or mrow["is_aggregator"]:
                continue
            lift, support = lift_and_support(cardholders_by_merchant, a, b, n_total)
            if support >= 20:
                candidates.append(dict(merchant_id=b, category=mrow["category"],
                                        lift=round(float(lift), 3), support=int(support)))
        candidates.sort(key=lambda c: (-c["lift"], -c["support"]))
        top = candidates[:10]

        if len(top) == 0:
            # H2 — cold start: fall back to category + catchment peers instead of
            # M0002's own (thin) history.
            cat_peers = merchants_df[(merchants_df["category"] == a_cat) & (merchants_df["merchant_id"] != a)]
            peer_customers = set()
            for pid in cat_peers["merchant_id"]:
                peer_customers |= cardholders_by_merchant.get(pid, set())
            own_customers = cardholders_by_merchant.get(a, set())
            fallback_cohort = peer_customers - own_customers
            arow = m_by_id.loc[a]
            sub = cardholders_df[cardholders_df["card_id"].isin(fallback_cohort)]
            fit = sub[(sub["price_band_pref"] - arow["price_band"]).abs() <= 1.25]
            fallback_cohort = set(fit["card_id"])
            affinity[a] = {
                "available": True, "cold_start_fallback": True,
                "based_on_category_peers": cat_peers["merchant_id"].tolist(),
                "pairs": [],
            }
            size = len(fallback_cohort)
            segments[a] = [{
                "segment_id": f"{a}_category_catchment_fallback",
                "label": f"{CATEGORY_BY_ID[a_cat]['label']} shoppers at peer merchants, not yet at {a}",
                "source": "category_catchment_fallback",
                "based_on_merchants": cat_peers["merchant_id"].tolist(),
                "size": size if size >= MIN_SEGMENT_SIZE else None,
                "suppressed": size < MIN_SEGMENT_SIZE,
                "reason": None if size >= MIN_SEGMENT_SIZE else "below minimum segment size",
                "profile": cohort_profile(fallback_cohort, cardholders_df, merchants_df, card_txns_df)
                           if size >= MIN_SEGMENT_SIZE else None,
            }]
        else:
            affinity[a] = {"available": True, "cold_start_fallback": False, "pairs": top}
            seg_list = []
            for cand in top[:3]:
                b = cand["merchant_id"]
                target_cohort = cardholders_by_merchant.get(b, set()) - cardholders_by_merchant.get(a, set())
                arow = m_by_id.loc[a]
                sub = cardholders_df[cardholders_df["card_id"].isin(target_cohort)]
                fit = sub[(sub["price_band_pref"] - arow["price_band"]).abs() <= 1.5]
                filtered_cohort = set(fit["card_id"])
                size = len(filtered_cohort)
                seg_list.append({
                    "segment_id": f"{a}_lift_{b}",
                    "label": f"{b} regulars not yet at {a}",
                    "source": "lift",
                    "candidate_merchant": b,
                    "lift": cand["lift"], "support": cand["support"],
                    "size": size if size >= MIN_SEGMENT_SIZE else None,
                    "suppressed": size < MIN_SEGMENT_SIZE,
                    "reason": None if size >= MIN_SEGMENT_SIZE else "below minimum segment size",
                    "profile": cohort_profile(filtered_cohort, cardholders_df, merchants_df, card_txns_df)
                               if size >= MIN_SEGMENT_SIZE else None,
                })
            segments[a] = seg_list

    return affinity, segments, cardholders_by_merchant


def build_demand_gaps(card_txns_df, merchants_df):
    gaps = []
    m_by_id = merchants_df.set_index("merchant_id")

    # H1 — M0001 off-peak gap, Tue-Thu 14:00-17:00
    def afternoon_ratio(sub):
        """(Tue-Thu 14-17 rate/day) / (Mon+Fri 14-17 rate/day) for one merchant —
        normalizes away how peaked each merchant's own daypart mix happens to
        be, isolating the Tue-Thu-specific dip."""
        wd = sub["txn_datetime"].dt.weekday
        hr = sub["txn_datetime"].dt.hour
        aft = sub[(hr >= 14) & (hr < 17)]
        tue_thu_n = int(aft[aft["txn_datetime"].dt.weekday.isin([1, 2, 3])].shape[0])
        mon_fri_n = int(aft[aft["txn_datetime"].dt.weekday.isin([0, 4])].shape[0])
        if mon_fri_n == 0:
            return None, tue_thu_n, mon_fri_n
        return (tue_thu_n / 3) / (mon_fri_n / 2), tue_thu_n, mon_fri_n

    m1 = card_txns_df[card_txns_df["merchant_id"] == "M0001"]
    own_baseline_ratio, tue_thu_n, mon_fri_n = afternoon_ratio(m1)

    peer_ids = merchants_df[(merchants_df["category"] == "cafe") & (merchants_df["merchant_id"] != "M0001")]["merchant_id"]
    peer_ratios = []
    for pid in peer_ids:
        sub = card_txns_df[card_txns_df["merchant_id"] == pid]
        if len(sub) >= 100:
            ratio, _, _ = afternoon_ratio(sub)
            if ratio is not None:
                peer_ratios.append(ratio)
    peer_median_ratio = float(np.median(peer_ratios)) if peer_ratios else None

    gaps.append(dict(
        merchant_id="M0001", type="off_peak_gap",
        daypart_window="Tue-Thu 14:00-17:00",
        own_baseline_ratio=round(own_baseline_ratio, 3) if own_baseline_ratio else None,
        magnitude_vs_own_baseline_pct=round((own_baseline_ratio - 1) * 100, 1) if own_baseline_ratio else None,
        district_peer_median_ratio=round(peer_median_ratio, 3) if peer_median_ratio else None,
        magnitude_vs_district_peers_pct=round((own_baseline_ratio / peer_median_ratio - 1) * 100, 1)
                                        if (own_baseline_ratio and peer_median_ratio) else None,
        confidence="high" if mon_fri_n >= 30 else "medium",
    ))

    # H3 — M0003 seasonal trough, Mar-Apr 2026
    m3 = card_txns_df[card_txns_df["merchant_id"] == "M0003"].copy()
    m3["month"] = m3["txn_datetime"].dt.strftime("%Y-%m")
    monthly_counts = m3.groupby("month").size()
    trough_months = ["2026-03", "2026-04"]
    baseline_months = [mo for mo in PERIOD_MONTHS if mo not in trough_months]
    trough_avg = monthly_counts.reindex(trough_months).fillna(0).mean()
    baseline_avg = monthly_counts.reindex(baseline_months).fillna(0).mean()
    magnitude = (trough_avg / baseline_avg - 1) * 100 if baseline_avg else None
    gaps.append(dict(
        merchant_id="M0003", type="seasonal_trough",
        window="2026-03 to 2026-04",
        trough_avg_monthly_txns=round(float(trough_avg), 1),
        baseline_avg_monthly_txns=round(float(baseline_avg), 1),
        magnitude_vs_own_baseline_pct=round(float(magnitude), 1) if magnitude is not None else None,
        confidence="high",
        note="Consistent with post-CNY apparel seasonality; recovers to baseline by June, not a merchant-specific anomaly.",
    ))
    return gaps


CATCHMENT_FOREIGN_SHARE_DEFAULT = CATCHMENT_FOREIGN_SHARE


def build_benchmarks(card_txns_df, merchants_df):
    merged = card_txns_df.merge(
        merchants_df[["merchant_id", "category", "postal_district"]].rename(
            columns={"postal_district": "merchant_home_district"}),
        on="merchant_id", how="left")
    benchmarks = []
    grouped = merged.groupby(["category", "merchant_home_district"])
    for (cat_id, district), grp in grouped:
        n_merchants = merchants_df[(merchants_df["category"] == cat_id) &
                                    (merchants_df["postal_district"] == district)].shape[0]
        if n_merchants == 0:
            continue
        benchmarks.append(dict(
            category=cat_id, district=int(district),
            n_merchants=int(n_merchants),
            txn_count=int(len(grp)),
            avg_ticket_sgd=round(float(grp["amount_sgd"].mean()), 2),
            unique_cardholders=int(grp["card_id"].nunique()),
        ))
    return benchmarks


def build_merchant_profiles(card_txns_df, acquiring_df, merchants_df):
    profiles = {}
    m_by_id = merchants_df.set_index("merchant_id")
    acquired = merchants_df[merchants_df["is_ocbc_acquired"]]

    for mid in acquired["merchant_id"]:
        mrow = m_by_id.loc[mid]
        own_card_txns = card_txns_df[card_txns_df["merchant_id"] == mid]
        n_customers = own_card_txns["card_id"].nunique()
        repeat_customers = own_card_txns.groupby("card_id").size()
        repeat_rate = float((repeat_customers > 1).mean()) if n_customers else 0.0

        other_cat_txns = card_txns_df[card_txns_df["card_id"].isin(own_card_txns["card_id"].unique()) &
                                       (card_txns_df["merchant_id"] != mid)]
        cat_counts = merchants_df.set_index("merchant_id").loc[
            other_cat_txns["merchant_id"], "category"].value_counts() if len(other_cat_txns) else pd.Series(dtype=int)
        top_adjacent = [c for c in cat_counts.index if c not in AGGREGATOR_IDS and c != mrow["category"]][:5]

        if mid in HERO_ACQUIRING_MERCHANTS:
            acq_sub = acquiring_df[acquiring_df["merchant_id"] == mid].copy()
            acq_sub["date"] = acq_sub["txn_datetime"].dt.date
            daily = acq_sub.groupby("date").agg(txn_count=("txn_id", "count"),
                                                 total_sales_sgd=("amount_sgd", "sum")).reset_index()
            daily_map = {str(row["date"]): dict(txn_count=int(row["txn_count"]),
                                                 total_sales_sgd=round(float(row["total_sales_sgd"]), 2))
                         for _, row in daily.iterrows()}
            series = [dict(date=str(d), txn_count=daily_map.get(str(d), {}).get("txn_count", 0),
                            total_sales_sgd=daily_map.get(str(d), {}).get("total_sales_sgd", 0.0))
                      for d in ALL_DATES]
            granularity = "daily"
            foreign_share = float((acq_sub["card_bin_country"] != "SG").mean()) if len(acq_sub) else 0.0
            hours = acq_sub["txn_datetime"].dt.hour if len(acq_sub) else pd.Series([], dtype=int)
            ticket_p50 = round(float(acq_sub["amount_sgd"].median()), 2) if len(acq_sub) else None
            ticket_p90 = round(float(acq_sub["amount_sgd"].quantile(0.9)), 2) if len(acq_sub) else None
        else:
            series = synthesize_monthly_totals(mrow, seed_extra=int(mid[1:]))
            granularity = "monthly"
            foreign_share = CATCHMENT_FOREIGN_SHARE_DEFAULT.get(mrow["catchment_type"], 0.05)
            lo, hi = CATEGORY_BY_ID[mrow["category"]]["ticket_range_sgd"]
            ticket_p50 = round((lo + hi) / 2, 2)
            ticket_p90 = round(hi * 0.9, 2)

        profiles[mid] = dict(
            category=mrow["category"], granularity=granularity, series=series,
            daypart_profile=mrow["daypart_profile"],
            ticket_p50_sgd=ticket_p50, ticket_p90_sgd=ticket_p90,
            repeat_rate=round(repeat_rate, 3),
            foreign_card_share=round(foreign_share, 3),
            top_adjacent_categories=top_adjacent,
        )
    return profiles


def build_campaign_results(target_cohort_ids, cardholders_df):
    r = np.random.default_rng(SEED + 12)
    all_ids = sorted(target_cohort_ids)
    r.shuffle(all_ids)
    split = int(len(all_ids) * 0.6)
    treated = all_ids[:split]
    control = all_ids[split:]

    redemption_rate = 0.19
    n_redeemed = int(round(len(treated) * redemption_rate))
    control_organic_rate = 0.031
    n_control_converted = int(round(len(control) * control_organic_rate))

    avg_incremental_txns_per_redeemer = 1.6
    incremental_txns = round(n_redeemed * avg_incremental_txns_per_redeemer -
                              n_control_converted * (len(treated) / max(len(control), 1)), 1)
    incremental_txns = max(incremental_txns, 1.0)
    avg_ticket = 7.20
    incremental_sales = round(incremental_txns * avg_ticket, 2)

    reward_cost_per_redemption = 3.0
    ocbc_funded_share = 0.5
    total_reward_cost = round(n_redeemed * reward_cost_per_redemption, 2)
    ocbc_funded_cost = round(total_reward_cost * ocbc_funded_share, 2)
    merchant_funded_cost = round(total_reward_cost - ocbc_funded_cost, 2)
    net_contribution = round(incremental_sales - merchant_funded_cost, 2)

    return dict(
        merchant_id="M0001",
        campaign_name="Tanjong Pagar Afternoon Lift — S$2 off, 2-5pm",
        offer_terms="S$2 off any drink, redeemable Tue-Thu 14:00-17:00, one use per cardholder",
        treated_size=len(treated), control_size=len(control),
        redemption_count=n_redeemed,
        redemption_rate=round(n_redeemed / len(treated), 3) if treated else 0.0,
        control_organic_conversion_rate=control_organic_rate,
        incremental_transactions=incremental_txns,
        incremental_sales_sgd=incremental_sales,
        reward_cost_total_sgd=total_reward_cost,
        reward_cost_ocbc_funded_sgd=ocbc_funded_cost,
        reward_cost_merchant_funded_sgd=merchant_funded_cost,
        net_contribution_sgd=net_contribution,
        merchant_opened_ocbc_operating_account=True,
        account_opened_date="2026-05-12",
    )


def build_rationales(affinity, segments, demand_gaps, merchants_df):
    rationales = {}
    gaps_by_merchant = {g["merchant_id"]: g for g in demand_gaps}
    m_by_id = merchants_df.set_index("merchant_id")

    for mid in HERO_TARGETS:
        aff = affinity.get(mid, {})
        segs = segments.get(mid, [])
        if not aff.get("available", False):
            rationales[mid] = (f"{mid} is not yet an OCBC-acquired merchant, so this view uses district and "
                                f"category benchmarks only. Onboarding as an OCBC merchant unlocks personalised "
                                f"lift-based targeting.")
            continue
        if aff.get("cold_start_fallback"):
            seg = segs[0] if segs else None
            size_txt = f"{seg['size']:,}" if seg and seg.get("size") else "an as-yet-unconfirmed number of"
            rationales[mid] = (f"{mid} has too little acquiring history of its own to rank lookalike merchants "
                                f"with confidence, so this recommendation falls back to its category peers. "
                                f"{size_txt} cardholders who regularly visit the other bubble tea merchants in "
                                f"this benchmark set have never transacted at {mid}.")
            continue
        top_pairs = aff.get("pairs", [])
        if top_pairs:
            best = top_pairs[0]
            seg = segs[0] if segs else None
            size = seg["size"] if seg and seg.get("size") else None
            gap = gaps_by_merchant.get(mid)
            gap_txt = ""
            if gap and gap.get("type") == "off_peak_gap" and gap.get("magnitude_vs_own_baseline_pct"):
                gap_txt = (f" Their own {gap['daypart_window']} volume already runs "
                           f"{abs(gap['magnitude_vs_own_baseline_pct']):.0f}% below its weekday baseline, "
                           f"which is exactly the window this cohort could fill.")
            size_txt = f"{size:,} cardholders" if size else "a cohort"
            rationales[mid] = (f"Cardholders who regularly shop at {best['merchant_id']} are {best['lift']:.1f}x "
                                f"more likely than average to also shop at {mid} (support={best['support']}), "
                                f"but {size_txt} of them have never transacted here.{gap_txt}")
        else:
            rationales[mid] = f"No lookalike merchant met the minimum support threshold for {mid} yet."
    return rationales


def build_showcase_personas(cardholders_df, card_txns_df, cohorts, merchants_df, facts, target_cohort_ids):
    m_by_id = merchants_df.set_index("merchant_id")

    def top_merchants_for(card_id, n=5):
        sub = card_txns_df[card_txns_df["card_id"] == card_id]
        counts = sub.groupby("merchant_id").size().sort_values(ascending=False).head(n)
        out = []
        for mid, cnt in counts.items():
            out.append(dict(merchant_id=mid, canonical_name=m_by_id.loc[mid, "canonical_name"],
                             visit_count=int(cnt)))
        return out

    personas = [
        dict(
            id="alvin", name="Alvin", age=34, occupation="Accounts Manager", home_district=2,
            card_product=str(cardholders_df.set_index("card_id").loc[cohorts["showcase"]["alvin"], "card_product"]),
            description=("Creature of habit to an almost comic degree. Same flat white, same 8:40am, same "
                          "corner table, fourteen months running. Has never ordered anything else on the menu."),
            signature_pattern=f"{facts['alvin_visits']} visits to {facts['alvin_merchant']}. "
                               f"{facts['alvin_visits']} flat whites.",
            top_merchants=top_merchants_for(cohorts["showcase"]["alvin"]),
            cohort_membership=["h1_fingerprint"],
            is_illustrative=True,
        ),
        dict(
            id="bernice", name="Bernice", age=29, occupation="Consultant", home_district=4,
            card_product=str(cardholders_df.set_index("card_id").loc[cohorts["showcase"]["bernice"], "card_product"]),
            description=("Alvin's statistical twin. Same daypart, same price band, same category mix, same "
                          "S$6-7 ticket. The only difference is which way she turns out of the lift lobby."),
            signature_pattern=f"Buys the identical coffee, 200 metres away, 4 days a week. "
                               f"Zero visits to {facts['alvin_merchant']}.",
            top_merchants=top_merchants_for(cohorts["showcase"]["bernice"]),
            cohort_membership=["h1_target_cohort"],
            is_illustrative=True,
        ),
        dict(
            id="charles", name="Charles", age=52, occupation="Director", home_district=9,
            card_product=str(cardholders_df.set_index("card_id").loc[cohorts["showcase"]["charles"], "card_product"]),
            description=("Does not look at prices. Hotel dining, premium retail, business class. A 15% discount "
                          "changes nothing about his behaviour - he was buying it regardless."),
            signature_pattern=f"Average ticket S${facts['charles_avg_ticket']:.0f}. Has never used a voucher.",
            top_merchants=top_merchants_for(cohorts["showcase"]["charles"]),
            cohort_membership=["h1_exclusion"],
            is_illustrative=True,
        ),
        dict(
            id="denise", name="Denise", age=31, occupation="Tampines, two young kids", home_district=18,
            card_product=str(cardholders_df.set_index("card_id").loc[cohorts["showcase"]["denise"], "card_product"]),
            description=("Spends in bursts, not streams. Silent for six weeks, then clears a whole season's "
                          "shopping in one Saturday. Everything is timed to school holidays and CNY."),
            signature_pattern=f"Nothing for {facts['denise_gap_days']} days, then S${facts['denise_burst_total']:.0f} "
                               f"in a single afternoon.",
            top_merchants=top_merchants_for(cohorts["showcase"]["denise"]),
            cohort_membership=["h3_seasonal_apparel"],
            is_illustrative=True,
        ),
        dict(
            id="edwin", name="Edwin", age=26, occupation="Bugis, first job", home_district=7,
            card_product=str(cardholders_df.set_index("card_id").loc[cohorts["showcase"]["edwin"], "card_product"]),
            description=("Highest transaction count in the entire dataset and the smallest tickets. Tries every "
                          "new opening within a week. Loyal to nothing."),
            signature_pattern=f"{facts['edwin_n']} transactions. Average S${facts['edwin_avg']:.0f}.",
            top_merchants=top_merchants_for(cohorts["showcase"]["edwin"]),
            cohort_membership=["h2_cold_start_category_peer"],
            is_illustrative=True,
        ),
        dict(
            id="farah", name="Farah", age=58, occupation="Toa Payoh", home_district=12,
            card_product=str(cardholders_df.set_index("card_id").loc[cohorts["showcase"]["farah"], "card_product"]),
            description=("Card lives in a drawer. Kopitiam, wet market and hawker all in cash. The card comes "
                          "out for the clinic and almost nothing else."),
            signature_pattern=f"{facts['farah_n']} card transactions in 12 months. All at the same clinic.",
            top_merchants=top_merchants_for(cohorts["showcase"]["farah"]),
            cohort_membership=["dormant_reactivation"],
            is_illustrative=True,
        ),
    ]
    for p in personas:
        assert p["is_illustrative"] is True
    return personas


def _thin_out_merchant(df, merchant_id, keep_customers, seed_extra):
    """H2 — collapse a merchant's card-issuing customer base down to a
    handful of cardholders, so cardholders(M0002) is too small for ANY
    lookalike pair to reach the support>=20 threshold, forcing the
    category-and-catchment fallback rather than just thinning row counts."""
    r = np.random.default_rng(SEED + seed_extra)
    mask = df["merchant_id"] == merchant_id
    customers = sorted(df.loc[mask, "card_id"].unique().tolist())
    if len(customers) <= keep_customers:
        return df
    keep = set(r.choice(customers, size=keep_customers, replace=False))
    drop_idxs = df.index[mask & ~df["card_id"].isin(keep)]
    return df.drop(index=drop_idxs).reset_index(drop=True)


# ============================================================================
# MAIN
# ============================================================================

def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (np.ndarray,)):
        return o.tolist()
    if hasattr(o, "isoformat"):
        return o.isoformat()
    return str(o)


def _dump_json(obj, path):
    with open(path, "w") as f:
        json.dump(obj, f, indent=2, default=_json_default)


def _stringify_dict_cols(df, cols):
    df = df.copy()
    for c in cols:
        df[c] = df[c].apply(json.dumps)
    return df


def main():
    t0 = datetime.now()
    print("=" * 70)
    print("1-2. Taxonomy + merchants")
    build_taxonomy_json()
    merchants_df = build_merchants()
    _stringify_dict_cols(merchants_df, ["daypart_profile"]).to_parquet(
        os.path.join(RAW_DIR, "merchants.parquet"), index=False)

    print("3. Descriptors")
    descriptors_df = build_descriptors(merchants_df)
    descriptors_df.to_parquet(os.path.join(RAW_DIR, "merchant_descriptors.parquet"), index=False)
    descriptor_lookup = build_descriptor_lookup(descriptors_df)

    print("4. Cardholders + H1 hero cohort")
    cardholders_df, cohorts = build_cardholders_and_cohorts(merchants_df)
    _stringify_dict_cols(cardholders_df, ["category_affinity", "daypart_availability"]).to_parquet(
        os.path.join(RAW_DIR, "cardholders.parquet"), index=False)

    print("5. Transaction engine (generic population)")
    cat_daily_weights = precompute_category_daily_weights()
    cat_merchant_idx = build_category_merchant_index(merchants_df, exclude_ids={"M0001", "M0055"})
    showcase_ids_set = set(cohorts["showcase"].values())
    generic_pool_df = cardholders_df[~cardholders_df["card_id"].isin(showcase_ids_set)]
    generic_df, next_txn = generate_generic_transactions(
        generic_pool_df, merchants_df, cat_merchant_idx, cat_daily_weights, descriptor_lookup, txn_id_start=1)

    print("6. Injecting H1 hero cohort transactions (M0001 / M0055)")
    h1_df, next_txn = generate_h1_transactions(cardholders_df, merchants_df, cohorts, descriptor_lookup, next_txn)

    print("7. Showcase persona transactions (Alvin, Bernice, Charles, Denise, Edwin, Farah)")
    showcase_df, next_txn, facts = generate_showcase_transactions(
        cardholders_df, merchants_df, cohorts, descriptor_lookup, next_txn)

    print("8. Assembling card_transactions.parquet")
    card_txns_df = pd.concat([generic_df, h1_df, showcase_df], ignore_index=True)
    card_txns_df = apply_h3_seasonal_override(card_txns_df)
    card_txns_df = _thin_out_merchant(card_txns_df, "M0002", keep_customers=15, seed_extra=11)
    card_txns_df = card_txns_df.sort_values(["txn_datetime", "txn_id"]).reset_index(drop=True)
    card_txns_df.to_parquet(os.path.join(RAW_DIR, "card_transactions.parquet"), index=False)
    print(f"   {len(card_txns_df):,} card transactions")

    print("9. Acquiring transactions (hero merchants only)")
    acquiring_df = generate_acquiring_transactions(card_txns_df, merchants_df)
    acquiring_df.to_parquet(os.path.join(RAW_DIR, "acquiring_transactions.parquet"), index=False)
    print(f"   {len(acquiring_df):,} acquiring transactions")

    print("10. Deposit flows")
    deposit_rows = build_deposit_flows(merchants_df)
    _dump_json(deposit_rows, os.path.join(PUB_DIR, "deposit_flows.json"))

    print("11. Affinity + segments")
    affinity, segments, cardholders_by_merchant = build_affinity_and_segments(
        card_txns_df, cardholders_df, merchants_df, cohorts)
    _dump_json(affinity, os.path.join(PUB_DIR, "affinity.json"))
    _dump_json(segments, os.path.join(PUB_DIR, "segments.json"))

    print("12. Demand gaps")
    demand_gaps = build_demand_gaps(card_txns_df, merchants_df)
    _dump_json(demand_gaps, os.path.join(PUB_DIR, "demand_gaps.json"))

    print("13. Benchmarks")
    benchmarks = build_benchmarks(card_txns_df, merchants_df)
    _dump_json(benchmarks, os.path.join(PUB_DIR, "benchmarks.json"))

    print("14. Merchant profiles")
    merchant_profiles = build_merchant_profiles(card_txns_df, acquiring_df, merchants_df)
    _dump_json(merchant_profiles, os.path.join(PUB_DIR, "merchant_profiles.json"))

    print("15. Rationales")
    rationales = build_rationales(affinity, segments, demand_gaps, merchants_df)
    _dump_json(rationales, os.path.join(PUB_DIR, "rationales.json"))

    print("16. Campaign results (M0001)")
    m1_pairs = affinity.get("M0001", {}).get("pairs", [])
    best_b = m1_pairs[0]["merchant_id"] if m1_pairs else "M0055"
    target_cohort_m1 = cardholders_by_merchant.get(best_b, set()) - cardholders_by_merchant.get("M0001", set())
    arow = merchants_df.set_index("merchant_id").loc["M0001"]
    sub = cardholders_df[cardholders_df["card_id"].isin(target_cohort_m1)]
    fit = sub[(sub["price_band_pref"] - arow["price_band"]).abs() <= 1.5]
    target_cohort_m1_ids = set(fit["card_id"])
    campaign_results = build_campaign_results(target_cohort_m1_ids, cardholders_df)
    _dump_json(campaign_results, os.path.join(PUB_DIR, "campaign_results.json"))

    print("17. Showcase personas")
    showcase_personas = build_showcase_personas(
        cardholders_df, card_txns_df, cohorts, merchants_df, facts, target_cohort_m1_ids)
    _dump_json(showcase_personas, os.path.join(PUB_DIR, "showcase_personas.json"))

    print("18. Merchant directory (business names — not cardholder data)")
    merchant_directory = [
        dict(merchant_id=m["merchant_id"], canonical_name=m["canonical_name"], category=m["category"],
             postal_district=int(m["postal_district"]), price_band=int(m["price_band"]),
             catchment_type=m["catchment_type"], is_ocbc_acquired=bool(m["is_ocbc_acquired"]),
             is_aggregator=bool(m["is_aggregator"]))
        for _, m in merchants_df.iterrows()
    ]
    _dump_json(merchant_directory, os.path.join(PUB_DIR, "merchant_directory.json"))

    elapsed = (datetime.now() - t0).total_seconds()

    # ---------------------------------------------------------------- summary
    print("\n" + "=" * 70)
    print(f"DONE in {elapsed:.1f}s")
    print("=" * 70)
    print(f"{'file':<45}{'rows':>12}")
    print("-" * 57)
    raw_files = [
        ("data/raw/merchants.parquet", len(merchants_df)),
        ("data/raw/merchant_descriptors.parquet", len(descriptors_df)),
        ("data/raw/cardholders.parquet", len(cardholders_df)),
        ("data/raw/card_transactions.parquet", len(card_txns_df)),
        ("data/raw/acquiring_transactions.parquet", len(acquiring_df)),
    ]
    for name, n in raw_files:
        print(f"{name:<45}{n:>12,}")

    pub_files = [
        "taxonomy.json", "deposit_flows.json", "affinity.json", "segments.json",
        "demand_gaps.json", "benchmarks.json", "merchant_profiles.json",
        "rationales.json", "campaign_results.json", "showcase_personas.json",
        "merchant_directory.json",
    ]
    total_pub_bytes = 0
    print()
    print(f"{'public/data file':<45}{'bytes':>12}")
    print("-" * 57)
    for name in pub_files:
        p = os.path.join(PUB_DIR, name)
        sz = os.path.getsize(p)
        total_pub_bytes += sz
        print(f"{name:<45}{sz:>12,}")
    print("-" * 57)
    print(f"{'TOTAL public/data':<45}{total_pub_bytes:>12,}  ({total_pub_bytes/1024:.1f} KB)")

    print(f"\nH1 cohort (M0055 -> M0001 target): {len(target_cohort_m1_ids):,} cardholders")
    print(f"H1 lift(M0001,M0055) top pair: {m1_pairs[0] if m1_pairs else 'N/A'}")
    print("\nTop-5 lift pairs per hero merchant:")
    for mid in HERO_TARGETS:
        pairs = affinity.get(mid, {}).get("pairs", [])
        if pairs:
            print(f"  {mid}: " + ", ".join(f"{p['merchant_id']}(lift={p['lift']}, support={p['support']})"
                                            for p in pairs[:5]))
        elif affinity.get(mid, {}).get("cold_start_fallback"):
            print(f"  {mid}: cold-start fallback -> category peers "
                  f"{affinity[mid]['based_on_category_peers']}")
        else:
            print(f"  {mid}: not OCBC-acquired (preview mode, no lift)")

    return dict(
        merchants_df=merchants_df, descriptors_df=descriptors_df, cardholders_df=cardholders_df,
        card_txns_df=card_txns_df, acquiring_df=acquiring_df, cohorts=cohorts, facts=facts,
        affinity=affinity, segments=segments, target_cohort_m1_ids=target_cohort_m1_ids,
    )


if __name__ == "__main__":
    main()
