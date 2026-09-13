"""pipeline/benchmarks.py — district × category aggregates for preview mode and cold start."""

from config import round_reach


def build_benchmarks(raw):
    txns = raw["card_txns"]
    m = raw["merchants"][["merchant_id", "category", "postal_district"]].rename(columns={"postal_district": "district"})
    merged = txns.merge(m, on="merchant_id", how="left")
    counts = m.groupby(["category", "district"]).size()
    out = []
    for (cat, district), grp in merged.groupby(["category", "district"]):
        out.append(dict(category=cat, district=int(district), n_merchants=int(counts.get((cat, district), 0)),
                        txn_count=int(len(grp)), avg_ticket_sgd=round(float(grp["amount_sgd"].mean()), 2),
                        unique_cardholders=round_reach(grp["card_id"].nunique())))
    return out
