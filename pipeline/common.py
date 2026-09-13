"""pipeline/common.py — raw loading, as-of filtering, JSON writing."""

import json
import os
import hashlib

import numpy as np
import pandas as pd

from config import RAW_DIR, DERIVED_DIR, PUB_DIR, DEMO_CLOCK_NAIVE, DEMO_DATE, PERIOD_START, DAYPARTS, DAYPART_HOURS

os.makedirs(DERIVED_DIR, exist_ok=True)
os.makedirs(PUB_DIR, exist_ok=True)


def _parse_json_col(df, cols):
    for c in cols:
        df[c] = df[c].apply(lambda v: json.loads(v) if isinstance(v, str) else v)
    return df


def load_raw():
    raw = {}
    raw["merchants"] = _parse_json_col(pd.read_parquet(os.path.join(RAW_DIR, "merchants.parquet")),
                                       ["daypart_profile", "outlets", "products_held"])
    raw["cardholders"] = _parse_json_col(pd.read_parquet(os.path.join(RAW_DIR, "cardholders.parquet")),
                                         ["category_affinity", "daypart_availability"])
    raw["card_txns"] = pd.read_parquet(os.path.join(RAW_DIR, "card_transactions.parquet"))
    raw["acquiring"] = pd.read_parquet(os.path.join(RAW_DIR, "acquiring_transactions.parquet"))
    raw["token_map"] = pd.read_parquet(os.path.join(RAW_DIR, "token_map.parquet"))
    raw["deposit_flows"] = pd.read_parquet(os.path.join(RAW_DIR, "deposit_flows.parquet"))
    raw["campaigns"] = _parse_json_col(pd.read_parquet(os.path.join(RAW_DIR, "campaigns.parquet")),
                                       ["target_segments", "days_of_week", "hours", "outlets", "recommended_window", "config_changes"])
    raw["allocations"] = pd.read_parquet(os.path.join(RAW_DIR, "allocations.parquet"))
    with open(os.path.join(RAW_DIR, "taxonomy.json")) as f:
        raw["taxonomy"] = json.load(f)
    with open(os.path.join(RAW_DIR, "showcase_personas.json")) as f:
        raw["persona_bios"] = json.load(f)
    with open(os.path.join(RAW_DIR, "cohorts.json")) as f:
        raw["cohorts"] = json.load(f)

    # As-of the demo clock: nothing after 2026-09-11 15:12 exists for any computation.
    for key in ("card_txns", "acquiring"):
        df = raw[key]
        raw[key] = df[df["txn_datetime"] <= DEMO_CLOCK_NAIVE].reset_index(drop=True)
    raw["merchant_by_id"] = raw["merchants"].set_index("merchant_id")
    raw["cardholder_by_id"] = raw["cardholders"].set_index("card_id")
    raw["category_label"] = {c["id"]: c["label"] for c in raw["taxonomy"]["categories"]}
    raw["category_group"] = {c["id"]: c["group"] for c in raw["taxonomy"]["categories"]}
    raw["aggregator_ids"] = set(raw["merchants"][raw["merchants"]["is_aggregator"]]["merchant_id"])
    raw["token_to_card"] = dict(zip(raw["token_map"]["customer_token"], raw["token_map"]["card_id"]))
    return raw


def months_in_window():
    """Number of months from PERIOD_START to the demo clock, for per-month rates."""
    return (DEMO_DATE - PERIOD_START).days / 30.44


def daypart_of_hour(h):
    for d in DAYPARTS:
        lo, hi = DAYPART_HOURS[d]
        if lo <= h < hi:
            return d
    return "late"


def _default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, (set, frozenset)):
        return sorted(o)
    if hasattr(o, "isoformat"):
        return o.isoformat()
    if pd.isna(o):
        return None
    return str(o)


def dump_json(obj, name):
    path = os.path.join(PUB_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False, default=_default)
    return os.path.getsize(path)


def load_pub(name):
    with open(os.path.join(PUB_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def hash_public(exclude=("rationales.json",)):
    """sha256 over every public/data file except the excluded ones — the rationales inputs_hash."""
    h = hashlib.sha256()
    for fn in sorted(os.listdir(PUB_DIR)):
        if fn in exclude or not fn.endswith(".json"):
            continue
        h.update(fn.encode())
        with open(os.path.join(PUB_DIR, fn), "rb") as f:
            h.update(f.read())
    return h.hexdigest()


def pct(a, b, digits=1):
    return round(100.0 * a / b, digits) if b else None


def key_merchants(raw):
    """Merchants that get full-depth output: the three login merchants plus anyone with a campaign or application."""
    from config import LOGIN_MERCHANTS
    return list(dict.fromkeys(LOGIN_MERCHANTS + raw["campaigns"]["merchant_id"].tolist()))
