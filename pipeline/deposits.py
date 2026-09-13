"""pipeline/deposits.py — deposit_flows.json: one tile's worth per merchant, monthly balances for login merchants."""

from config import LOGIN_MERCHANTS, DEMO_DATE, ELIG_BALANCE_MONTHS


def build_deposits(raw):
    dep = raw["deposit_flows"]
    complete = dep[dep["month"] < DEMO_DATE.strftime("%Y-%m")]
    out = {}
    for mid, g in dep.groupby("merchant_id"):
        g = g.sort_values("month")
        gc = complete[complete["merchant_id"] == mid].sort_values("month")
        last6 = gc.tail(ELIG_BALANCE_MONTHS)
        m = raw["merchant_by_id"].loc[mid]
        entry = dict(
            months_of_data=int(len(gc)),
            avg_closing_balance_6m_sgd=round(float(last6["closing_balance_sgd"].mean()), 2) if len(last6) else None,
            credit_turnover_6m_sgd=round(float((last6["paynow_inflow_sgd"] + last6["card_settlement_sgd"]).sum()), 2) if len(last6) else None,
            balance_window=f"{last6['month'].iloc[0]} to {last6['month'].iloc[-1]}" if len(last6) else None,
            has_ocbc_operating_account=bool(g["has_ocbc_operating_account"].iloc[-1]),
            operating_account_opened_date=m["operating_account_opened_date"],
            relationship_start_date=m["relationship_start_date"],
        )
        if mid in LOGIN_MERCHANTS:
            entry["monthly"] = [dict(month=r["month"], closing_balance_sgd=round(float(r["closing_balance_sgd"]), 2),
                                     credit_turnover_sgd=round(float(r["paynow_inflow_sgd"] + r["card_settlement_sgd"]), 2))
                                for _, r in g.iterrows()]
        out[mid] = entry
    return out


def eligibility_inputs(raw, mid):
    """Average balance over the trailing 6 complete months + both score bands. Used by reward.py."""
    dep = raw["deposit_flows"]
    gc = dep[(dep["merchant_id"] == mid) & (dep["month"] < DEMO_DATE.strftime("%Y-%m"))].sort_values("month").tail(ELIG_BALANCE_MONTHS)
    m = raw["merchant_by_id"].loc[mid]
    avg_balance = round(float(gc["closing_balance_sgd"].mean()), 2) if len(gc) else None
    ib = int(m["internal_score_band"]) if m["internal_score_band"] is not None and str(m["internal_score_band"]) != "<NA>" else None
    eb = int(m["external_score_band"]) if m["external_score_band"] is not None and str(m["external_score_band"]) != "<NA>" else None
    return avg_balance, ib, eb, int(len(gc))
