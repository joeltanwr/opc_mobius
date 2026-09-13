"""pipeline/personas.py — showcase_personas.json: bios from raw, every number from the data."""

import numpy as np

from config import PERIOD_START, DEMO_DATE


def build_personas(raw, cohorts, allocation_df, rfm_by_merchant):
    txns = raw["card_txns"]
    m_by_id = raw["merchant_by_id"]
    weeks = (DEMO_DATE - PERIOD_START).days / 7
    alloc = allocation_df.set_index("card_id") if allocation_df is not None else None
    rfm = rfm_by_merchant.get("M0001")
    rfm_by_card = dict(zip(rfm["card_id"], rfm["segment"])) if rfm is not None else {}
    cohort = cohorts.get("M0001")
    excl = dict(zip(cohort["card_id"], cohort["exclusion_reason"])) if cohort is not None else {}
    out = []
    for bio in raw["persona_bios"]:
        cid = bio["card_id"]
        t = txns[txns["card_id"] == cid]
        top = t.groupby("merchant_id").size().sort_values(ascending=False).head(5)
        facts = {}
        if bio["id"] == "alvin":
            facts["alvin_visits"] = int((t["merchant_id"] == "M0001").sum())
        elif bio["id"] == "bernice":
            facts["bernice_days_per_week"] = int(round((t["merchant_id"] == "M0055").sum() / weeks))
        elif bio["id"] == "charles":
            facts["charles_avg_ticket"] = int(round(float(t["amount_sgd"].mean())))
        elif bio["id"] == "denise":
            days = sorted(t["txn_datetime"].dt.date.unique())
            gaps = [(days[i + 1] - days[i]).days for i in range(len(days) - 1)]
            gi = int(np.argmax(gaps))
            burst_day = days[gi + 1]
            facts["denise_gap_days"] = int(max(gaps))
            facts["denise_burst_total"] = int(round(float(t[t["txn_datetime"].dt.date == burst_day]["amount_sgd"].sum())))
        elif bio["id"] == "edwin":
            facts["edwin_n"] = int(len(t)); facts["edwin_avg"] = int(round(float(t["amount_sgd"].mean())))
        elif bio["id"] == "farah":
            facts["farah_n"] = int(len(t))
        membership = []
        if alloc is not None and cid in alloc.index:
            row = alloc.loc[cid]
            if row["exclusion_reason"] is None or (isinstance(row["exclusion_reason"], float) and np.isnan(row["exclusion_reason"])):
                membership.append("soujourner_acquisition_cohort")
                if bool(row["push_suppressed"]):
                    membership.append("push_suppressed_frequency_cap")
            else:
                membership.append(f"excluded:{row['exclusion_reason']}")
        elif cid in excl:
            membership.append(f"excluded:{excl[cid]}")
        if cid in rfm_by_card:
            membership.append(f"soujourner_rfm:{rfm_by_card[cid]}")
        out.append(dict(id=bio["id"], name=bio["name"], age=bio["age"], occupation=bio["occupation"], home_district=bio["home_district"],
                        card_product=str(raw["cardholder_by_id"].loc[cid, "card_product"]), description=bio["description"],
                        signature_pattern=bio["signature_template"].format(**facts), role=bio["role"],
                        top_merchants=[dict(merchant_id=m, canonical_name=m_by_id.loc[m, "canonical_name"], visit_count=int(n)) for m, n in top.items()],
                        cohort_membership=membership, is_illustrative=True))
    return out
