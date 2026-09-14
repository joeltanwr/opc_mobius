"""
pipeline/lift.py — merchant-pair lift, aggregator exclusion, cohort = B \\ A filtered by
catchment / price band / daypart, exclusion reasons per cardholder (raw-only).

Writes affinity.json and segments.json. Segments carry counts and labels only — never a
composition breakdown of people who have not visited the merchant (merchant prompt §2.1).
"""

import os

import numpy as np
import pandas as pd

from config import (DERIVED_DIR, LOGIN_MERCHANTS, LIFT_MIN_SUPPORT, LIFT_PRICE_BAND_TOLERANCE, LIFT_MIN_DAYPART_AVAILABILITY,
                    MIN_SEGMENT_SIZE, cell, round_reach, in_catchment)
from narrowing import narrowing_table

EXCLUSION_ORDER = ["already_customer", "aggregator_source", "catchment", "price_band", "daypart", "consent", "frequency_cap", "dormant"]


def _lift(by_merchant, a, b, n_total):
    A, B = by_merchant.get(a, set()), by_merchant.get(b, set())
    if not A or not B:
        return 0.0, 0
    support = len(A & B)
    p_a, p_a_given_b = len(A) / n_total, support / len(B)
    return (p_a_given_b / p_a if p_a else 0.0), support


def build_cohort(raw, tags, a, b, gap_daypart, by_merchant):
    """Every cardholder of B evaluated against A's filters; first failing reason recorded."""
    arow = raw["merchant_by_id"].loc[a]
    A = by_merchant.get(a, set())
    dormant = set(tags[tags["dormant"]]["card_id"])
    rows = []
    for cid in sorted(by_merchant.get(b, set())):
        ch = raw["cardholder_by_id"].loc[cid]
        reason = None
        if cid in A:
            reason = "already_customer"
        elif not in_catchment(int(ch["home_district"]), int(ch["work_district"]), int(arow["postal_district"])):
            reason = "catchment"
        elif abs(float(ch["price_band_pref"]) - float(arow["price_band"])) > LIFT_PRICE_BAND_TOLERANCE:
            reason = "price_band"
        elif gap_daypart and ch["daypart_availability"].get(gap_daypart, 0) < LIFT_MIN_DAYPART_AVAILABILITY:
            reason = "daypart"
        elif cid in dormant:
            reason = "dormant"
        rows.append(dict(card_id=cid, source_merchant=b, exclusion_reason=reason))
    return pd.DataFrame(rows)


def build_affinity_and_segments(raw, tags, gaps_by_merchant, profiles):
    txns = raw["card_txns"]
    by_merchant = txns.groupby("merchant_id")["card_id"].apply(set).to_dict()
    n_total = len(raw["cardholders"])
    m_by_id = raw["merchant_by_id"]
    affinity, segments, cohorts = {}, {}, {}

    for a in LOGIN_MERCHANTS:
        arow = m_by_id.loc[a]
        gap = gaps_by_merchant.get(a, {})
        gap_daypart = gap.get("daypart") if gap.get("type") == "off_peak" else None
        cands = []
        excluded_aggregators = 0
        for b, B in by_merchant.items():
            if b == a:
                continue
            if b in raw["aggregator_ids"]:
                l, s = _lift(by_merchant, a, b, n_total)
                if s >= LIFT_MIN_SUPPORT:
                    excluded_aggregators += 1
                continue
            l, s = _lift(by_merchant, a, b, n_total)
            if s >= LIFT_MIN_SUPPORT:
                cands.append(dict(merchant_id=b, name=m_by_id.loc[b, "canonical_name"], category=m_by_id.loc[b, "category"],
                                  lift=round(float(l), 3), support=int(s)))
        cands.sort(key=lambda c: (-c["lift"], -c["support"]))
        top = cands[:10]
        base = dict(merchant_id=a, source=profiles[a]["data_source"]["coverage"], min_support=LIFT_MIN_SUPPORT,
                    aggregators_excluded=excluded_aggregators, basis="lift(A,B) = P(A|B)/P(A) over OCBC cardholders; aggregators excluded; support ≥ 20")

        if not top:
            # Cold start: category-and-catchment peers instead of the merchant's own history.
            peers = raw["merchants"][(raw["merchants"]["category"] == arow["category"]) & (raw["merchants"]["merchant_id"] != a)]["merchant_id"].tolist()
            peer_customers = set().union(*[by_merchant.get(p, set()) for p in peers])
            df = pd.DataFrame(dict(card_id=sorted(peer_customers - by_merchant.get(a, set()))))
            rows = []
            for cid in df["card_id"]:
                ch = raw["cardholder_by_id"].loc[cid]
                reason = None
                if not in_catchment(int(ch["home_district"]), int(ch["work_district"]), int(arow["postal_district"])):
                    reason = "catchment"
                elif abs(float(ch["price_band_pref"]) - float(arow["price_band"])) > LIFT_PRICE_BAND_TOLERANCE:
                    reason = "price_band"
                rows.append(dict(card_id=cid, source_merchant="category_peers", exclusion_reason=reason))
            cdf = pd.DataFrame(rows)
            size = int((cdf["exclusion_reason"].isna()).sum()) if len(cdf) else 0
            affinity[a] = dict(base, available=True, cold_start_fallback=True, based_on_category_peers=peers, pairs=[])
            segments[a] = [dict(segment_id=f"{a}_category_peers", source="category_catchment_fallback",
                                label=f"{raw['category_label'][arow['category']]} shoppers at nearby peer merchants, not yet at {arow['canonical_name']}",
                                reach=cell(size), filters=_filter_summary(cdf),
                                description="Cardholders who buy from comparable merchants in the same category, within reach of this outlet and in its price band, and have not transacted here.")]
            cohorts[a] = cdf
            continue

        affinity[a] = dict(base, available=True, cold_start_fallback=False, pairs=top)
        seg_list = []
        for cand in top[:3]:
            b = cand["merchant_id"]
            cdf = build_cohort(raw, tags, a, b, gap_daypart, by_merchant)
            size = int(cdf["exclusion_reason"].isna().sum())
            seg_list.append(dict(
                segment_id=f"{a}_lift_{b}", source="lift", candidate_merchant=b, candidate_name=cand["name"],
                candidate_category=raw["category_label"][cand["category"]], lift=cand["lift"], support=cand["support"],
                label=f"Regulars at a nearby {raw['category_label'][cand['category']].lower()}, not yet at {arow['canonical_name']}",
                description=(f"OCBC cardholders who regularly visit a comparable {raw['category_label'][cand['category']].lower()} in the same price band, "
                             f"are within reach of your outlets" + (f", and are usually free in the {gap_daypart}" if gap_daypart else "") + ". None has transacted with you."),
                reach=cell(size), filters=_filter_summary(cdf),
                per_outlet=_per_outlet(raw, arow, cdf),
                # The narrowing agent's whole world (merchant §7.1): only for the segment a campaign is built on.
                narrowing=narrowing_table(raw, arow, cdf) if b == top[0]["merchant_id"] else None,
            ))
            if b == top[0]["merchant_id"]:
                cohorts[a] = cdf
        segments[a] = seg_list

    for a, cdf in cohorts.items():
        cdf.to_parquet(os.path.join(DERIVED_DIR, f"cohort_{a}.parquet"), index=False)
    return affinity, segments, cohorts


def _filter_summary(cdf):
    counts = cdf["exclusion_reason"].value_counts()
    return dict(evaluated=int(len(cdf)), removed={r: int(counts.get(r, 0)) for r in EXCLUSION_ORDER if counts.get(r, 0)},
                note="Counts of people removed by each rule, in the order the rules run. Consent and the frequency cap are applied at allocation.")


def _per_outlet(raw, arow, cdf):
    out = []
    survivors = cdf[cdf["exclusion_reason"].isna()]["card_id"]
    for o in arow["outlets"]:
        n = sum(1 for cid in survivors
                if in_catchment(int(raw["cardholder_by_id"].loc[cid, "home_district"]), int(raw["cardholder_by_id"].loc[cid, "work_district"]), int(o["district"])))
        c = cell(n)
        c.update(outlet_id=o["outlet_id"], name=o["name"], district=o["district"])
        if c["suppressed"]:
            c["prompt"] = "Below the reporting floor on its own — group it with another outlet."
        out.append(c)
    return out
