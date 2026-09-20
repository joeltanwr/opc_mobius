"""
pipeline/allocate.py — implements portfolio-allocator for the Soujourner demo campaign:
pool choice, consent, dormancy, portfolio frequency cap, ranking, push eligibility.
Per-customer output is raw-only; allocation_summary.json is aggregate.
"""

import os
from datetime import timedelta

import pandas as pd

from config import (DERIVED_DIR, DEMO_DATE, DEMO_CLOCK_NAIVE, FREQ_CAP_OFFERS, PUSH_CAP_PER_WEEK, PORTFOLIO_WEEKLY_CEIL_SHARE,
                    CONSTANTS, RETENTION_POOLS, SAMPLE_CARDHOLDERS, cap_from_share, cell, round_reach, in_catchment)

WEEK_START = DEMO_DATE - timedelta(days=DEMO_DATE.weekday())          # Monday of the demo week
WEEK_END = WEEK_START + timedelta(days=6)
CAP_WINDOW_START = DEMO_DATE - timedelta(days=30)


def _active_allocations(raw):
    alloc = raw["allocations"]
    camps = raw["campaigns"].set_index("campaign_id")
    active_ids = set(camps[camps["status"] == "active"].index)
    a = alloc[alloc["campaign_id"].isin(active_ids)].copy()
    a["allocated_date"] = pd.to_datetime(a["allocated_date"]).dt.date
    return a


def allocate(raw, tags, cohorts, rfm_by_merchant, mid="M0001"):
    cdf = cohorts[mid].copy()
    active = _active_allocations(raw)
    recent = active[active["allocated_date"] >= CAP_WINDOW_START]
    held = recent.groupby("card_id").size()
    pushes_this_week = active[active["pushed_at"].notna() & (active["pushed_at"].dt.date >= WEEK_START) & (active["pushed_at"].dt.date <= WEEK_END)]
    pushes = pushes_this_week.groupby("card_id").size()
    consent = raw["cardholder_by_id"]["marketing_consent"]

    rows = []
    b = cdf["source_merchant"].iloc[0] if len(cdf) else None
    visits_b = raw["card_txns"][raw["card_txns"]["merchant_id"] == b].groupby("card_id").size() if b and b != "category_peers" else pd.Series(dtype=int)
    for r in cdf.itertuples(index=False):
        reason = None if (r.exclusion_reason is None or (isinstance(r.exclusion_reason, float) and pd.isna(r.exclusion_reason))) else r.exclusion_reason
        if reason is None and not bool(consent.get(r.card_id, False)):
            reason = "consent"
        if reason is None and int(held.get(r.card_id, 0)) >= FREQ_CAP_OFFERS:
            reason = "frequency_cap"
        push_suppressed = reason is None and int(pushes.get(r.card_id, 0)) >= PUSH_CAP_PER_WEEK
        ch = raw["cardholder_by_id"].loc[r.card_id]
        propensity = float(visits_b.get(r.card_id, 1)) * float(ch["daypart_availability"].get("afternoon", 0.2))
        rows.append(dict(card_id=r.card_id, pool="acquisition", exclusion_reason=reason, propensity=round(propensity, 4),
                         push_suppressed=push_suppressed, pushes_this_week=int(pushes.get(r.card_id, 0)), offers_held_30d=int(held.get(r.card_id, 0))))
    df = pd.DataFrame(rows)
    final = df[df["exclusion_reason"].isna()].sort_values("propensity", ascending=False).reset_index(drop=True)
    final["rank"] = range(1, len(final) + 1)
    df = df.merge(final[["card_id", "rank"]], on="card_id", how="left")
    df.to_parquet(os.path.join(DERIVED_DIR, f"allocation_{mid}.parquet"), index=False)

    removed = df["exclusion_reason"].value_counts()
    pre_filter = int(len(cdf))
    arow = raw["merchant_by_id"].loc[mid]
    per_outlet = []
    for o in arow["outlets"]:
        n = sum(1 for cid in final["card_id"] if in_catchment(int(raw["cardholder_by_id"].loc[cid, "home_district"]),
                                                              int(raw["cardholder_by_id"].loc[cid, "work_district"]), int(o["district"])))
        c = cell(n); c.update(outlet_id=o["outlet_id"], name=o["name"])
        per_outlet.append(c)

    # Retention pools for the same merchant, post-consent.
    retention, retention_per_outlet = {}, {}
    if mid in rfm_by_merchant:
        rfm = rfm_by_merchant[mid]
        rfm = rfm[rfm["card_id"].notna()]
        rfm = rfm[rfm["card_id"].map(lambda c: bool(consent.get(c, False)))]
        counts = rfm["segment"].value_counts()
        retention = {s: cell(int(counts.get(s, 0))) for s in RETENTION_POOLS}
        retention["_note"] = "Existing customers by RFM segment, consented, OCBC-resolvable. Below-floor segments must be grouped before selection."

        # ------------------------------------------------------------------------------------
        # The same pools, per outlet — so the configuration screen can count whichever target
        # group is selected at each location rather than always reporting the acquisition pool.
        #
        # Counted on where these customers have actually transacted (sme_analysis attaches the
        # outlets each one uses), not on catchment: for somebody who already comes in, where they
        # come in is observed and does not need inferring. The acquisition pool above keeps its
        # catchment measure for the opposite reason.
        #
        # A customer who uses two outlets is counted at both, so these do not sum to the pool and
        # were never meant to — the screen says so rather than inviting the addition.
        # ------------------------------------------------------------------------------------
        if "outlets" in rfm.columns:
            for s in RETENTION_POOLS:
                pool = rfm[rfm["segment"] == s]
                cells = []
                for o in arow["outlets"]:
                    n = sum(1 for used in pool["outlets"] if o["outlet_id"] in (used or []))
                    c = cell(n)
                    c.update(outlet_id=o["outlet_id"], name=o["name"], district=o["district"])
                    if c["suppressed"]:
                        c["prompt"] = "Below the reporting floor on its own — group it with another outlet."
                    cells.append(c)
                retention_per_outlet[s] = cells

    # Portfolio exposure (RM only): the panel no merchant can see.
    # The ceiling is a share of the consented base, turned into a headcount here, against the base
    # this panel is actually counting — so the ceiling and the week's contacts are the same units.
    consented_base = round_reach(int(consent.sum()))
    weekly_ceiling = cap_from_share(PORTFOLIO_WEEKLY_CEIL_SHARE, consented_base)
    contacted_week = int(pushes_this_week["card_id"].nunique())
    concurrent = int((held >= 2).sum())
    summary = dict(
        merchant_id=mid, pool="acquisition", pool_basis="Non-customers from the top lift pair, filtered by catchment, price band and daypart (lift.py)",
        candidate_pool_before_filters=pre_filter,
        removed={k: int(removed.get(k, 0)) for k in ["already_customer", "catchment", "price_band", "daypart", "dormant", "consent", "frequency_cap"]},
        final_allocation=cell(len(final)), final_allocation_exact_is_raw_only=True,
        push=dict(eligible=round_reach(int((~final["push_suppressed"]).sum())), suppressed_count=int(final["push_suppressed"].sum()),
                  cap_per_week=PUSH_CAP_PER_WEEK, cap_provisional=CONSTANTS["PUSH_CAP_PER_WEEK"].provisional,
                  week=f"{WEEK_START.isoformat()} to {WEEK_END.isoformat()}",
                  note="Suppressed recipients still receive the feed card; only the push is withheld."),
        ranking_rule="highest propensity first — visits at the lift-source merchant × afternoon availability; not random, not alphabetical",
        frequency_cap=dict(offers_per_30_days=FREQ_CAP_OFFERS, provisional=CONSTANTS["FREQ_CAP_OFFERS"].provisional,
                           window=f"{CAP_WINDOW_START.isoformat()} to {DEMO_DATE.isoformat()}"),
        per_outlet=per_outlet, retention_pools=retention, retention_pools_per_outlet=retention_per_outlet,
        portfolio=dict(contacted_this_week=contacted_week, weekly_ceiling=weekly_ceiling,
                       weekly_ceiling_share_of_consented_base=PORTFOLIO_WEEKLY_CEIL_SHARE,
                       ceiling_provisional=CONSTANTS["PORTFOLIO_WEEKLY_CEIL_SHARE"].provisional,
                       ceiling_basis=(f"{PORTFOLIO_WEEKLY_CEIL_SHARE:.2%} of the {consented_base:,} consented cardholders on this panel. "
                                      f"The share is the constant; the headcount is computed against whichever base is on screen, "
                                      f"so it reads in the same units as the week's contacts."),
                       headroom_this_week=weekly_ceiling - contacted_week,
                       consented_base=consented_base,
                       share_of_consented_base_reached_pct=round(100 * contacted_week / consented_base, 2) if consented_base else None,
                       cardholders_with_2plus_concurrent_offers=concurrent, campaigns_live=int(raw["campaigns"]["status"].eq("active").sum()),
                       week=f"{WEEK_START.isoformat()} to {WEEK_END.isoformat()}",
                       note=f"Every count here is in sample units ({SAMPLE_CARDHOLDERS:,} cardholders), the ceiling included. The share behind it is provisional."),
    )
    return summary, df
