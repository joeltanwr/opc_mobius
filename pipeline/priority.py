"""pipeline/priority.py — implements sme-relationship-value-score.md. RM-only output."""

import numpy as np
import pandas as pd

from config import PRIORITY_TIERS, DEMO_DATE


def _months_before_clock(df):
    return df[df["month"] < DEMO_DATE.strftime("%Y-%m")]      # complete months only


def build_priority(raw):
    dep = _months_before_clock(raw["deposit_flows"])
    m_by_id = raw["merchant_by_id"]
    rows = []
    for mid, g in dep.groupby("merchant_id"):
        g = g.sort_values("month")
        last6 = g.tail(6)
        m = m_by_id.loc[mid]
        bands = [b for b in (m["internal_score_band"], m["external_score_band"]) if pd.notna(b)]
        months = len(g)
        turnover_ann = float((last6["paynow_inflow_sgd"] + last6["card_settlement_sgd"]).sum()) * 2
        avg_casa = float(last6["closing_balance_sgd"].mean())
        insufficient = months < 6 or not bands
        rows.append(dict(merchant_id=mid, months=months, turnover_ann=turnover_ann, avg_casa=avg_casa,
                         capture_ratio=float(np.clip(avg_casa / turnover_ann if turnover_ann else 1.0, 0.01, 1.0)),
                         best_band=int(min(bands)) if bands else None, insufficient=insufficient,
                         window=f"{last6['month'].iloc[0]} to {last6['month'].iloc[-1]}"))
    df = pd.DataFrame(rows)
    pool = df[~df["insufficient"]].copy()
    pool["size_points"] = pool["turnover_ann"].rank(pct=True) * 40
    pool["upside_points"] = (1 - pool["capture_ratio"].rank(pct=True)) * 40
    pool["quality_points"] = pool["best_band"].map({1: 20, 2: 10}).fillna(0)
    pool["score"] = pool["size_points"] + pool["upside_points"] + pool["quality_points"]

    def tier(score):
        for cut, name in PRIORITY_TIERS:
            if score >= cut:
                return name
        return "low"

    out = {}
    for _, r in df.iterrows():
        if r["insufficient"]:
            out[r["merchant_id"]] = dict(merchant_id=r["merchant_id"], tier="insufficient_data", score=None,
                                         basis="insufficient_data",
                                         rm_text="Not enough relationship history to prioritise — assess after 6 months of transaction data.",
                                         inputs_used=dict(months_of_data=int(r["months"]), best_score_band=r["best_band"]),
                                         flags=["illustrative_rates", "pd_band_direction_unconfirmed"])
            continue
        p = pool[pool["merchant_id"] == r["merchant_id"]].iloc[0]
        out[r["merchant_id"]] = dict(
            merchant_id=r["merchant_id"], tier=tier(p["score"]), score=int(round(p["score"])),
            components=dict(size_points=round(float(p["size_points"]), 1), upside_points=round(float(p["upside_points"]), 1),
                            quality_points=int(p["quality_points"])),
            inputs_used=dict(turnover_ann_sgd=int(round(r["turnover_ann"])), avg_casa_6m_sgd=int(round(r["avg_casa"])),
                             capture_ratio=round(float(r["capture_ratio"]), 3), best_score_band=r["best_band"],
                             pool_size=int(len(pool)), data_window=r["window"]),
            flags=["illustrative_rates", "pd_band_direction_unconfirmed"],
        )
    return out
