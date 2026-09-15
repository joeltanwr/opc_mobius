"""
generate.py — Seeded synthetic data generator for Mobius (OCBC hackathon build).

Writes data/raw/ ONLY. It plants patterns; pipeline/ detects them and is the only
thing that writes public/data/. See docs/MOBIUS_BUILD_BRIEF_V2.md §3 (patches 1–13).

Run:
    python generate.py
Then:
    python ../pipeline/run_all.py
    python ../validate.py
"""

import hashlib
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
N_CARDHOLDERS = 12_000
N_MERCHANTS = 200
PERIOD_START = "2025-10-01"          # brief §2 — shifted forward three months
PERIOD_END = "2026-09-30"
DEMO_CLOCK_DATE = "2026-09-11"       # brief §2 — hand-specified persona histories stop here
TXN_PER_CARDHOLDER_MEAN = 60
DESCRIPTOR_NOISE_RATE = 0.15
MIN_SEGMENT_SIZE = 250               # enforced in pipeline/, kept here for reference only
CONSENT_OPT_OUT_RATE = 0.20          # patch 5 — 15–25% false
MAILING_MISMATCH_RATE = 0.02         # patch 6
ACQUIRED_RATE = 0.40                 # of non-aggregator, non-reserved merchants → ~70 acquired

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_SCRIPT_DIR)
RAW_DIR = os.path.join(_SCRIPT_DIR, "data", "raw")
os.makedirs(RAW_DIR, exist_ok=True)

RNG = np.random.default_rng(SEED)
random.seed(SEED)

PERIOD_START_D = date.fromisoformat(PERIOD_START)
PERIOD_END_D = date.fromisoformat(PERIOD_END)
DEMO_CLOCK_D = date.fromisoformat(DEMO_CLOCK_DATE)
N_DAYS = (PERIOD_END_D - PERIOD_START_D).days + 1
ALL_DATES = [PERIOD_START_D + timedelta(days=i) for i in range(N_DAYS)]

DAYPARTS = ["morning", "lunch", "afternoon", "evening", "late"]
DAYPART_HOURS = {"morning": (7, 11), "lunch": (11, 14), "afternoon": (14, 17),
                 "evening": (17, 21), "late": (21, 24)}
PRICE_BANDS = [1, 2, 3, 4]
FREQ_ARCHETYPES = ["habitual", "routine", "considered", "rare"]
CATCHMENT_TYPES = ["neighbourhood", "office", "destination", "transit"]

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
# 2. TAXONOMY — data/raw/taxonomy.json (pipeline copies it to public/data/)
# ============================================================================

CATEGORIES = [
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
    "price_band": PRICE_BANDS, "frequency_archetype": FREQ_ARCHETYPES,
    "catchment_type": CATCHMENT_TYPES, "daypart": DAYPARTS,
}

ADJACENCY_GROUPS = [
    ["cafe", "bubble_tea", "bakery_dessert"],
    ["zichar_chinese_casual", "bar_pub"],
    ["gym_fitness", "clinic_wellness", "beauty_cosmetics"],
    ["hawker_kopitiam", "convenience_grocery"],
    ["japanese", "bar_pub"],
]


def build_taxonomy_json():
    taxonomy = {
        "categories": [
            {"id": c["id"], "label": c["label"], "group": c["group"],
             "typical_mcc": c["typical_mcc"], "ticket_range_sgd": c["ticket_range_sgd"],
             "frequency_archetype": c["frequency_archetype"], "daypart_peak": c["daypart_peak"],
             "is_aggregator": c["is_aggregator"]}
            for c in CATEGORIES
        ],
        "attributes": TAXONOMY_ATTRIBUTES,
    }
    with open(os.path.join(RAW_DIR, "taxonomy.json"), "w") as f:
        json.dump(taxonomy, f, indent=2)
    return taxonomy

# ============================================================================
# 3. MERCHANTS — data/raw/merchants.parquet
# ============================================================================

NAME_POOL = {
    "cafe": ["Kopi & Co", "The Daily Grind", "Nook Cafe", "Brew Lab", "The Roastery",
             "Morning Ritual", "Latte House", "Bean There Cafe", "Sunrise Cafe",
             "The Coffee Post", "Milk & Bean", "Filter Co", "Cafe Meridian"],
    "bubble_tea": ["Tea Alley", "Sweet Leaf", "Pearl & Milk", "Boba Loca",
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

# Brief §2 merchant table (patch 12). M0010 is retired; M0004 takes the not-acquired slot.
RESERVED = {
    "M0001": dict(category="cafe", name="Soujourner Coffee", district=2, acquired=True),
    "M0055": dict(category="cafe", name="Brew & Co.", district=2, acquired=False),
    "M0002": dict(category="bubble_tea", name="Boba Lane", district=11, acquired=True),
    "M0004": dict(category="cafe", name="Tanjong Kopi House", district=2, acquired=False),
    "M0003": dict(category="apparel", name=None, district=None, acquired=True),   # H3 plant, ordinary otherwise
}
HERO_MERCHANT_IDS = set(RESERVED.keys())
LOGIN_MERCHANTS = ["M0001", "M0002", "M0004"]

CHAIN_SUFFIXES = [" @ Suntec", " @ AMK Hub", " @ VivoCity", " @ Jurong Point", " @ Bugis Junction",
                   " @ Tampines Mall", " @ Plaza Sing", " @ Northpoint", " @ Clementi Mall",
                   " @ Junction 8", " @ Compass One", " @ Century Sq", " @ Causeway Point"]

OWNER_FIRST = ["Wei Ling", "Jun Hao", "Priya", "Marcus", "Siti", "Kelvin", "Mei Xin", "Arjun",
               "Nadia", "Daniel", "Hui Min", "Ryan", "Farhan", "Grace", "Zhi Wei", "Aisyah"]
OWNER_LAST = ["Tan", "Lim", "Nair", "Lee", "Rahman", "Ong", "Chua", "Menon", "Wong", "Koh",
              "Goh", "Ismail", "Ng", "Teo", "Seah", "Yeo"]
PRODUCTS = ["Business current account", "Merchant acquiring", "Business credit card",
            "Term loan", "FX services", "Trade financing"]

# The café daypart shape: real afternoon trade, so the Tue–Thu afternoon trough
# has something to be missing from. Used for peers; M0001 gets a fixed profile.
CAFE_DAYPART_ALPHA = np.array([4.0, 2.5, 3.0, 1.5, 0.5])
M0001_DAYPART_PROFILE = {"morning": 0.36, "lunch": 0.22, "afternoon": 0.26, "evening": 0.13, "late": 0.03}


def jitter_latlng(district, r):
    lat0, lng0 = DISTRICT_CENTROIDS[district]
    return lat0 + r.normal(0, 0.006), lng0 + r.normal(0, 0.006)


def build_merchants():
    r = np.random.default_rng(SEED + 1)
    n_per_cat = N_MERCHANTS // len(CATEGORIES)
    assert n_per_cat * len(CATEGORIES) == N_MERCHANTS
    all_ids = [f"M{i:04d}" for i in range(1, N_MERCHANTS + 1)]

    reserved_cat = {mid: v["category"] for mid, v in RESERVED.items()}
    remaining_ids = [mid for mid in all_ids if mid not in reserved_cat]
    r.shuffle(remaining_ids)
    slots_needed = {c["id"]: n_per_cat for c in CATEGORIES}
    for mid, cat in reserved_cat.items():
        slots_needed[cat] -= 1
    cat_assignment = dict(reserved_cat)
    idx = 0
    for c in CATEGORIES:
        for _ in range(slots_needed[c["id"]]):
            cat_assignment[remaining_ids[idx]] = c["id"]
            idx += 1
    assert idx == len(remaining_ids)

    rows = []
    used_names_by_cat = {}
    for mid in all_ids:
        cat_id = cat_assignment[mid]
        cat = CATEGORY_BY_ID[cat_id]
        res = RESERVED.get(mid)

        if res and res["name"]:
            name = res["name"]
        else:
            pool = NAME_POOL[cat_id]
            used = used_names_by_cat.setdefault(cat_id, set())
            avail = [n for n in pool if n not in used] or pool
            name = avail[r.integers(0, len(avail))]
            used.add(name)

        is_chain = (r.random() < 0.10) and mid not in HERO_MERCHANT_IDS
        outlet_count = int(r.integers(3, 41)) if is_chain else 1
        if mid == "M0001":
            outlet_count = 3      # Tanjong Pagar main, Raffles Place kiosk, Duxton — §7.4 needs outlets

        if r.random() < 0.10:
            other_cats = [c2 for c2 in CATEGORY_IDS if c2 != cat_id and c2 not in AGGREGATOR_IDS]
            mcc = int(r.choice(CATEGORY_BY_ID[other_cats[r.integers(0, len(other_cats))]]["typical_mcc"]))
        else:
            mcc = int(r.choice(cat["typical_mcc"]))

        lo, hi = cat["ticket_range_sgd"]
        band_center = 1 + 3 * (math.log(hi + 1) - math.log(8)) / (math.log(500) - math.log(8))
        band_center = min(max(band_center, 1), 4)
        price_band = int(np.clip(round(r.normal(band_center, 0.8)), 1, 4))
        if mid == "M0001":
            price_band = 2
        elif mid == "M0055":
            price_band = 3      # band tolerance 1 keeps Bernice (3) and excludes Charles (4)
        elif mid == "M0004":
            price_band = 2

        freq_archetype = cat["frequency_archetype"] if r.random() < 0.7 else FREQ_ARCHETYPES[r.integers(0, 4)]

        if cat_id in AGGREGATOR_IDS:
            catchment_type = "transit" if cat_id == "ride_hailing_transit" else "destination"
        elif mid in ("M0001", "M0055", "M0004"):
            catchment_type = "office"
        else:
            cw = {"neighbourhood": 0.4, "office": 0.25, "destination": 0.2, "transit": 0.15}
            catchment_type = r.choice(list(cw.keys()), p=list(cw.values()))

        if mid == "M0001":
            daypart_profile = dict(M0001_DAYPART_PROFILE)
        elif cat_id == "cafe":
            vec = r.dirichlet(CAFE_DAYPART_ALPHA)
            daypart_profile = {d: round(float(w), 4) for d, w in zip(DAYPARTS, vec)}
        else:
            alpha = np.ones(5) * 1.2
            alpha[DAYPARTS.index(cat["daypart_peak"])] = 6.0
            vec = r.dirichlet(alpha)
            daypart_profile = {d: round(float(w), 4) for d, w in zip(DAYPARTS, vec)}

        district = res["district"] if (res and res["district"]) else int(r.integers(1, 29))
        lat, lng = jitter_latlng(district, r)

        if cat_id in AGGREGATOR_IDS:
            is_ocbc_acquired = False
        elif res is not None:
            is_ocbc_acquired = res["acquired"]
        else:
            is_ocbc_acquired = r.random() < ACQUIRED_RATE

        if is_ocbc_acquired:
            if mid == "M0001":
                acquiring_start = PERIOD_START_D - timedelta(days=400)      # patch 13 — full history
            elif mid == "M0002":
                acquiring_start = PERIOD_END_D - timedelta(days=21)         # H2 cold start
            else:
                earliest = PERIOD_START_D - timedelta(days=365)
                span = (PERIOD_END_D - timedelta(days=180) - earliest).days
                acquiring_start = earliest + timedelta(days=int(r.integers(0, max(span, 1))))
        else:
            acquiring_start = None

        # Bank relationship (patch 3). OCBC business customers: all acquired merchants
        # plus M0004 (not acquired, but banks with OCBC — that is the cross-sell surface).
        is_ocbc_customer = bool(is_ocbc_acquired or mid == "M0004")
        if is_ocbc_customer:
            if mid == "M0002":
                relationship_start = date(2025, 11, 15)
            else:
                relationship_start = PERIOD_START_D - timedelta(days=int(r.integers(365, 8 * 365)))
        else:
            relationship_start = None

        # Score bands 1–5, 1 = best; the gate clears 1–3. Nullable.
        if is_ocbc_customer:
            internal_band = int(r.choice([1, 2, 3, 4, 5], p=[0.25, 0.35, 0.25, 0.10, 0.05]))
            external_band = int(r.choice([1, 2, 3, 4, 5], p=[0.20, 0.35, 0.30, 0.10, 0.05])) if r.random() < 0.85 else None
        else:
            internal_band, external_band = None, None

        outlets = []
        if mid == "M0001":
            # Third outlet sits outside the CBD corridor so that, alone, it cannot clear the 250 floor (merchant §7.4).
            outlets = [dict(outlet_id="M0001-O1", name="Tanjong Pagar (main)", district=2),
                       dict(outlet_id="M0001-O2", name="Raffles Place kiosk", district=1),
                       dict(outlet_id="M0001-O3", name="Paya Lebar kiosk", district=14)]
        else:
            for k in range(outlet_count):
                d = district if k == 0 else int(r.integers(1, 29))
                outlets.append(dict(outlet_id=f"{mid}-O{k + 1}", name=f"Outlet {k + 1}", district=d))

        owner_name = f"{OWNER_FIRST[r.integers(0, len(OWNER_FIRST))]} {OWNER_LAST[r.integers(0, len(OWNER_LAST))]}"
        owner_role = ["Owner", "Director", "Managing Partner"][r.integers(0, 3)]
        if is_ocbc_customer:
            n_prod = int(r.integers(1, 4))
            held = ["Business current account"] + [p for p in PRODUCTS[1:] if r.random() < n_prod / 6]
            if is_ocbc_acquired and "Merchant acquiring" not in held:
                held.append("Merchant acquiring")
            if not is_ocbc_acquired:
                held = [p for p in held if p != "Merchant acquiring"]
            last_contact = DEMO_CLOCK_D - timedelta(days=int(r.integers(3, 120)))
        else:
            held, last_contact = [], None

        rows.append(dict(
            merchant_id=mid, canonical_name=name + (CHAIN_SUFFIXES[r.integers(0, len(CHAIN_SUFFIXES))] if is_chain else ""),
            category=cat_id, sector=cat["label"], mcc=mcc, price_band=price_band,
            frequency_archetype=freq_archetype, catchment_type=catchment_type,
            daypart_profile=daypart_profile, postal_district=district,
            lat=round(float(lat), 5), lng=round(float(lng), 5),
            outlet_count=outlet_count, is_chain=bool(is_chain), outlets=outlets,
            is_aggregator=cat_id in AGGREGATOR_IDS,
            is_ocbc_acquired=bool(is_ocbc_acquired),
            acquiring_start_date=acquiring_start.isoformat() if acquiring_start else None,
            is_ocbc_customer=is_ocbc_customer,
            relationship_start_date=relationship_start.isoformat() if relationship_start else None,
            internal_score_band=internal_band, external_score_band=external_band,
            owner_name=owner_name if is_ocbc_customer else None,
            owner_role=owner_role if is_ocbc_customer else None,
            products_held=held, last_contact_date=last_contact.isoformat() if last_contact else None,
            operating_account_opened_date=None,
        ))

    df = pd.DataFrame(rows).sort_values("merchant_id").reset_index(drop=True)

    # --- Plants (patch 9), chosen deterministically among acquired non-hero merchants.
    acquired_non_hero = [m for m in df[df["is_ocbc_acquired"]]["merchant_id"] if m not in HERO_MERCHANT_IDS]
    global PLANT_BALANCE_FAIL, PLANT_BANDS_FAIL, PLANT_NO_SCORES
    PLANT_BALANCE_FAIL, PLANT_BANDS_FAIL, PLANT_NO_SCORES = acquired_non_hero[0], acquired_non_hero[1], acquired_non_hero[2]
    df.loc[df["merchant_id"] == PLANT_BANDS_FAIL, ["internal_score_band", "external_score_band"]] = [4, 5]
    df.loc[df["merchant_id"] == PLANT_NO_SCORES, ["internal_score_band", "external_score_band"]] = [None, None]
    df.loc[df["merchant_id"] == "M0001", ["internal_score_band", "external_score_band"]] = [1, 2]
    df.loc[df["merchant_id"] == "M0002", ["internal_score_band", "external_score_band"]] = [2, 3]
    df.loc[df["merchant_id"] == "M0004", ["internal_score_band", "external_score_band"]] = [2, 2]
    df.loc[df["merchant_id"] == PLANT_BALANCE_FAIL, ["internal_score_band", "external_score_band"]] = [2, 2]
    # Soujourner: settlement account with OCBC all along; operating account opened 8 Sep 2026 (brief §5).
    df.loc[df["merchant_id"] == "M0001", "operating_account_opened_date"] = "2026-09-08"
    df.loc[df["merchant_id"] == "M0001", "owner_name"] = "Mei Xin Tan"
    df.loc[df["merchant_id"] == "M0001", "owner_role"] = "Owner"
    df["internal_score_band"] = df["internal_score_band"].astype("Int64")
    df["external_score_band"] = df["external_score_band"].astype("Int64")
    return df


# ============================================================================
# 4. DESCRIPTORS — data/raw/merchant_descriptors.parquet
# ============================================================================

def _collapse_spacing(s):
    return s.replace(" ", "").upper()


def _diacritic_drift(s):
    subs = {"e": "é", "a": "á", "o": "ô", "i": "í"}
    out, replaced = [], False
    for ch in s:
        low = ch.lower()
        if not replaced and low in subs:
            out.append(subs[low]); replaced = True
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
            transforms = list(range(7)); r.shuffle(transforms)
            for t in transforms[:n_variants]:
                base = canonical
                if t == 0:
                    outlets = ["AMK HUB", "VIVOCITY", "BUGIS", "TAMPINES", "JURONG PT", "CLEMENTI"]
                    variant = f"{base} @ {outlets[r.integers(0, len(outlets))]}"
                elif t == 1:
                    variant = f"{base} {int(r.integers(100, 999))}"
                elif t == 2:
                    variant = _collapse_spacing(base) + " SG"
                elif t == 3:
                    variant = _diacritic_drift(base)
                elif t == 4:
                    variant = base[:22]
                elif t == 5:
                    variant = base.swapcase()
                else:
                    variant = f"{['SG*', 'PAYNOW-'][r.integers(0, 2)]}{base}"
                rows.append(dict(descriptor_raw=variant, merchant_id=m["merchant_id"], is_canonical=False))
    return pd.DataFrame(rows)


# ============================================================================
# 5. CARDHOLDERS — data/raw/cardholders.parquet
# ============================================================================

AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]
CARD_PRODUCTS = ["365", "Titanium", "Rewards", "Voyage", "90N"]
ENGAGEMENT_TIERS = ["high", "medium", "low", "dormant"]
ENGAGEMENT_MULT = {"high": 1.6, "medium": 1.0, "low": 0.55, "dormant": 0.10}
# Patch 8 — dormant by construction: ≤ 12 txns over the period (< 1/month); low ≥ 16.
ENGAGEMENT_CLIP = {"high": (24, 500), "medium": (18, 300), "low": (16, 150), "dormant": (2, 12)}
COUNTRY_POOL = ["MY", "ID", "TH", "JP", "AU"]

_BASE_W = 0.4


def _persona_vec(overrides):
    vec = {cid: _BASE_W for cid in CATEGORY_IDS}
    vec.update(overrides)
    return vec


PERSONAS = [
    dict(id=0, name="CBD office worker",
         category_weights=_persona_vec({"cafe": 8, "japanese": 5, "fast_food": 4, "gym_fitness": 3, "convenience_grocery": 3,
                                        "bakery_dessert": 3, "online_marketplace": 6, "ride_hailing_transit": 6, "bar_pub": 2}),
         price_band_pref=2.6, price_band_spread=0.7,
         daypart_weights={"morning": 0.28, "lunch": 0.30, "afternoon": 0.12, "evening": 0.22, "late": 0.08},
         home_districts=[19, 20, 12, 13, 27, 18], work_districts=[1, 2, 6, 9],
         engagement_dist={"high": 0.35, "medium": 0.4, "low": 0.2, "dormant": 0.05},
         age_bands=["25-34", "35-44"], card_products=["Titanium", "Rewards", "365"]),
    dict(id=1, name="Heartland family",
         category_weights=_persona_vec({"hawker_kopitiam": 8, "convenience_grocery": 7, "apparel": 3, "books_gifts": 3,
                                        "clinic_wellness": 3, "bakery_dessert": 3, "pet_services": 2, "fast_food": 3}),
         price_band_pref=1.8, price_band_spread=0.6,
         daypart_weights={"morning": 0.18, "lunch": 0.22, "afternoon": 0.22, "evening": 0.3, "late": 0.08},
         home_districts=[18, 19, 20, 22, 23, 25, 27, 28], work_districts=[18, 19, 20, 22, 23, 25, 27, 28],
         engagement_dist={"high": 0.2, "medium": 0.45, "low": 0.28, "dormant": 0.07},
         age_bands=["35-44", "45-54"], card_products=["365", "Rewards"]),
    dict(id=2, name="Young professional",
         category_weights=_persona_vec({"cafe": 7, "bubble_tea": 6, "bar_pub": 5, "beauty_cosmetics": 4, "apparel": 5,
                                        "online_marketplace": 6, "hair_nail_salon": 3, "japanese": 3}),
         price_band_pref=2.4, price_band_spread=0.8,
         daypart_weights={"morning": 0.15, "lunch": 0.2, "afternoon": 0.25, "evening": 0.28, "late": 0.12},
         home_districts=[1, 2, 3, 4, 7, 8, 9, 14, 15], work_districts=[1, 2, 3, 6, 7, 9],
         engagement_dist={"high": 0.4, "medium": 0.4, "low": 0.15, "dormant": 0.05},
         age_bands=["25-34"], card_products=["Rewards", "Titanium"]),
    dict(id=3, name="Student",
         category_weights=_persona_vec({"bubble_tea": 8, "fast_food": 6, "cinema_arcade": 4, "books_gifts": 3, "hawker_kopitiam": 5,
                                        "convenience_grocery": 3, "online_marketplace": 4}),
         price_band_pref=1.3, price_band_spread=0.5,
         daypart_weights={"morning": 0.1, "lunch": 0.25, "afternoon": 0.3, "evening": 0.25, "late": 0.1},
         home_districts=[13, 14, 19, 20, 21, 26, 28], work_districts=[13, 14, 19, 20, 21],
         engagement_dist={"high": 0.25, "medium": 0.35, "low": 0.3, "dormant": 0.1},
         age_bands=["18-24"], card_products=["90N"]),
    dict(id=4, name="Frequent traveller",
         category_weights=_persona_vec({"japanese": 6, "bar_pub": 4, "electronics": 3, "ride_hailing_transit": 7,
                                        "online_marketplace": 5, "apparel": 3, "cafe": 3}),
         price_band_pref=3.2, price_band_spread=0.7,
         daypart_weights={"morning": 0.2, "lunch": 0.2, "afternoon": 0.18, "evening": 0.28, "late": 0.14},
         home_districts=[9, 10, 11, 15, 16], work_districts=[1, 9, 10],
         engagement_dist={"high": 0.3, "medium": 0.4, "low": 0.22, "dormant": 0.08},
         age_bands=["35-44", "45-54"], card_products=["Voyage", "Titanium"]),
    dict(id=5, name="Retiree",
         category_weights=_persona_vec({"hawker_kopitiam": 8, "clinic_wellness": 6, "pet_services": 3, "bakery_dessert": 4,
                                        "convenience_grocery": 4, "books_gifts": 2}),
         price_band_pref=1.6, price_band_spread=0.5,
         daypart_weights={"morning": 0.32, "lunch": 0.24, "afternoon": 0.26, "evening": 0.14, "late": 0.04},
         home_districts=[12, 13, 19, 20, 23, 25, 26, 27, 28], work_districts=[],
         engagement_dist={"high": 0.1, "medium": 0.3, "low": 0.4, "dormant": 0.2},
         age_bands=["55-64", "65+"], card_products=["365"]),
    dict(id=6, name="Wellness regular",
         category_weights=_persona_vec({"gym_fitness": 8, "clinic_wellness": 6, "beauty_cosmetics": 5, "cafe": 5,
                                        "hair_nail_salon": 3, "convenience_grocery": 2}),
         price_band_pref=2.7, price_band_spread=0.7,
         daypart_weights={"morning": 0.34, "lunch": 0.14, "afternoon": 0.22, "evening": 0.24, "late": 0.06},
         home_districts=[3, 4, 5, 9, 10, 11, 15, 20], work_districts=[1, 2, 9, 10],
         engagement_dist={"high": 0.38, "medium": 0.38, "low": 0.18, "dormant": 0.06},
         age_bands=["25-34", "35-44"], card_products=["Rewards", "Titanium"]),
    dict(id=7, name="Weekend socialiser",
         category_weights=_persona_vec({"bar_pub": 7, "zichar_chinese_casual": 6, "cinema_arcade": 4, "japanese": 4,
                                        "ride_hailing_transit": 5, "cafe": 3}),
         price_band_pref=2.5, price_band_spread=0.8,
         daypart_weights={"morning": 0.08, "lunch": 0.18, "afternoon": 0.2, "evening": 0.32, "late": 0.22},
         home_districts=[7, 8, 14, 15, 16, 19], work_districts=[1, 6, 7, 8],
         engagement_dist={"high": 0.3, "medium": 0.4, "low": 0.22, "dormant": 0.08},
         age_bands=["25-34", "35-44"], card_products=["Rewards", "90N"]),
]
PERSONA_BY_ID = {p["id"]: p for p in PERSONAS}


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
        if persona["home_districts"] else int(r.integers(1, 29)))
    work_pool = persona["work_districts"] if persona["work_districts"] else [home]
    work = work_district_override if work_district_override is not None else work_pool[r.integers(0, len(work_pool))]
    age_band = persona["age_bands"][r.integers(0, len(persona["age_bands"]))]
    card_product = persona["card_products"][r.integers(0, len(persona["card_products"]))]
    tenure_months = int(r.integers(3, 97))
    tiers = list(persona["engagement_dist"].keys())
    engagement_tier = tiers[r.choice(len(tiers), p=list(persona["engagement_dist"].values()))]
    marketing_consent = bool(r.random() >= CONSENT_OPT_OUT_RATE)
    mailing_country = COUNTRY_POOL[r.integers(0, len(COUNTRY_POOL))] if r.random() < MAILING_MISMATCH_RATE else "SG"
    return dict(
        card_id=card_id, persona_id=persona["id"], category_affinity=category_affinity,
        price_band_pref=round(price_band_pref, 2), home_district=int(home), work_district=int(work),
        daypart_availability=daypart_availability, age_band=age_band, card_product=card_product,
        tenure_months=tenure_months, engagement_tier=engagement_tier,
        marketing_consent=marketing_consent, mailing_country=mailing_country,
    )


def _card_id(n):
    return f"CH{n:05d}"


# ----------------------------------------------------------------------------
# 5a. Showcase personas + H1 hero cohort
# ----------------------------------------------------------------------------
# CH00001..CH00006  showcase personas
# CH00007..         H1 hero cohort (a_only, overlap, b_only)
# then              generic population

SHOWCASE_IDS = {"alvin": "CH00001", "bernice": "CH00002", "charles": "CH00003",
                "denise": "CH00004", "edwin": "CH00005", "farah": "CH00006"}

# Sized so that (a) lift(M0001, M0055) clears 2.5 with N=12,000, (b) B \ A lands in
# [350, 800] after the past campaign converts ~67 of them, (c) Soujourner's OCBC customer
# base is ~2,000 so RFM segments and age bands can clear the 250 floor — and one can't.
N_H1_A_ONLY = 1300
N_H1_OVERLAP = 700
N_H1_B_ONLY = 800
N_H1_TOTAL = N_H1_A_ONLY + N_H1_OVERLAP + N_H1_B_ONLY
H1_FIRST_ID = 7


def build_cardholders_and_cohorts(merchants_df):
    r = np.random.default_rng(SEED + 3)
    m0001 = merchants_df.set_index("merchant_id").loc["M0001"]
    m0055 = merchants_df.set_index("merchant_id").loc["M0055"]
    rows = []
    cohorts = dict(showcase={}, h1_a_only=[], h1_overlap=[], h1_b_only=[])

    alvin = _sample_cardholder(PERSONA_BY_ID[0], r, SHOWCASE_IDS["alvin"], home_district_override=2, work_district_override=2)
    alvin.update(price_band_pref=float(m0001["price_band"]), engagement_tier="high", marketing_consent=True, mailing_country="SG",
                 daypart_availability={"morning": 0.72, "lunch": 0.08, "afternoon": 0.08, "evening": 0.08, "late": 0.04},
                 age_band="25-34")
    rows.append(alvin); cohorts["showcase"]["alvin"] = alvin["card_id"]

    bernice = _sample_cardholder(PERSONA_BY_ID[2], r, SHOWCASE_IDS["bernice"], home_district_override=4, work_district_override=2)
    bernice.update(price_band_pref=float(m0055["price_band"]), engagement_tier="high", marketing_consent=True, mailing_country="SG",
                   daypart_availability={"morning": 0.58, "lunch": 0.10, "afternoon": 0.20, "evening": 0.08, "late": 0.04},
                   age_band="25-34")
    rows.append(bernice); cohorts["showcase"]["bernice"] = bernice["card_id"]

    # Charles: home Orchard, office in Tanjong Pagar (so catchment passes and price band is the
    # reason he is excluded — brief §5).
    charles = _sample_cardholder(PERSONA_BY_ID[4], r, SHOWCASE_IDS["charles"], home_district_override=9, work_district_override=2)
    charles.update(price_band_pref=4.0, engagement_tier="medium", age_band="45-54", card_product="Voyage",
                   marketing_consent=True, mailing_country="SG",
                   daypart_availability={"morning": 0.25, "lunch": 0.25, "afternoon": 0.20, "evening": 0.22, "late": 0.08})
    rows.append(charles); cohorts["showcase"]["charles"] = charles["card_id"]

    denise = _sample_cardholder(PERSONA_BY_ID[1], r, SHOWCASE_IDS["denise"], home_district_override=18, work_district_override=18)
    denise.update(engagement_tier="medium", age_band="25-34", marketing_consent=True, mailing_country="SG")
    rows.append(denise); cohorts["showcase"]["denise"] = denise["card_id"]

    # Edwin: Bugis, first job in the CBD. Consented, so the only thing that stops his push is the cap.
    edwin = _sample_cardholder(PERSONA_BY_ID[2], r, SHOWCASE_IDS["edwin"], home_district_override=7, work_district_override=2)
    edwin.update(price_band_pref=1.2, engagement_tier="high", age_band="18-24", card_product="90N",
                 marketing_consent=True, mailing_country="SG",
                 daypart_availability={"morning": 0.20, "lunch": 0.25, "afternoon": 0.25, "evening": 0.20, "late": 0.10})
    rows.append(edwin); cohorts["showcase"]["edwin"] = edwin["card_id"]

    farah = _sample_cardholder(PERSONA_BY_ID[5], r, SHOWCASE_IDS["farah"], home_district_override=12, work_district_override=12)
    farah.update(engagement_tier="dormant", age_band="55-64", marketing_consent=True, mailing_country="SG")
    rows.append(farah); cohorts["showcase"]["farah"] = farah["card_id"]

    next_id = H1_FIRST_ID
    corridor_districts = [1, 2, 3, 4, 6]

    def make_corridor_cardholder(cid, persona_id):
        p = PERSONA_BY_ID[persona_id]
        ch = _sample_cardholder(p, r, cid,
                                home_district_override=corridor_districts[r.integers(0, len(corridor_districts))],
                                work_district_override=2)
        ch["price_band_pref"] = float(np.clip(r.normal((m0001["price_band"] + m0055["price_band"]) / 2, 0.4), 1, 4))
        dp = r.dirichlet(np.array([0.45, 0.15, 0.25, 0.1, 0.05]) * 15 + 0.1)
        ch["daypart_availability"] = {d: round(float(w), 4) for d, w in zip(DAYPARTS, dp)}
        ch["engagement_tier"] = "high" if r.random() < 0.5 else "medium"   # café regulars are not dormant
        if r.random() < 0.04:
            ch["age_band"] = "45-54"       # the band that lands below the 250 floor (patch 9)
        return ch

    for _ in range(N_H1_A_ONLY - 1):
        ch = make_corridor_cardholder(_card_id(next_id), 0 if r.random() < 0.6 else 2)
        rows.append(ch); cohorts["h1_a_only"].append(ch["card_id"]); next_id += 1
    cohorts["h1_a_only"].append(alvin["card_id"])

    for _ in range(N_H1_OVERLAP):
        ch = make_corridor_cardholder(_card_id(next_id), 0 if r.random() < 0.5 else 2)
        rows.append(ch); cohorts["h1_overlap"].append(ch["card_id"]); next_id += 1

    for _ in range(N_H1_B_ONLY - 1):
        ch = make_corridor_cardholder(_card_id(next_id), 2 if r.random() < 0.6 else 0)
        rows.append(ch); cohorts["h1_b_only"].append(ch["card_id"]); next_id += 1
    cohorts["h1_b_only"].append(bernice["card_id"])

    assert next_id == H1_FIRST_ID + (N_H1_TOTAL - 2)
    last_h1_id = next_id - 1

    n_generic = N_CARDHOLDERS - 6 - (N_H1_TOTAL - 2)
    persona_weights = np.array([0.14, 0.16, 0.16, 0.10, 0.09, 0.13, 0.11, 0.11])
    persona_weights = persona_weights / persona_weights.sum()
    persona_choices = r.choice(len(PERSONAS), size=n_generic, p=persona_weights)
    for i in range(n_generic):
        rows.append(_sample_cardholder(PERSONA_BY_ID[int(persona_choices[i])], r, _card_id(last_h1_id + 1 + i)))

    df = pd.DataFrame(rows).sort_values("card_id").reset_index(drop=True)
    assert len(df) == N_CARDHOLDERS and df["card_id"].is_unique
    return df, cohorts


# ============================================================================
# 6. TRANSACTION ENGINE (generic / emergent population)
# ============================================================================

MONTH_MULT = {
    "2025-10": 1.03, "2025-11": 1.08, "2025-12": 1.18, "2026-01": 1.05, "2026-02": 1.14,
    "2026-03": 0.94, "2026-04": 0.97, "2026-05": 1.00, "2026-06": 1.03, "2026-07": 1.02,
    "2026-08": 1.00, "2026-09": 1.00,
}
FNB_LIKE = {"cafe", "bubble_tea", "hawker_kopitiam", "zichar_chinese_casual", "japanese",
            "bakery_dessert", "fast_food", "bar_pub"}
# H3 — post-CNY apparel trough for M0003 (data only; seasonal detection is out of demo scope).
H3_MONTH_MULT = {
    "2025-10": 1.00, "2025-11": 1.12, "2025-12": 1.35, "2026-01": 1.20, "2026-02": 1.30,
    "2026-03": 0.55, "2026-04": 0.68, "2026-05": 0.85, "2026-06": 1.00, "2026-07": 0.98,
    "2026-08": 0.97, "2026-09": 1.00,
}
PERIOD_MONTHS = sorted(set(f"{d.year}-{d.month:02d}" for d in ALL_DATES))


def _day_trend(day_idx):
    return 0.92 + 0.16 * (day_idx / max(N_DAYS - 1, 1))


def precompute_category_daily_weights():
    weights = {}
    for cat_id in CATEGORY_IDS:
        arr = np.zeros(N_DAYS)
        for i, d in enumerate(ALL_DATES):
            w = _day_trend(i) * MONTH_MULT[f"{d.year}-{d.month:02d}"]
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
        w = _day_trend(i) * H3_MONTH_MULT[f"{d.year}-{d.month:02d}"]
        if d.weekday() in (5, 6):
            w *= 1.15
        arr[i] = w
    return arr / arr.sum()


def _haversine_km(lat1, lng1, lat2, lng2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1); dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


CATCHMENT_DECAY_KM = {"neighbourhood": 2.5, "office": 4.0, "transit": 6.0, "destination": 12.0}


def build_category_merchant_index(merchants_df, exclude_ids=()):
    """Per category: a dict of numpy arrays (fast row access inside the sampler)."""
    idx = {}
    for cat_id in CATEGORY_IDS:
        sub = merchants_df[(merchants_df["category"] == cat_id) & (~merchants_df["merchant_id"].isin(exclude_ids))]
        idx[cat_id] = dict(
            n=len(sub),
            merchant_id=sub["merchant_id"].to_numpy(),
            mcc=sub["mcc"].to_numpy(),
            price_band=sub["price_band"].to_numpy().astype(float),
            district=sub["postal_district"].to_numpy(),
            catchment=sub["catchment_type"].to_numpy(),
            lat=sub["lat"].to_numpy(), lng=sub["lng"].to_numpy(),
            decay=sub["catchment_type"].map(CATCHMENT_DECAY_KM).to_numpy(),
            daypart=np.array([[dp[d] for d in DAYPARTS] for dp in sub["daypart_profile"]]) if len(sub) else np.zeros((0, 5)),
        )
    return idx


def merchant_weights_for_cardholder(cm, home_lat, home_lng, work_lat, work_lng, price_pref, daypart_idx):
    n = cm["n"]
    if n == 0:
        return np.array([])
    dist_home = np.array([_haversine_km(home_lat, home_lng, la, ln) for la, ln in zip(cm["lat"], cm["lng"])])
    dist_work = np.array([_haversine_km(work_lat, work_lng, la, ln) for la, ln in zip(cm["lat"], cm["lng"])])
    dist = np.minimum(dist_home, dist_work)
    dist_w = np.exp(-dist / cm["decay"])
    price_w = np.exp(-((price_pref - cm["price_band"]) ** 2) / (2 * 1.1 ** 2))
    dp_w = cm["daypart"][:, daypart_idx]
    w = dist_w * price_w * (dp_w + 0.05)
    total = w.sum()
    return (w / total) if total > 0 else np.ones(n) / n


def _sample_amount(r, lo, hi, price_band):
    frac = (price_band - 1) / 3.0
    center = lo + (hi - lo) * (0.3 + 0.4 * frac)
    amt = r.lognormal(math.log(center + 1), 0.32) - 1
    return float(np.clip(amt, lo * 0.6, hi * 1.8))


def _channel_for_category(cat_id, r):
    if cat_id == "online_marketplace":
        return "ecom"
    if cat_id == "ride_hailing_transit":
        return "contactless" if r.random() < 0.3 else "ecom"
    u = r.random()
    return "pos" if u < 0.45 else ("contactless" if u < 0.95 else "ecom")


def _country_for(r, is_traveller, catchment_type):
    base_foreign = 0.22 if is_traveller else 0.08
    if catchment_type == "destination":
        base_foreign += 0.03
    return COUNTRY_POOL[r.integers(0, len(COUNTRY_POOL))] if r.random() < base_foreign else "SG"


def build_descriptor_lookup(descriptors_df):
    lookup = {}
    for mid, grp in descriptors_df.groupby("merchant_id"):
        descs = grp["descriptor_raw"].tolist(); is_canon = grp["is_canonical"].tolist()
        n_variants = len(descs) - 1
        if n_variants <= 0:
            lookup[mid] = (descs, np.array([1.0]))
        else:
            w = [0.8] + [0.2 / n_variants] * n_variants
            order = sorted(range(len(descs)), key=lambda i: not is_canon[i])
            lookup[mid] = ([descs[i] for i in order], np.array(w))
    return lookup


TXN_COLS = ["txn_id", "card_id", "merchant_id", "descriptor_raw", "mcc", "amount_sgd",
            "txn_datetime", "channel", "country", "merchant_district", "campaign_id"]


def generate_generic_transactions(cardholders_df, merchants_df, cat_merchant_idx, cat_daily_weights,
                                  descriptor_lookup, txn_id_start=1):
    r = np.random.default_rng(SEED + 4)
    rows = []
    txn_counter = txn_id_start
    for ch in cardholders_df.itertuples(index=False):
        tier = ch.engagement_tier
        base_n = TXN_PER_CARDHOLDER_MEAN * ENGAGEMENT_MULT[tier]
        lo_clip, hi_clip = ENGAGEMENT_CLIP[tier]
        n_txn = int(np.clip(r.lognormal(math.log(max(base_n, 1)), 0.4), lo_clip, hi_clip))

        daypart_p = np.array([ch.daypart_availability[d] for d in DAYPARTS]); daypart_p /= daypart_p.sum()
        daypart_draws = r.choice(5, size=n_txn, p=daypart_p)
        base_affinity = np.array([ch.category_affinity[c] for c in CATEGORY_IDS])
        home_lat, home_lng = DISTRICT_CENTROIDS[ch.home_district]
        work_lat, work_lng = DISTRICT_CENTROIDS[ch.work_district]
        is_traveller = ch.persona_id == 4

        for dp_idx in range(5):
            daypart = DAYPARTS[dp_idx]
            bucket_size = int((daypart_draws == dp_idx).sum())
            if bucket_size == 0:
                continue
            boost = np.array([1.6 if CATEGORY_BY_ID[cid]["daypart_peak"] == daypart else 1.0 for cid in CATEGORY_IDS])
            cat_p = base_affinity * boost; cat_p /= cat_p.sum()
            cat_draws = r.choice(len(CATEGORY_IDS), size=bucket_size, p=cat_p)
            for cat_i in np.unique(cat_draws):
                cat_id = CATEGORY_IDS[cat_i]
                n_this = int((cat_draws == cat_i).sum())
                cm = cat_merchant_idx[cat_id]
                if cm["n"] == 0:
                    continue
                mw = merchant_weights_for_cardholder(cm, home_lat, home_lng, work_lat, work_lng, ch.price_band_pref, dp_idx)
                merch_draws = r.choice(cm["n"], size=n_this, p=mw)
                day_idx_draws = r.choice(N_DAYS, size=n_this, p=cat_daily_weights[cat_id])
                lo, hi = CATEGORY_BY_ID[cat_id]["ticket_range_sgd"]
                h_lo, h_hi = DAYPART_HOURS[daypart]
                for k in range(n_this):
                    j = merch_draws[k]
                    d = ALL_DATES[day_idx_draws[k]]
                    dt = datetime(d.year, d.month, d.day, int(r.integers(h_lo, h_hi)), int(r.integers(0, 60)), int(r.integers(0, 60)))
                    amount = _sample_amount(r, lo, hi, cm["price_band"][j])
                    descs, dweights = descriptor_lookup[cm["merchant_id"][j]]
                    descriptor = descs[r.choice(len(descs), p=dweights)] if len(descs) > 1 else descs[0]
                    rows.append((f"T{txn_counter:08d}", ch.card_id, cm["merchant_id"][j], descriptor, int(cm["mcc"][j]),
                                 round(amount, 2), dt, _channel_for_category(cat_id, r),
                                 _country_for(r, is_traveller, cm["catchment"][j]), int(cm["district"][j]), None))
                    txn_counter += 1
    return pd.DataFrame(rows, columns=TXN_COLS), txn_counter


# ============================================================================
# 7. PLANTED HERO PATTERNS
# ============================================================================

H1_SUPPRESS_FACTOR = 0.5   # Tue/Wed/Thu 14–17 at half its weekday-matched baseline


def build_weekday_date_index():
    idx = {wd: [] for wd in range(7)}
    for i, d in enumerate(ALL_DATES):
        idx[d.weekday()].append(i)
    out = {}
    for wd, day_idxs in idx.items():
        w = np.array([_day_trend(i) * MONTH_MULT[f"{ALL_DATES[i].year}-{ALL_DATES[i].month:02d}"] for i in day_idxs])
        out[wd] = (np.array(day_idxs), w / w.sum())
    return out


def weekday_daypart_table(daypart_profile, suppress=False):
    base = np.array([daypart_profile[d] for d in DAYPARTS])
    table = np.tile(base, (7, 1))
    if suppress:
        aft = DAYPARTS.index("afternoon")
        for wd in (1, 2, 3):
            table[wd, aft] *= H1_SUPPRESS_FACTOR
    return table / table.sum()


def sample_hero_visits(r, n_visits, weekday_date_index, table):
    flat = table.flatten()
    draws = r.choice(len(flat), size=n_visits, p=flat)
    weekdays, dayparts = draws // 5, draws % 5
    dates = []
    for wd in weekdays:
        idxs, w = weekday_date_index[wd]
        dates.append(ALL_DATES[idxs[r.choice(len(idxs), p=w)]])
    return dates, dayparts


def _make_txn_row(txn_counter, card_id, merch_row, descriptor, amount, dt, channel, country, campaign_id=None):
    mid = merch_row["merchant_id"] if "merchant_id" in merch_row.index else merch_row.name
    return (f"T{txn_counter:08d}", card_id, mid, descriptor, int(merch_row["mcc"]), round(amount, 2), dt,
            channel, country, int(merch_row["postal_district"]), campaign_id)


def generate_h1_transactions(cardholders_df, merchants_df, cohorts, descriptor_lookup, txn_id_start):
    r = np.random.default_rng(SEED + 5)
    m0001 = merchants_df.set_index("merchant_id").loc["M0001"]
    m0055 = merchants_df.set_index("merchant_id").loc["M0055"]
    wd_index = build_weekday_date_index()
    table_m0001 = weekday_daypart_table(m0001["daypart_profile"], suppress=True)
    table_m0055 = weekday_daypart_table(m0055["daypart_profile"], suppress=False)
    rows = []
    txn_counter = txn_id_start
    lo_hi = CATEGORY_BY_ID["cafe"]["ticket_range_sgd"]

    def visits_for(card_id, merch_row, table, n_visits):
        nonlocal txn_counter
        dates, dayparts = sample_hero_visits(r, n_visits, wd_index, table)
        descs, dweights = descriptor_lookup[merch_row.name]
        for dt_date, dp in zip(dates, dayparts):
            h_lo, h_hi = DAYPART_HOURS[DAYPARTS[dp]]
            dt = datetime(dt_date.year, dt_date.month, dt_date.day, int(r.integers(h_lo, h_hi)), int(r.integers(0, 60)), int(r.integers(0, 60)))
            amount = _sample_amount(r, lo_hi[0], lo_hi[1], merch_row["price_band"])
            descriptor = descs[r.choice(len(descs), p=dweights)] if len(descs) > 1 else descs[0]
            rows.append(_make_txn_row(txn_counter, card_id, merch_row, descriptor, amount, dt, _channel_for_category("cafe", r), "SG"))
            txn_counter += 1

    for card_id in cohorts["h1_a_only"]:
        if card_id == cohorts["showcase"]["alvin"]:
            continue
        visits_for(card_id, m0001, table_m0001, int(np.clip(r.lognormal(math.log(30), 0.4), 8, 90)))
    for card_id in cohorts["h1_overlap"]:
        visits_for(card_id, m0001, table_m0001, int(np.clip(r.lognormal(math.log(20), 0.4), 5, 60)))
        visits_for(card_id, m0055, table_m0055, int(np.clip(r.lognormal(math.log(16), 0.4), 5, 60)))
    for card_id in cohorts["h1_b_only"]:
        if card_id == cohorts["showcase"]["bernice"]:
            continue
        visits_for(card_id, m0055, table_m0055, int(np.clip(r.lognormal(math.log(28), 0.4), 8, 90)))
    return pd.DataFrame(rows, columns=TXN_COLS), txn_counter


def _weekday_dates_upto_clock():
    return [d for d in ALL_DATES if d.weekday() < 5 and d <= DEMO_CLOCK_D]


def generate_showcase_transactions(cardholders_df, merchants_df, cohorts, descriptor_lookup, txn_id_start):
    """Hand-specified histories for the six showcase personas, all dated on or before the demo
    clock so that as-of-clock computation and the full period agree on every quoted figure."""
    r = np.random.default_rng(SEED + 6)
    txn_counter = txn_id_start
    rows = []
    m_by_id = merchants_df.set_index("merchant_id")
    non_hero = ~merchants_df["merchant_id"].isin(HERO_MERCHANT_IDS)
    days_upto_clock = [d for d in ALL_DATES if d <= DEMO_CLOCK_D]

    def add_row(card_id, mid, amount, dt, channel="pos", country="SG"):
        nonlocal txn_counter
        mrow = m_by_id.loc[mid]
        rows.append(_make_txn_row(txn_counter, card_id, mrow, descriptor_lookup[mid][0][0], amount, dt, channel, country))
        txn_counter += 1

    # Alvin — 127 visits to M0001, ~8:40am weekdays, flat white S$6.20.
    weekdays = _weekday_dates_upto_clock()
    for i in np.sort(r.choice(len(weekdays), size=127, replace=False)):
        d = weekdays[i]
        add_row(cohorts["showcase"]["alvin"], "M0001", 6.20,
                datetime(d.year, d.month, d.day, 8, max(0, min(59, 40 + int(r.integers(-3, 4)))), int(r.integers(0, 60))), channel="contactless")

    # Bernice — 205 visits to M0055 (~4 days a week), zero at M0001.
    n_bernice = 205
    for i in np.sort(r.choice(len(weekdays), size=n_bernice, replace=False)):
        d = weekdays[i]
        add_row(cohorts["showcase"]["bernice"], "M0055", 6.50,
                datetime(d.year, d.month, d.day, 8, max(0, min(59, 42 + int(r.integers(-4, 5)))), int(r.integers(0, 60))), channel="contactless")

    # Charles — premium spend, mean ticket exactly S$180; four premium coffees at Brew & Co. so
    # he is a candidate for the M0001 cohort and is rejected on price band, not absence.
    charles_id = cohorts["showcase"]["charles"]
    premium_cats = ["japanese", "bar_pub", "apparel", "electronics"]
    premium_merchants = {c: merchants_df[(merchants_df["category"] == c) & non_hero].iloc[0]["merchant_id"] for c in premium_cats}
    n_prem, n_cafe = 42, 4
    cafe_amounts = np.array([14.5, 15.0, 14.5, 16.0])
    amounts = r.normal(180, 55, size=n_prem)
    amounts = np.clip(amounts, 60, 520)
    target_prem_mean = (180.0 * (n_prem + n_cafe) - cafe_amounts.sum()) / n_prem
    amounts = np.round(amounts * (target_prem_mean / amounts.mean()), 2)
    amounts[-1] = round(amounts[-1] + (180.0 * (n_prem + n_cafe) - cafe_amounts.sum() - amounts.sum()), 2)
    dates_pool = r.choice(len(days_upto_clock), size=n_prem + n_cafe, replace=False)
    for k in range(n_prem):
        d = days_upto_clock[dates_pool[k]]
        add_row(charles_id, premium_merchants[premium_cats[k % 4]], float(amounts[k]),
                datetime(d.year, d.month, d.day, int(r.integers(11, 22)), int(r.integers(0, 60)), int(r.integers(0, 60))),
                country="SG" if r.random() > 0.15 else COUNTRY_POOL[r.integers(0, len(COUNTRY_POOL))])
    for k in range(n_cafe):
        d = days_upto_clock[dates_pool[n_prem + k]]
        add_row(charles_id, "M0055", float(cafe_amounts[k]),
                datetime(d.year, d.month, d.day, int(r.integers(8, 11)), int(r.integers(0, 60)), int(r.integers(0, 60))), channel="contactless")

    # Denise — bursty apparel buyer; the 41-day gap before the S$430 afternoon is the longest of her year.
    denise_id = cohorts["showcase"]["denise"]
    apparel_merchant = merchants_df[(merchants_df["category"] == "apparel") & non_hero].iloc[0]["merchant_id"]
    burst_specs = [
        (date(2025, 10, 12), [55.0, 40.0]), (date(2025, 11, 16), [68.0, 50.0, 30.0]),
        (date(2025, 12, 20), [45.0, 60.0]), (date(2026, 1, 24), [90.0, 65.0]),
        (date(2026, 2, 14), [70.0, 55.0, 40.0]), (date(2026, 3, 27), [180.0, 150.0, 100.0]),
        (date(2026, 4, 30), [60.0, 45.0]), (date(2026, 6, 6), [95.0, 70.0, 50.0]),
        (date(2026, 7, 12), [40.0, 35.0]), (date(2026, 8, 16), [120.0, 80.0]),
    ]
    assert sum(burst_specs[5][1]) == 430.0 and (burst_specs[5][0] - burst_specs[4][0]).days == 41
    _gaps = [(burst_specs[i + 1][0] - burst_specs[i][0]).days for i in range(len(burst_specs) - 1)]
    assert max(_gaps) == 41, _gaps
    for d, amts in burst_specs:
        for j, amt in enumerate(amts):
            add_row(denise_id, apparel_merchant, amt, datetime(d.year, d.month, d.day, 13 + j, int(r.integers(0, 60)), int(r.integers(0, 60))))

    # Edwin — 142 transactions, average S$9, across many merchants including 8 at Brew & Co.
    edwin_id = cohorts["showcase"]["edwin"]
    diverse_cats = ["bubble_tea", "fast_food", "hawker_kopitiam", "bakery_dessert", "cafe"]
    candidates = merchants_df[merchants_df["category"].isin(diverse_cats) & non_hero]["merchant_id"].tolist()
    n_edwin = 142
    merch_choices = list(r.choice(candidates, size=n_edwin - 8, replace=True)) + ["M0055"] * 8
    date_choices = np.sort(r.choice(len(days_upto_clock), size=n_edwin, replace=True))
    amt_raw = np.clip(r.normal(9.0, 2.2, size=n_edwin), 3.5, 18.0)
    amt_raw = np.round(amt_raw * (9.0 / amt_raw.mean()), 2)
    for k in range(n_edwin):
        d = days_upto_clock[date_choices[k]]
        hour = int(r.integers(14, 17)) if merch_choices[k] == "M0055" else int(r.integers(10, 22))
        add_row(edwin_id, merch_choices[k], float(amt_raw[k]), datetime(d.year, d.month, d.day, hour, int(r.integers(0, 60)), int(r.integers(0, 60))), channel="contactless")

    # Farah — 9 card transactions, all at the same clinic.
    farah_id = cohorts["showcase"]["farah"]
    clinic_merchant = merchants_df[merchants_df["category"] == "clinic_wellness"].iloc[0]["merchant_id"]
    for i in sorted(r.choice(len(days_upto_clock), size=9, replace=False)):
        d = days_upto_clock[i]
        add_row(farah_id, clinic_merchant, round(float(r.uniform(45, 95)), 2),
                datetime(d.year, d.month, d.day, int(r.integers(10, 17)), int(r.integers(0, 60)), int(r.integers(0, 60))))

    df = pd.DataFrame(rows, columns=TXN_COLS)
    facts = dict(alvin_merchant="M0001", bernice_merchant="M0055", denise_gap_days=41, denise_burst_total=430.0,
                 farah_merchant=clinic_merchant)
    return df, txn_counter, facts


def apply_h3_seasonal_override(card_txns_df):
    r = np.random.default_rng(SEED + 7)
    mask = card_txns_df["merchant_id"] == "M0003"
    n = int(mask.sum())
    if n == 0:
        return card_txns_df
    day_idxs = r.choice(N_DAYS, size=n, p=h3_daily_weights())
    new_dts = [datetime(ALL_DATES[i].year, ALL_DATES[i].month, ALL_DATES[i].day, old.hour, old.minute, old.second)
               for i, old in zip(day_idxs, card_txns_df.loc[mask, "txn_datetime"])]
    card_txns_df.loc[mask, "txn_datetime"] = new_dts
    return card_txns_df


def _thin_out_merchant(df, merchant_id, keep_customers, seed_extra):
    """H2 — collapse a merchant's card-issuing customer base so no lookalike pair reaches support."""
    r = np.random.default_rng(SEED + seed_extra)
    mask = df["merchant_id"] == merchant_id
    customers = sorted(df.loc[mask, "card_id"].unique().tolist())
    if len(customers) <= keep_customers:
        return df
    keep = set(r.choice(customers, size=keep_customers, replace=False))
    return df.drop(index=df.index[mask & ~df["card_id"].isin(keep)]).reset_index(drop=True)


# ============================================================================
# 7b. CAMPAIGNS + ALLOCATIONS + REDEMPTIONS (patches 7, 9, 11)
#     The generator plants: campaign master rows, who was allocated to what,
#     and the redemption transactions tagged with campaign_id. The pipeline
#     measures conversion, incrementality, cost and net from those alone.
# ============================================================================

WINNER = dict(campaign_id="C-SJ-02", merchant_id="M0001", name="Afternoon trough — 20% off, Tue–Thu 2–5pm",
              status="completed", reward_type="discount", offer_headline="20% off any drink, weekday afternoons",
              offer_terms="20% off, capped at S$5 per transaction. Tue–Thu 14:00–17:00. One redemption per visit.",
              discount_pct=20.0, cap_per_txn_sgd=5.0, target_pool="acquisition",
              target_segments=["non_customers_lift_M0055"], window_start="2026-07-27", window_end="2026-08-24",
              days_of_week=[1, 2, 3], hours=[14, 17], outlets=["M0001-O1", "M0001-O2", "M0001-O3"],
              channel_push=True, redemption_limit=200, per_customer_limit="once_per_visit",
              applied_at="2026-07-06", set_live_at="2026-07-24",
              recommended_window={"days_of_week": [1, 2, 3], "hours": [14, 17]}, config_changes=[])
LOSER = dict(campaign_id="C-SJ-01", merchant_id="M0001", name="Lunch regulars — 25% off, Mon–Fri 11am–2pm",
             status="completed", reward_type="discount", offer_headline="25% off lunch for our regulars",
             offer_terms="25% off, capped at S$3 per transaction. Mon–Fri 11:00–14:00. One redemption per day.",
             discount_pct=25.0, cap_per_txn_sgd=3.0, target_pool="retention",
             target_segments=["Champions", "Loyal Customers", "Potential Loyalists"], window_start="2026-03-02", window_end="2026-03-29",
             days_of_week=[0, 1, 2, 3, 4], hours=[11, 14], outlets=["M0001-O1", "M0001-O3"],
             channel_push=True, redemption_limit=None, per_customer_limit="once_per_day",
             applied_at="2026-02-09", set_live_at="2026-02-27",
             recommended_window={"days_of_week": [1, 2, 3], "hours": [14, 17]},
             config_changes=[{"field": "window", "from": "Tue–Thu 14:00–17:00 (recommended trough)",
                              "to": "Mon–Fri 11:00–14:00", "by": "merchant", "at": "2026-02-20T10:14:00+08:00",
                              "note": "Owner asked to reward lunch regulars instead of the afternoon trough"},
                             {"field": "reward_type_target", "from": "discount → New/Promising (acquisition)",
                              "to": "discount → Champions / Loyal", "by": "merchant", "at": "2026-02-20T10:16:00+08:00"}])
LOSER_TREATED, LOSER_CONTROL = 400, 400
WINNER_TREATED, WINNER_CONTROL = 420, 140
WINNER_CONVERTERS, CONTROL_ORGANICS = 67, 6
WINNER_RETURN_SHARE = 0.35
LOSER_UPLIFT_SHARE = 0.03


_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _window_phrase(dows, hours):
    """The redemption window in the words a cardholder reads on the card."""
    if set(dows) == {0, 1, 2, 3, 4, 5, 6}:
        days = "any day"
    elif set(dows) == {5, 6}:
        days = "weekends"
    elif set(dows) == {0, 1, 2, 3, 4}:
        days = "weekdays"
    else:
        days = "/".join(_DAY_NAMES[d] for d in sorted(dows))
    return f"{days} {hours[0]:02d}:00\u2013{hours[1]:02d}:00"


def _feed_headline(rtype, name):
    """Offer copy per reward type. Written once here so the six types read as six mechanics."""
    return {
        "discount": f"15% off your bill at {name}",
        "cashback": f"8% cashback at {name}",
        "voucher": f"S$5 off S$25 at {name}",
        "spend_and_save": f"Save S$12 when you spend S$60 at {name}",
        "bundle_1for1": f"1-for-1 at {name}",
    }.get(rtype, f"An offer from {name}")


def _feed_terms(rtype, dows, hours):
    mechanic = {
        "discount": "15% off, capped at S$8 per transaction.",
        "cashback": "8% back to your card, capped at S$10 per transaction.",
        "voucher": "S$5 off a minimum spend of S$25.",
        "spend_and_save": "Save S$12 across a total spend of S$60 within the campaign.",
        "bundle_1for1": "Buy one, get one of equal or lower value free.",
    }.get(rtype, "See campaign configuration.")
    return f"{mechanic} Redeem {_window_phrase(dows, hours)}. One redemption per customer."


def plant_campaigns(cardholders_df, merchants_df, cohorts, card_txns_df, descriptor_lookup, txn_id_start):
    """Returns (campaigns_df, allocations_df, extra_txns_df, card_txns_df_with_tags, next_txn)."""
    r = np.random.default_rng(SEED + 13)
    m_by_id = merchants_df.set_index("merchant_id")
    ch_by_id = cardholders_df.set_index("card_id")
    txn_counter = txn_id_start
    extra_rows, alloc_rows = [], []
    m0001 = m_by_id.loc["M0001"]
    desc_m0001 = descriptor_lookup["M0001"][0][0]

    def add_txn(card_id, mid, amount, dt, campaign_id=None, channel="contactless"):
        nonlocal txn_counter
        extra_rows.append(_make_txn_row(txn_counter, card_id, m_by_id.loc[mid], desc_m0001, amount, dt, channel, "SG", campaign_id))
        txn_counter += 1

    # ---- Winner: acquisition campaign on the M0055 → M0001 cohort -------------------------
    b_only = [c for c in cohorts["h1_b_only"] if ch_by_id.loc[c, "marketing_consent"]]
    b_only_sorted = sorted(b_only)
    r.shuffle(b_only_sorted)
    bernice = cohorts["showcase"]["bernice"]
    treated = [bernice] + [c for c in b_only_sorted if c != bernice][:WINNER_TREATED - 1]
    control = [c for c in b_only_sorted if c not in set(treated)][:WINNER_CONTROL]
    converters = [c for c in treated if c != bernice][:WINNER_CONVERTERS]
    conv_set = set(converters)
    w_start, w_end = date.fromisoformat(WINNER["window_start"]), date.fromisoformat(WINNER["window_end"])
    window_days = [d for d in ALL_DATES if w_start <= d <= w_end and d.weekday() in WINNER["days_of_week"]]
    pushed_at = datetime(2026, 7, 27, 10, 0, 0)
    for c in treated:
        alloc_rows.append(dict(card_id=c, campaign_id="C-SJ-02", merchant_id="M0001", allocated_date="2026-07-24",
                               arm="treated", status="redeemed" if c in conv_set else "delivered",
                               pushed_at=pushed_at, push_suppressed=False))
    for c in control:
        alloc_rows.append(dict(card_id=c, campaign_id="C-SJ-02", merchant_id="M0001", allocated_date="2026-07-24",
                               arm="control", status="control", pushed_at=None, push_suppressed=False))
    returners = set(converters[:int(round(WINNER_CONVERTERS * WINNER_RETURN_SHARE))])
    for c in converters:
        k = int(np.clip(1 + r.poisson(1.25), 1, 5))
        visit_days = sorted(r.choice(len(window_days), size=min(k, len(window_days)), replace=False))
        last_dt = None
        for i in visit_days:
            d = window_days[i]
            dt = datetime(d.year, d.month, d.day, int(r.integers(14, 17)), int(r.integers(0, 60)), int(r.integers(0, 60)))
            add_txn(c, "M0001", float(np.clip(r.normal(7.4, 1.3), 4.0, 12.0)), dt, campaign_id="C-SJ-02")
            last_dt = dt
        if c in returners:
            for _ in range(int(r.integers(1, 3))):
                back = last_dt.date() + timedelta(days=int(r.integers(3, 29)))
                if back <= DEMO_CLOCK_D:
                    add_txn(c, "M0001", float(np.clip(r.normal(6.8, 1.2), 4.0, 12.0)),
                            datetime(back.year, back.month, back.day, int(r.integers(8, 18)), int(r.integers(0, 60)), int(r.integers(0, 60))))
    organics = control[:CONTROL_ORGANICS]
    for j, c in enumerate(organics):
        d = window_days[int(r.integers(0, len(window_days)))]
        dt = datetime(d.year, d.month, d.day, int(r.integers(14, 17)), int(r.integers(0, 60)), int(r.integers(0, 60)))
        add_txn(c, "M0001", float(np.clip(r.normal(7.4, 1.3), 4.0, 12.0)), dt)
        if j < 2:
            back = d + timedelta(days=int(r.integers(5, 25)))
            add_txn(c, "M0001", float(np.clip(r.normal(6.8, 1.2), 4.0, 12.0)),
                    datetime(back.year, back.month, back.day, int(r.integers(8, 18)), int(r.integers(0, 60)), int(r.integers(0, 60))))

    # ---- Loser: lunch discount to existing regulars, in peak hours -------------------------
    a_pool = sorted(c for c in cohorts["h1_a_only"] if ch_by_id.loc[c, "marketing_consent"])
    visits = card_txns_df[card_txns_df["merchant_id"] == "M0001"].groupby("card_id").size()
    a_pool = sorted(a_pool, key=lambda c: -int(visits.get(c, 0)))       # regulars first
    top = a_pool[:LOSER_TREATED + LOSER_CONTROL]
    l_treated, l_control = top[0::2][:LOSER_TREATED], top[1::2][:LOSER_CONTROL]   # paired on visit rank
    l_start, l_end = date.fromisoformat(LOSER["window_start"]), date.fromisoformat(LOSER["window_end"])
    in_window = (card_txns_df["merchant_id"] == "M0001") & (card_txns_df["card_id"].isin(l_treated)) & \
                (card_txns_df["txn_datetime"].dt.date >= l_start) & (card_txns_df["txn_datetime"].dt.date <= l_end) & \
                (card_txns_df["txn_datetime"].dt.weekday < 5) & (card_txns_df["txn_datetime"].dt.hour >= 11) & \
                (card_txns_df["txn_datetime"].dt.hour < 14)
    # once per day per customer: tag the first lunch transaction on each day
    tagged = card_txns_df[in_window].sort_values("txn_datetime").drop_duplicates(
        subset=["card_id", card_txns_df.loc[in_window, "txn_datetime"].dt.date.name or "txn_datetime"])
    tagged_idx = card_txns_df[in_window].assign(_d=lambda x: x["txn_datetime"].dt.date).sort_values("txn_datetime") \
        .drop_duplicates(subset=["card_id", "_d"]).index
    card_txns_df.loc[tagged_idx, "campaign_id"] = "C-SJ-01"
    redeemers = set(card_txns_df.loc[tagged_idx, "card_id"])
    l_window_days = [d for d in ALL_DATES if l_start <= d <= l_end and d.weekday() < 5]
    showcase = set(cohorts["showcase"].values())
    uplift_members = [c for c in l_treated if c not in showcase][:int(round(LOSER_TREATED * LOSER_UPLIFT_SHARE))]
    for c in uplift_members:
        d = l_window_days[int(r.integers(0, len(l_window_days)))]
        add_txn(c, "M0001", float(np.clip(r.normal(6.4, 1.0), 4.0, 12.0)),
                datetime(d.year, d.month, d.day, int(r.integers(11, 14)), int(r.integers(0, 60)), int(r.integers(0, 60))), campaign_id="C-SJ-01")
        redeemers.add(c)
    l_pushed = datetime(2026, 3, 2, 10, 0, 0)
    for c in l_treated:
        alloc_rows.append(dict(card_id=c, campaign_id="C-SJ-01", merchant_id="M0001", allocated_date="2026-02-27",
                               arm="treated", status="redeemed" if c in redeemers else "delivered", pushed_at=l_pushed, push_suppressed=False))
    for c in l_control:
        alloc_rows.append(dict(card_id=c, campaign_id="C-SJ-01", merchant_id="M0001", allocated_date="2026-02-27",
                               arm="control", status="control", pushed_at=None, push_suppressed=False))

    # ---- Other merchants' campaigns: completed, active, applied ---------------------------
    acquired_non_hero = [m for m in merchants_df[merchants_df["is_ocbc_acquired"]]["merchant_id"]
                         if m not in HERO_MERCHANT_IDS and m not in (PLANT_BALANCE_FAIL, PLANT_BANDS_FAIL, PLANT_NO_SCORES)]
    other = acquired_non_hero[3:15]
    completed_m, active_m, applied_m = other[0:3], other[3:6], other[6:8]
    types = ["voucher", "cashback", "bundle_1for1", "discount", "spend_and_save", "voucher"]
    campaigns = [dict(WINNER), dict(LOSER)]

    def mk(cid, mid, status, rtype, ws, we, applied_at, set_live_at=None, push=True):
        return dict(campaign_id=cid, merchant_id=mid, name=f"{m_by_id.loc[mid, 'canonical_name']} — {rtype.replace('_', ' ')}",
                    status=status, reward_type=rtype, offer_headline=f"{rtype.replace('_', ' ').title()} at {m_by_id.loc[mid, 'canonical_name']}",
                    offer_terms="See campaign configuration.", discount_pct=None, cap_per_txn_sgd=None,
                    target_pool="retention" if rtype in ("cashback", "spend_and_save") else "acquisition",
                    target_segments=[], window_start=ws, window_end=we, days_of_week=[0, 1, 2, 3, 4, 5, 6], hours=[10, 21],
                    outlets=[o["outlet_id"] for o in m_by_id.loc[mid, "outlets"]][:3], channel_push=push, redemption_limit=300,
                    per_customer_limit="once_per_campaign", applied_at=applied_at, set_live_at=set_live_at,
                    recommended_window=None, config_changes=[])

    for i, mid in enumerate(completed_m):
        campaigns.append(mk(f"C-OTH-{i + 1:02d}", mid, "completed", types[i], f"2026-0{4 + i}-06", f"2026-0{5 + i}-03", f"2026-0{3 + i}-20", f"2026-0{4 + i}-03"))
    for i, mid in enumerate(active_m):
        ws = ["2026-08-24", "2026-08-31", "2026-09-07"][i]
        campaigns.append(mk(f"C-OTH-{i + 4:02d}", mid, "active", types[i + 3], ws, ["2026-09-27", "2026-10-04", "2026-10-11"][i], "2026-08-10", ws))
    # Applications awaiting RM contact: two ordinary, the three gate plants, and Boba Lane.
    applied_specs = [(applied_m[0], "2026-09-02"), (applied_m[1], "2026-09-09"), (PLANT_BALANCE_FAIL, "2026-09-04"),
                     (PLANT_BANDS_FAIL, "2026-09-08"), (PLANT_NO_SCORES, "2026-09-10"), ("M0002", "2026-09-10")]
    for i, (mid, applied_at) in enumerate(applied_specs):
        campaigns.append(mk(f"C-APP-{i + 1:02d}", mid, "applied", "discount", None, None, applied_at, None, push=False))

    # ---- Bernice's rewards feed (customer prompt §4, §8) -----------------------------------
    # The customer view is a rewards list with four filter groups, and a list of one card makes
    # every one of them decoration. These are ordinary campaigns from ordinary merchants; what is
    # planted here is the SPREAD — business nature, reward type, when the offer may be redeemed,
    # and how close it is to expiry — so that each filter has something to bite on, one card is
    # expired, one has already been redeemed, and one is live but not redeemable at the demo clock
    # (Friday 15:12), which is what makes "Available now" a real filter rather than a label.
    #
    # Two rules constrain the dates and neither may be broken, because the push-cap story depends
    # on both: no allocation of Bernice's is pushed inside the demo week (so she is at zero of two
    # pushes and the RM's push reaches her), and at most one is an ACTIVE campaign allocated
    # within the trailing 30 days (so the portfolio frequency cap of three concurrent offers does
    # not remove her from the Soujourner allocation).
    #
    # (suffix, category, reward_type, days_of_week, hours, window_start, window_end, status, bernice_status)
    FEED_SPECS = [
        ("01", "apparel",          "voucher",        [0, 1, 2, 3, 4, 5, 6], [10, 21], "2026-08-01", "2026-12-20", "active",    "delivered"),
        ("02", "hair_nail_salon",  "discount",       [0, 1, 2, 3, 4],       [11, 19], "2026-07-20", "2026-09-16", "active",    "delivered"),
        ("03", "bubble_tea",       "bundle_1for1",   [5, 6],                [12, 20], "2026-07-15", "2026-10-31", "active",    "delivered"),
        ("04", "bakery_dessert",   "cashback",       [0, 1, 2, 3, 4, 5, 6], [8, 20],  "2026-08-05", "2026-09-30", "active",    "delivered"),
        ("05", "books_gifts",      "spend_and_save", [0, 1, 2, 3, 4],       [10, 21], "2026-06-01", "2026-08-31", "completed", "expired"),
        ("06", "cinema_arcade",    "voucher",        [5, 6],                [12, 23], "2026-05-01", "2026-07-31", "completed", "redeemed"),
        ("07", "japanese",         "discount",       [0, 1, 2, 3, 4],       [17, 22], "2026-07-25", "2026-10-20", "active",    "delivered"),
        ("08", "fast_food",        "voucher",        [0, 1, 2, 3, 4, 5, 6], [7, 22],  "2026-09-01", "2026-09-14", "active",    "delivered"),
        ("09", "beauty_cosmetics", "cashback",       [0, 1, 2, 3, 4, 5, 6], [10, 21], "2026-04-01", "2026-06-30", "completed", "expired"),
        ("10", "gym_fitness",      "spend_and_save", [0, 1, 2, 3, 4],       [6, 22],  "2026-08-02", "2026-11-30", "active",    "delivered"),
    ]
    used = set(HERO_MERCHANT_IDS) | {PLANT_BALANCE_FAIL, PLANT_BANDS_FAIL, PLANT_NO_SCORES} | set(completed_m) | set(active_m) | set(applied_m)
    feed_campaigns = []
    for suffix, category, rtype, dows, hours, ws, we, status, _ in FEED_SPECS:
        pick = next((m for m in merchants_df[merchants_df["is_ocbc_acquired"] & (merchants_df["category"] == category)]["merchant_id"]
                     if m not in used), None)
        if pick is None:
            continue
        used.add(pick)
        camp = mk(f"C-FEED-{suffix}", pick, status, rtype, ws, we, (date.fromisoformat(ws) - timedelta(days=14)).isoformat(), ws)
        camp.update(days_of_week=dows, hours=hours,
                    offer_headline=_feed_headline(rtype, m_by_id.loc[pick, "canonical_name"]),
                    offer_terms=_feed_terms(rtype, dows, hours))
        feed_campaigns.append((camp, suffix))
        campaigns.append(camp)

    # Allocations for the six other-merchant campaigns, concentrated on a subset that includes Edwin.
    generic_ids = cardholders_df[cardholders_df["marketing_consent"] & ~cardholders_df["card_id"].isin(set(cohorts["h1_a_only"]) | set(cohorts["h1_overlap"]) | set(cohorts["h1_b_only"]) | set(cohorts["showcase"].values()))]["card_id"].tolist()
    edwin = cohorts["showcase"]["edwin"]
    freq_cap_plants = [c for c in b_only_sorted if c != bernice and c not in conv_set][-40:]   # 40 cohort members already holding 3 offers
    heavy = list(r.choice(generic_ids, size=800, replace=False)) + [edwin]
    light = [c for c in generic_ids if c not in set(heavy)]
    feed_ids = {c["campaign_id"] for c, _ in feed_campaigns}
    for camp in campaigns:
        if camp["merchant_id"] == "M0001" or camp["status"] == "applied":
            continue
        n = int(r.integers(300, 600))
        picks = list(r.choice(heavy, size=int(n * 0.7), replace=False)) + list(r.choice(light, size=n - int(n * 0.7), replace=False))
        if camp["status"] == "active" and camp["campaign_id"] not in feed_ids:
            picks = picks + freq_cap_plants
        # Edwin holds exactly two live offers and is at the weekly push cap; a feed campaign
        # allocated inside the 30-day window would make it three and the frequency cap would
        # remove him from the Soujourner cohort, taking the suppressed push with him.
        if camp["campaign_id"] in feed_ids:
            picks = [c for c in picks if c != edwin]
        ws = date.fromisoformat(camp["window_start"])
        for c in picks:
            pushed = camp["channel_push"] and r.random() < 0.6
            status = "redeemed" if r.random() < 0.12 else ("expired" if camp["status"] == "completed" else "delivered")
            alloc_rows.append(dict(card_id=c, campaign_id=camp["campaign_id"], merchant_id=camp["merchant_id"],
                                   allocated_date=(ws - timedelta(days=3)).isoformat(), arm="treated", status=status,
                                   pushed_at=datetime(ws.year, ws.month, ws.day, 10, 0, 0) if pushed else None, push_suppressed=False))
    # Bernice's own card on each feed campaign, with the status the customer view needs to show.
    # Pushed on the allocation date where the campaign had push, which is always outside the demo
    # week — she must still be at zero pushes when the RM fires the Soujourner one.
    for camp, suffix in feed_campaigns:
        b_status = next(x[-1] for x in FEED_SPECS if x[0] == suffix)
        allocated = date.fromisoformat(camp["window_start"]) - timedelta(days=3)
        alloc_rows.append(dict(card_id=bernice, campaign_id=camp["campaign_id"], merchant_id=camp["merchant_id"],
                               allocated_date=allocated.isoformat(), arm="treated", status=b_status,
                               pushed_at=datetime(allocated.year, allocated.month, allocated.day, 10, 0, 0), push_suppressed=False))

    # Edwin: pushed twice in the demo week (Mon 7 Sep – Sun 13 Sep) → at the weekly push cap.
    alloc_df = pd.DataFrame(alloc_rows)
    core_active = [c["campaign_id"] for c in campaigns if c["status"] == "active" and c["campaign_id"] not in feed_ids]
    edwin_active = alloc_df[(alloc_df["card_id"] == edwin) & (alloc_df["campaign_id"].isin(core_active))]
    for cid in core_active:
        if cid not in set(edwin_active["campaign_id"]):
            camp = next(c for c in campaigns if c["campaign_id"] == cid)
            alloc_df = pd.concat([alloc_df, pd.DataFrame([dict(card_id=edwin, campaign_id=cid, merchant_id=camp["merchant_id"],
                                                               allocated_date=camp["window_start"], arm="treated", status="delivered",
                                                               pushed_at=None, push_suppressed=False)])], ignore_index=True)
    active_ids = [c["campaign_id"] for c in campaigns if c["status"] == "active"]
    # Edwin holds exactly two live offers, both pushed this week: under the 30-day offer cap, at the weekly push cap.
    alloc_df = alloc_df[~((alloc_df["card_id"] == edwin) & (alloc_df["campaign_id"] == core_active[2]))].reset_index(drop=True)
    push_days = [datetime(2026, 9, 8, 9, 30, 0), datetime(2026, 9, 10, 12, 15, 0)]
    for cid, pd_at in zip(core_active[:2], push_days):
        alloc_df.loc[(alloc_df["card_id"] == edwin) & (alloc_df["campaign_id"] == cid), "pushed_at"] = pd_at
    # Bernice holds no live offer from the generic campaign draw: nothing but the cap could stop
    # her push, and it doesn't. Her planted feed cards are deliberate and are kept — they are
    # allocated outside the 30-day cap window bar one, so she stays under the concurrent-offer cap.
    alloc_df = alloc_df[~((alloc_df["card_id"] == bernice)
                          & (alloc_df["campaign_id"].isin(set(active_ids) - feed_ids)))].reset_index(drop=True)
    campaigns_df = pd.DataFrame(campaigns)
    extra_df = pd.DataFrame(extra_rows, columns=TXN_COLS)
    return campaigns_df, alloc_df, extra_df, card_txns_df, txn_counter


# ============================================================================
# 8. ACQUIRING — data/raw/acquiring_transactions.parquet + token_map.parquet
#     (transaction-level for hero acquired merchants only; patch 2 tokens)
# ============================================================================

CARD_SCHEMES = ["visa", "mastercard", "amex", "unionpay"]
CATCHMENT_FOREIGN_SHARE = {"neighbourhood": 0.03, "office": 0.05, "transit": 0.10, "destination": 0.18}
HERO_ACQUIRING_MERCHANTS = ["M0001", "M0002", "M0003"]
TARGET_OCBC_SHARE = 0.25


def _token(s):
    return "tok_" + hashlib.sha1(("mobius:" + s).encode()).hexdigest()[:12]


def generate_acquiring_transactions(card_txns_df, merchants_df):
    r = np.random.default_rng(SEED + 8)
    m_by_id = merchants_df.set_index("merchant_id")
    rows = []
    txn_counter = 1
    token_map = {}
    for mid in HERO_ACQUIRING_MERCHANTS:
        mrow = m_by_id.loc[mid]
        acq_start = date.fromisoformat(mrow["acquiring_start_date"])
        outlets = mrow["outlets"]
        outlet_ids = [o["outlet_id"] for o in outlets]
        outlet_w = np.array([0.65, 0.25, 0.10]) if mid == "M0001" else np.ones(len(outlet_ids)) / len(outlet_ids)
        sub = card_txns_df[(card_txns_df["merchant_id"] == mid) & (card_txns_df["txn_datetime"].dt.date >= acq_start)]
        n_ocbc = len(sub)
        for txn in sub.itertuples(index=False):
            tok = _token(txn.card_id)
            token_map[tok] = txn.card_id
            oi = int(r.choice(len(outlet_ids), p=outlet_w))
            rows.append((txn.txn_id, mid, outlet_ids[oi], f"{outlet_ids[oi]}-T{int(r.integers(1, 3)):02d}", txn.amount_sgd, txn.txn_datetime,
                         "visa" if r.random() < 0.6 else "mastercard", "SG", True, "OCBC", "card", tok, txn.campaign_id))
        target_total = int(round(n_ocbc / TARGET_OCBC_SHARE)) if n_ocbc > 0 else 0
        n_foreign = max(target_total - n_ocbc, 0)
        window_days = [d for d in ALL_DATES if d >= acq_start]
        if n_foreign > 0 and window_days:
            trend_w = np.array([_day_trend(ALL_DATES.index(d)) * MONTH_MULT[f"{d.year}-{d.month:02d}"] for d in window_days])
            trend_w /= trend_w.sum()
            day_choices = r.choice(len(window_days), size=n_foreign, p=trend_w)
            lo_hi = CATEGORY_BY_ID[mrow["category"]]["ticket_range_sgd"]
            foreign_share = CATCHMENT_FOREIGN_SHARE.get(mrow["catchment_type"], 0.05)
            # Non-OCBC customers repeat too: a token pool with a long-tailed visit distribution.
            n_tokens = max(int(n_foreign / 18), 1)      # ~18 visits per non-OCBC customer: comparable to OCBC regulars, so RFM quintiles are not skewed by issuer
            tok_w = r.lognormal(0, 0.8, size=n_tokens); tok_w /= tok_w.sum()
            tok_draws = r.choice(n_tokens, size=n_foreign, p=tok_w)
            dp = np.array([mrow["daypart_profile"][d] for d in DAYPARTS])
            table = weekday_daypart_table(mrow["daypart_profile"], suppress=(mid == "M0001"))
            for k in range(n_foreign):
                d = window_days[day_choices[k]]
                # follow the merchant's own weekday×daypart shape (incl. the planted trough)
                row_w = table[d.weekday()]; row_w = row_w / row_w.sum()
                dpi = int(r.choice(5, p=row_w))
                h_lo, h_hi = DAYPART_HOURS[DAYPARTS[dpi]]
                dt = datetime(d.year, d.month, d.day, int(r.integers(h_lo, h_hi)), int(r.integers(0, 60)), int(r.integers(0, 60)))
                amount = _sample_amount(r, lo_hi[0], lo_hi[1], mrow["price_band"])
                is_paynow = r.random() < 0.10
                scheme = "paynow" if is_paynow else CARD_SCHEMES[int(r.choice(4, p=[0.45, 0.3, 0.15, 0.10]))]
                issuer = None if is_paynow else ["DBS", "UOB", "other"][int(r.choice(3, p=[0.45, 0.30, 0.25]))]
                bin_country = "SG" if (is_paynow or r.random() > foreign_share) else COUNTRY_POOL[r.integers(0, len(COUNTRY_POOL))]
                oi = int(r.choice(len(outlet_ids), p=outlet_w))
                rows.append((f"A{txn_counter:08d}", mid, outlet_ids[oi], f"{outlet_ids[oi]}-T{int(r.integers(1, 3)):02d}", round(amount, 2), dt,
                             scheme, bin_country, False, issuer, "paynow" if is_paynow else "card",
                             _token(f"{mid}:ext:{tok_draws[k]}"), None))
                txn_counter += 1
    cols = ["txn_id", "merchant_id", "outlet_id", "terminal_id", "amount_sgd", "txn_datetime", "card_scheme",
            "card_bin_country", "is_ocbc_card", "issuer_bank", "payment_method", "customer_token", "campaign_id"]
    df = pd.DataFrame(rows, columns=cols).sort_values(["txn_datetime", "txn_id"]).reset_index(drop=True)
    tm = pd.DataFrame(sorted(token_map.items()), columns=["customer_token", "card_id"])
    return df, tm


# ============================================================================
# 9. DEPOSIT FLOWS — data/raw/deposit_flows.parquet (patch 4: all OCBC business customers)
# ============================================================================

def build_deposit_flows(merchants_df):
    r = np.random.default_rng(SEED + 10)
    rows = []
    for _, m in merchants_df.iterrows():
        if not m["is_ocbc_customer"]:
            continue
        mid = m["merchant_id"]
        rel_start = date.fromisoformat(m["relationship_start_date"])
        if mid == "M0001":
            # Worked example in sme-relationship-value-score.md: ~S$125k/month credit turnover, ~S$45k CASA.
            monthly_turnover, capture = 125_000.0, 0.03
        elif mid == PLANT_BALANCE_FAIL:
            monthly_turnover, capture = 60_000.0, 0.025          # avg balance ≈ S$18k → fails the gate
        else:
            monthly_turnover = float(np.exp(r.normal(math.log(65_000), 0.7)))
            capture = float(np.clip(np.exp(r.normal(math.log(0.09), 0.9)), 0.01, 1.0))
        target_balance = capture * monthly_turnover * 12
        opened = m["operating_account_opened_date"]
        for month_key in PERIOD_MONTHS:
            y, mo = int(month_key[:4]), int(month_key[5:7])
            if date(y, mo, 1) < rel_start.replace(day=1):
                continue
            mult = MONTH_MULT[month_key]
            inflow_sgd = round(monthly_turnover * mult * float(r.uniform(0.30, 0.40)), 2)
            settlement_sgd = round(monthly_turnover * mult - inflow_sgd, 2) if m["is_ocbc_acquired"] else 0.0
            if not m["is_ocbc_acquired"]:
                inflow_sgd = round(monthly_turnover * mult * 0.35, 2)
            outflow_sgd = round((inflow_sgd + settlement_sgd) * float(r.uniform(0.9, 1.05)), 2)
            closing = round(max(target_balance * float(r.uniform(0.85, 1.15)), 500.0), 2)
            has_op = bool(m["is_ocbc_acquired"] or mid == "M0004")
            if mid == "M0001":
                has_op = opened is not None and date(y, mo, 1) >= date.fromisoformat(opened).replace(day=1)
            rows.append(dict(merchant_id=mid, month=month_key, paynow_inflow_count=int(max(r.normal(40 * mult, 6), 0)),
                             paynow_inflow_sgd=inflow_sgd, card_settlement_sgd=settlement_sgd, outflow_sgd=outflow_sgd,
                             closing_balance_sgd=closing, has_ocbc_operating_account=has_op))
    return pd.DataFrame(rows)


# ============================================================================
# 10. SHOWCASE PERSONA BIOS — data/raw/showcase_personas.json
#     Narrative only. Every number in a signature line is a template the pipeline
#     fills from the generated data (and validate.py re-derives independently).
# ============================================================================

def build_showcase_bios(cohorts, facts):
    return [
        dict(id="alvin", card_id=cohorts["showcase"]["alvin"], name="Alvin", age=34, occupation="Accounts Manager", home_district=2,
             description="Creature of habit to an almost comic degree. Same flat white, same 8:40am, same corner table, all year. Has never ordered anything else on the menu.",
             signature_template="{alvin_visits} visits to Soujourner Coffee. {alvin_visits} flat whites.",
             role="fingerprint", is_illustrative=True),
        dict(id="bernice", card_id=cohorts["showcase"]["bernice"], name="Bernice", age=29, occupation="Consultant", home_district=4,
             description="Alvin's statistical twin. Same daypart, same price band, same category mix, same S$6–7 ticket. The only difference is which way she turns out of the lift lobby.",
             signature_template="Buys the identical coffee, 200 metres away, {bernice_days_per_week} days a week. Zero visits to Soujourner Coffee.",
             role="target", is_illustrative=True),
        dict(id="charles", card_id=cohorts["showcase"]["charles"], name="Charles", age=52, occupation="Director", home_district=9,
             description="Does not look at prices. Hotel dining, premium retail, business class. A 20% discount changes nothing about his behaviour — he was buying it regardless.",
             signature_template="Average ticket S${charles_avg_ticket}. Has never used a voucher.",
             role="exclusion", is_illustrative=True),
        dict(id="denise", card_id=cohorts["showcase"]["denise"], name="Denise", age=31, occupation="Tampines, two young kids", home_district=18,
             description="Spends in bursts, not streams. Silent for six weeks, then clears a whole season's shopping in one afternoon. Everything is timed to school holidays and CNY.",
             signature_template="Nothing for {denise_gap_days} days, then S${denise_burst_total} in a single afternoon.",
             role="seasonal", is_illustrative=True),
        dict(id="edwin", card_id=cohorts["showcase"]["edwin"], name="Edwin", age=26, occupation="Bugis, first job", home_district=7,
             description="Highest transaction count in the dataset and the smallest tickets. Tries every new opening within a week. Loyal to nothing — and already holding two pushed offers this week.",
             signature_template="{edwin_n} transactions. Average S${edwin_avg}.",
             role="suppressed_push", is_illustrative=True),
        dict(id="farah", card_id=cohorts["showcase"]["farah"], name="Farah", age=58, occupation="Toa Payoh", home_district=12,
             description="Card lives in a drawer. Kopitiam, wet market and hawker all in cash. The card comes out for the clinic and almost nothing else.",
             signature_template="{farah_n} card transactions in 12 months. All at the same clinic.",
             role="dormant", is_illustrative=True),
    ]


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


def _stringify_cols(df, cols):
    df = df.copy()
    for c in cols:
        df[c] = df[c].apply(lambda v: json.dumps(v, default=_json_default))
    return df


def main():
    t0 = datetime.now()
    print("=" * 70)
    print("1-2. Taxonomy + merchants")
    build_taxonomy_json()
    merchants_df = build_merchants()
    print(f"   acquired: {int(merchants_df['is_ocbc_acquired'].sum())}, OCBC business customers: {int(merchants_df['is_ocbc_customer'].sum())}")
    print(f"   plants: balance-fail={PLANT_BALANCE_FAIL} bands-fail={PLANT_BANDS_FAIL} no-scores={PLANT_NO_SCORES}")

    print("3. Descriptors")
    descriptors_df = build_descriptors(merchants_df)
    descriptor_lookup = build_descriptor_lookup(descriptors_df)

    print("4. Cardholders + H1 hero cohort")
    cardholders_df, cohorts = build_cardholders_and_cohorts(merchants_df)

    print("5. Transaction engine (generic population)")
    cat_daily_weights = precompute_category_daily_weights()
    cat_merchant_idx = build_category_merchant_index(merchants_df, exclude_ids={"M0001", "M0055"})
    generic_pool_df = cardholders_df[~cardholders_df["card_id"].isin(set(cohorts["showcase"].values()))]
    generic_df, next_txn = generate_generic_transactions(generic_pool_df, merchants_df, cat_merchant_idx, cat_daily_weights, descriptor_lookup, 1)

    print("6. H1 hero cohort transactions (M0001 / M0055)")
    h1_df, next_txn = generate_h1_transactions(cardholders_df, merchants_df, cohorts, descriptor_lookup, next_txn)

    print("7. Showcase persona transactions")
    showcase_df, next_txn, facts = generate_showcase_transactions(cardholders_df, merchants_df, cohorts, descriptor_lookup, next_txn)

    print("8. Assembling card transactions, H3 override, H2 thinning")
    card_txns_df = pd.concat([generic_df, h1_df, showcase_df], ignore_index=True)
    card_txns_df = apply_h3_seasonal_override(card_txns_df)
    card_txns_df = _thin_out_merchant(card_txns_df, "M0002", keep_customers=15, seed_extra=11)

    print("9. Campaigns, allocations, redemptions (planted)")
    campaigns_df, alloc_df, extra_df, card_txns_df, next_txn = plant_campaigns(
        cardholders_df, merchants_df, cohorts, card_txns_df, descriptor_lookup, next_txn)
    card_txns_df = pd.concat([card_txns_df, extra_df], ignore_index=True)
    card_txns_df = card_txns_df.sort_values(["txn_datetime", "txn_id"]).reset_index(drop=True)
    card_txns_df["campaign_id"] = card_txns_df["campaign_id"].astype(object).where(card_txns_df["campaign_id"].notna(), None)
    card_txns_df.to_parquet(os.path.join(RAW_DIR, "card_transactions.parquet"), index=False)
    print(f"   {len(card_txns_df):,} card transactions ({int(card_txns_df['campaign_id'].notna().sum())} campaign-tagged)")

    print("10. Acquiring transactions + token map (hero merchants)")
    acquiring_df, token_map_df = generate_acquiring_transactions(card_txns_df, merchants_df)
    acquiring_df.to_parquet(os.path.join(RAW_DIR, "acquiring_transactions.parquet"), index=False)
    token_map_df.to_parquet(os.path.join(RAW_DIR, "token_map.parquet"), index=False)
    print(f"   {len(acquiring_df):,} acquiring transactions, {len(token_map_df):,} resolvable tokens")

    print("11. Deposit flows")
    deposit_df = build_deposit_flows(merchants_df)
    deposit_df.to_parquet(os.path.join(RAW_DIR, "deposit_flows.parquet"), index=False)

    print("12. Writing merchants, descriptors, cardholders, campaigns, allocations, persona bios")
    _stringify_cols(merchants_df, ["daypart_profile", "outlets", "products_held"]).to_parquet(os.path.join(RAW_DIR, "merchants.parquet"), index=False)
    descriptors_df.to_parquet(os.path.join(RAW_DIR, "merchant_descriptors.parquet"), index=False)
    _stringify_cols(cardholders_df, ["category_affinity", "daypart_availability"]).to_parquet(os.path.join(RAW_DIR, "cardholders.parquet"), index=False)
    _stringify_cols(campaigns_df, ["target_segments", "days_of_week", "hours", "outlets", "recommended_window", "config_changes"]).to_parquet(
        os.path.join(RAW_DIR, "campaigns.parquet"), index=False)
    alloc_df.to_parquet(os.path.join(RAW_DIR, "allocations.parquet"), index=False)
    with open(os.path.join(RAW_DIR, "showcase_personas.json"), "w") as f:
        json.dump(build_showcase_bios(cohorts, facts), f, indent=2)
    with open(os.path.join(RAW_DIR, "cohorts.json"), "w") as f:
        json.dump(dict(cohorts, plants=dict(balance_fail=PLANT_BALANCE_FAIL, bands_fail=PLANT_BANDS_FAIL, no_scores=PLANT_NO_SCORES)), f)

    elapsed = (datetime.now() - t0).total_seconds()
    print("\n" + "=" * 70)
    print(f"DONE in {elapsed:.1f}s — data/raw/ only; run pipeline/run_all.py next")
    print("=" * 70)
    print(f"{'file':<45}{'rows':>12}")
    print("-" * 57)
    for name, n in [("merchants.parquet", len(merchants_df)), ("merchant_descriptors.parquet", len(descriptors_df)),
                    ("cardholders.parquet", len(cardholders_df)), ("card_transactions.parquet", len(card_txns_df)),
                    ("acquiring_transactions.parquet", len(acquiring_df)), ("token_map.parquet", len(token_map_df)),
                    ("deposit_flows.parquet", len(deposit_df)), ("campaigns.parquet", len(campaigns_df)),
                    ("allocations.parquet", len(alloc_df))]:
        print(f"{'data/raw/' + name:<45}{n:>12,}")
    by_m = card_txns_df.groupby("merchant_id")["card_id"].nunique()
    print(f"\nM0001 OCBC customers: {by_m.get('M0001', 0):,}   M0055: {by_m.get('M0055', 0):,}   "
          f"M0002: {by_m.get('M0002', 0):,}   M0004: {by_m.get('M0004', 0):,}")
    return dict(merchants_df=merchants_df, cardholders_df=cardholders_df, card_txns_df=card_txns_df,
                acquiring_df=acquiring_df, cohorts=cohorts, campaigns_df=campaigns_df, alloc_df=alloc_df)


if __name__ == "__main__":
    main()
