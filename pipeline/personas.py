"""pipeline/personas.py — showcase_personas.json: bios from raw, every number from the data.

The six showcase personas are the only per-customer records that ship (each flagged
is_illustrative). They also carry what the shared state module needs to run the live demo on
them: their own category weights, their push-cap state as of the demo week, and their real
offer history across every planted campaign — so a pushed card, a suppressed push and an expired
reward on screen all trace back to allocations.parquet rather than to a fixture.
"""

from datetime import date, timedelta

import numpy as np
import pandas as pd

from config import PERIOD_START, DEMO_DATE, PUSH_CAP_PER_WEEK

WEEK_START = DEMO_DATE - timedelta(days=DEMO_DATE.weekday())          # Monday of the demo week
WEEK_END = WEEK_START + timedelta(days=6)


def _offer_history(raw, cid):
    """Every allocation row this cardholder has, as the offer-card contract the customer view reads."""
    a = raw["allocations"]
    camps = raw["campaigns"].set_index("campaign_id")
    m_by_id = raw["merchant_by_id"]
    rows = a[(a["card_id"] == cid) & (a["arm"] == "treated")].sort_values("allocated_date")
    out = []
    for r in rows.itertuples(index=False):
        c = camps.loc[r.campaign_id]
        window_end = c["window_end"] if isinstance(c["window_end"], str) else None
        expired = bool(window_end and date.fromisoformat(window_end) < DEMO_DATE)
        pushed = None if pd.isna(r.pushed_at) else pd.Timestamp(r.pushed_at).isoformat()
        out.append(dict(campaign_id=r.campaign_id, merchant_id=r.merchant_id, merchant_name=m_by_id.loc[r.merchant_id, "canonical_name"],
                        campaign_name=c["name"], reward_type=c["reward_type"], offer_headline=c["offer_headline"], offer_terms=c["offer_terms"],
                        campaign_status=c["status"], allocated_date=str(r.allocated_date), pushed_at=pushed, push_suppressed=bool(r.push_suppressed),
                        status=("expired" if expired and r.status == "delivered" else r.status), window_end=window_end,
                        days_of_week=c["days_of_week"], hours=c["hours"]))
    return out


def _push_state(raw, cid):
    """Pushes received in the demo week and offers held in the last 30 days, from the allocation ledger."""
    a = raw["allocations"]
    mine = a[(a["card_id"] == cid) & (a["arm"] == "treated")]
    pushed = mine["pushed_at"].dropna()
    this_week = int(((pushed.dt.date >= WEEK_START) & (pushed.dt.date <= WEEK_END)).sum())
    camps = raw["campaigns"]
    active_ids = set(camps[camps["status"] == "active"]["campaign_id"])
    live = mine[mine["campaign_id"].isin(active_ids)]        # .isin, not .map: an empty .map mask selects columns
    held = int((pd.to_datetime(live["allocated_date"]).dt.date >= DEMO_DATE - timedelta(days=30)).sum())
    return dict(pushes_this_week=this_week, offers_held_30d=held, push_cap_per_week=PUSH_CAP_PER_WEEK,
                at_push_cap=this_week >= PUSH_CAP_PER_WEEK, week=f"{WEEK_START.isoformat()} to {WEEK_END.isoformat()}",
                basis="allocations.parquet pushed_at within the demo week; offers held = live campaigns allocated in the trailing 30 days")


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
        ch = raw["cardholder_by_id"].loc[cid]
        weights = {k: round(float(v), 5) for k, v in ch["category_affinity"].items()}
        out.append(dict(id=bio["id"], name=bio["name"], age=bio["age"], occupation=bio["occupation"], home_district=bio["home_district"],
                        card_product=str(ch["card_product"]), description=bio["description"],
                        signature_pattern=bio["signature_template"].format(**facts), role=bio["role"],
                        top_merchants=[dict(merchant_id=m, canonical_name=m_by_id.loc[m, "canonical_name"], visit_count=int(n)) for m, n in top.items()],
                        cohort_membership=membership, is_illustrative=True,
                        # The state module's seed: this cardholder's own data, shown back to them (customer view §5).
                        consent=dict(offers=bool(ch["marketing_consent"]), push=bool(ch["marketing_consent"]),
                                     basis="cardholders.parquet marketing_consent; push consent defaults to offers consent"),
                        profile=dict(category_weights=weights, daypart_availability={k: float(v) for k, v in ch["daypart_availability"].items()},
                                     price_band_pref=int(ch["price_band_pref"]), home_district=int(ch["home_district"]), work_district=int(ch["work_district"]),
                                     basis="generator category_affinity and daypart_availability — the weights a redemption updates"),
                        push_state=_push_state(raw, cid),
                        offers=_offer_history(raw, cid)))
    return out
