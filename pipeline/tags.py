"""
pipeline/tags.py — implements retailer-transaction-data-analysis.

Per-cardholder tags: dormancy, resident country, local/foreign top categories,
frequency tier, timing and location tags. Raw-only output (data/derived/), never shipped.
"""

import os

import numpy as np
import pandas as pd

from config import DERIVED_DIR, DORMANT_TXN_PER_MONTH, DORMANT_PERCENTILE
from common import months_in_window, daypart_of_hour


def build_tags(raw):
    txns = raw["card_txns"]
    ch = raw["cardholders"]
    months = months_in_window()

    per_card = txns.groupby("card_id").agg(n_txn=("txn_id", "count"), spend=("amount_sgd", "sum")).reindex(ch["card_id"]).fillna(0)
    per_card["txn_per_month"] = per_card["n_txn"] / months

    # Step 1 — dormancy: min(fixed cutoff, 10th percentile), the stricter test.
    p10 = float(np.percentile(per_card["txn_per_month"], DORMANT_PERCENTILE))
    threshold = min(DORMANT_TXN_PER_MONTH, p10)
    per_card["dormant"] = per_card["txn_per_month"] < threshold

    # Step 2 — resident country: transaction-majority country overrides mailing address.
    country_counts = txns.groupby(["card_id", "country"]).size().unstack(fill_value=0)
    majority = country_counts.idxmax(axis=1).reindex(ch["card_id"]).fillna("SG")
    mailing = ch.set_index("card_id")["mailing_country"]
    per_card["resident_country"] = majority.values
    per_card["mailing_country"] = mailing.reindex(per_card.index).values
    per_card["mailing_override"] = per_card["resident_country"] != per_card["mailing_country"]

    # Step 3 — local / foreign category split (top 3 by spend), non-dormant only.
    m_cat = raw["merchant_by_id"]["category"]
    t = txns[["card_id", "merchant_id", "amount_sgd", "country", "txn_datetime", "merchant_district"]].copy()
    t["category"] = t["merchant_id"].map(m_cat)
    t["resident"] = t["card_id"].map(per_card["resident_country"])
    t["is_local"] = t["country"] == t["resident"]

    def top_cats(sub):
        s = sub.groupby(["card_id", "category"])["amount_sgd"].sum().reset_index()
        s = s.sort_values(["card_id", "amount_sgd"], ascending=[True, False])
        return s.groupby("card_id")["category"].apply(lambda x: list(x[:3]))

    local_top = top_cats(t[t["is_local"]])
    foreign_top = top_cats(t[~t["is_local"]])
    per_card["local_top_categories"] = local_top.reindex(per_card.index).apply(lambda v: v if isinstance(v, list) else [])
    per_card["foreign_top_categories"] = foreign_top.reindex(per_card.index).apply(lambda v: v if isinstance(v, list) else [])

    # Timing tag: dominant daypart. Location tag: dominant merchant district.
    t["daypart"] = t["txn_datetime"].dt.hour.map(daypart_of_hour)
    dom_dp = t.groupby(["card_id", "daypart"]).size().unstack(fill_value=0).idxmax(axis=1)
    dom_dist = t.groupby(["card_id", "merchant_district"]).size().unstack(fill_value=0).idxmax(axis=1)
    per_card["timing_tag"] = dom_dp.reindex(per_card.index).fillna("none")
    per_card["location_tag"] = dom_dist.reindex(per_card.index).fillna(0).astype(int)

    # Frequency tier among the non-dormant: tertiles of transaction count.
    active = per_card[~per_card["dormant"]]
    q1, q2 = active["n_txn"].quantile([1 / 3, 2 / 3]).tolist()
    per_card["frequency_tier"] = np.where(per_card["dormant"], "dormant",
                                          np.where(per_card["n_txn"] >= q2, "high",
                                                   np.where(per_card["n_txn"] >= q1, "regular", "occasional")))
    per_card["marketing_consent"] = ch.set_index("card_id")["marketing_consent"].reindex(per_card.index).values
    per_card["engagement_tier"] = ch.set_index("card_id")["engagement_tier"].reindex(per_card.index).values
    per_card = per_card.reset_index().rename(columns={"index": "card_id"})

    out = per_card.copy()
    for c in ("local_top_categories", "foreign_top_categories"):
        out[c] = out[c].apply(lambda v: "|".join(v))
    out.to_parquet(os.path.join(DERIVED_DIR, "cardholder_tags.parquet"), index=False)

    summary = dict(
        dormancy_threshold_txn_per_month=round(threshold, 3),
        dormancy_fixed_cutoff=DORMANT_TXN_PER_MONTH, dormancy_p10=round(p10, 3),
        dormant_count=int(per_card["dormant"].sum()), cardholders=int(len(per_card)),
        mailing_override_count=int(per_card["mailing_override"].sum()),
        frequency_tier_cutoffs={"regular_min_txns": int(q1), "high_min_txns": int(q2)},
    )
    return per_card, summary
