"""
pipeline/campaign.py — measures every planted campaign from allocations + transactions.
Completed campaigns get treated-vs-control incrementality, reward cost (merchant's full cost),
net contribution, redeemer profile and 30-day return. Writes campaign_results.json.
"""

from datetime import date, timedelta

import numpy as np
import pandas as pd

from config import (DEMO_DATE, ASSUMED_GROSS_MARGIN, RETURN_WINDOW_DAYS, CONSTANTS, AGE_BANDS, RFM_SEGMENTS, STATUS_DISPLAY,
                    composition, floor_policy, round_reach)
from sme_analysis import merchant_source, rfm_table


_REDEEMER_SUBJECT = "cardholders redeemed this offer"


def _reward_cost(amounts, pct_off, cap):
    if pct_off is None:
        return 0.0
    c = amounts * pct_off / 100.0
    if cap is not None:
        c = np.minimum(c, cap)
    return float(c.sum())


def measure_completed(raw, camp, alloc):
    mid = camp["merchant_id"]
    src, _ = merchant_source(raw, mid)
    ws, we = date.fromisoformat(camp["window_start"]), date.fromisoformat(camp["window_end"])
    treated = set(alloc[alloc["arm"] == "treated"]["card_id"]); control = set(alloc[alloc["arm"] == "control"]["card_id"])
    s = src[src["card_id"].notna()]
    win = s[(s["date"] >= ws) & (s["date"] <= we)]
    tw, cw = win[win["card_id"].isin(treated)], win[win["card_id"].isin(control)]
    t_conv, c_conv = set(tw["card_id"]), set(cw["card_id"])
    tagged = tw[tw["campaign_id"] == camp["campaign_id"]]
    redeemers = set(tagged["card_id"])
    nT, nC = len(treated), len(control)
    scale = nT / nC if nC else 0
    t_sales, c_sales = float(tw["amount"].sum()), float(cw["amount"].sum())
    incr_sales = t_sales - c_sales * scale
    incr_txns = len(tw) - len(cw) * scale
    cost = _reward_cost(tagged["amount"].to_numpy(), camp["discount_pct"], camp["cap_per_txn_sgd"])
    net = incr_sales * ASSUMED_GROSS_MARGIN - cost

    # New vs returning: had the redeemer transacted here before the window?
    before = s[s["date"] < ws]
    prior = set(before["card_id"])
    new_redeemers = [c for c in redeemers if c not in prior]
    # 30-day unprompted return: an untagged visit within 30 days after the last redemption.
    returned = 0
    for c in redeemers:
        last_red = tagged[tagged["card_id"] == c]["date"].max()
        later = s[(s["card_id"] == c) & (s["date"] > last_red) & (s["date"] <= last_red + timedelta(days=RETURN_WINDOW_DAYS)) & (s["campaign_id"] != camp["campaign_id"])]
        if len(later):
            returned += 1
    c_returned = 0
    for c in c_conv:
        first = cw[cw["card_id"] == c]["date"].min()
        later = s[(s["card_id"] == c) & (s["date"] > first) & (s["date"] <= first + timedelta(days=RETURN_WINDOW_DAYS))]
        if len(later):
            c_returned += 1
    further = s[(s["card_id"].isin(redeemers)) & (s["date"] > we) & (s["date"] <= we + timedelta(days=RETURN_WINDOW_DAYS))].groupby("card_id").size()

    ages = raw["cardholder_by_id"].loc[list(redeemers), "age_band"].value_counts() if redeemers else pd.Series(dtype=int)
    rfm_at_start = rfm_table(src, ws - timedelta(days=1))
    seg = rfm_at_start["segment"] if len(rfm_at_start) else pd.Series(dtype=str)
    seg_counts = {}
    for c in redeemers:
        tok = s[s["card_id"] == c]["cust"].iloc[0]
        name = seg.get(tok, "New to business") if len(seg) else "New to business"
        seg_counts[name] = seg_counts.get(name, 0) + 1

    redemption_rate = len(redeemers) / nT if nT else 0
    t_rate, c_rate = len(t_conv) / nT if nT else 0, len(c_conv) / nC if nC else 0
    losing = net < 0
    verdict = (
        (f"Redemption rate was {redemption_rate * 100:.0f}%, but {len(redeemers) - len(new_redeemers)} of {len(redeemers)} redeemers were existing customers "
         f"and the control group spent S${c_sales * scale:,.0f} against the treated group's S${t_sales:,.0f}. The reward mostly discounted trade you were "
         f"already taking in the {_window_label(camp)} window. Redemption rate measures popularity, not incremental trade.")
        if losing else
        (f"{t_rate * 100:.0f}% of treated cardholders made a first visit against {c_rate * 100:.0f}% of the matched control — {(t_rate - c_rate) * 100:.0f} points of "
         f"conversion the offer caused. {returned} of {len(redeemers)} redeemers came back unprompted within {RETURN_WINDOW_DAYS} days. "
         f"Incremental sales of S${incr_sales:,.0f} against a reward cost of S${cost:,.0f} cleared the cost at an assumed {ASSUMED_GROSS_MARGIN * 100:.0f}% margin.")
    )
    return dict(
        campaign_id=camp["campaign_id"], merchant_id=mid, name=camp["name"], status="completed", status_display=STATUS_DISPLAY["completed"],
        measured=True, window=f"{ws.isoformat()} to {we.isoformat()}",
        configuration=_config_block(camp),
        cohort=dict(treated=nT, control=nC, basis="allocations.parquet arms; control never received the offer"),
        conversion=dict(treated_converters=len(t_conv), treated_rate_pct=round(t_rate * 100, 1), control_converters=len(c_conv),
                        control_rate_pct=round(c_rate * 100, 1), lift_points=round((t_rate - c_rate) * 100, 1),
                        definition="share of the arm with at least one transaction at the merchant inside the window"),
        redemption=dict(redeemers=len(redeemers), redeemed_transactions=int(len(tagged)), redemption_rate_pct=round(redemption_rate * 100, 1),
                        avg_ticket_sgd=round(float(tagged["amount"].mean()), 2) if len(tagged) else None),
        incremental=dict(treated_sales_sgd=round(t_sales, 2), control_sales_scaled_sgd=round(c_sales * scale, 2), incremental_sales_sgd=round(incr_sales, 2),
                         incremental_transactions=round(incr_txns, 1), basis="treated window sales minus control window sales scaled by treated/control size"),
        cost=dict(reward_cost_sgd=round(cost, 2), funded_by="merchant", basis="Σ min(discount × ticket, cap) over redeemed transactions — the merchant's whole cost",
                  gross_margin_assumed=ASSUMED_GROSS_MARGIN, gross_margin_provisional=CONSTANTS["ASSUMED_GROSS_MARGIN"].provisional,
                  net_contribution_sgd=round(net, 2), net_sign="negative" if losing else "positive"),
        redeemer_profile=dict(new_to_business=len(new_redeemers), returning=len(redeemers) - len(new_redeemers),
                              new_vs_returning_basis=("A redeemer who had not bought here before the window is new. Read off your own "
                                                      "transactions, so it is reported exactly rather than floored or rounded."),
                              age_bands=composition({b: int(ages.get(b, 0)) for b in AGE_BANDS}, len(redeemers),
                                                    "age band", _REDEEMER_SUBJECT),
                              rfm_at_redemption=composition(dict(sorted(seg_counts.items(), key=lambda kv: -kv[1])), len(redeemers),
                                                            "RFM segment", _REDEEMER_SUBJECT),
                              note="Aggregate only; cardholders reached but not redeeming are not profiled"),
        floor_policy=floor_policy(["redeemer_profile.age_bands", "redeemer_profile.rfm_at_redemption"],
                                  ["redemption.redeemers", "redeemer_profile.new_to_business", "redeemer_profile.returning",
                                   "repeat", "incremental", "cost"]),
        repeat=dict(returned_within_30d=returned, return_rate_pct=round(100 * returned / len(redeemers), 1) if redeemers else None,
                    control_returned=c_returned, control_return_rate_pct=round(100 * c_returned / len(c_conv), 1) if c_conv else None,
                    further_visits_distribution={"1": int((further == 1).sum()), "2": int((further == 2).sum()), "3+": int((further >= 3).sum())},
                    basis=(f"An untagged visit at your outlets within {RETURN_WINDOW_DAYS} days of the redemption, measured the same way on the "
                           "control group. Counted from your own transactions and reported exactly — the floor governs composition, not your own trade.")),
        verdict=verdict,
        operating_account=dict(opened=bool(raw["merchant_by_id"].loc[mid, "operating_account_opened_date"]),
                               date=raw["merchant_by_id"].loc[mid, "operating_account_opened_date"]) if camp["campaign_id"] == "C-SJ-02" else None,
    )


def _window_label(camp):
    from config import WEEKDAY_NAMES
    d = camp["days_of_week"]
    days = f"{WEEKDAY_NAMES[d[0]]}–{WEEKDAY_NAMES[d[-1]]}" if len(d) > 1 and d == list(range(d[0], d[-1] + 1)) else "/".join(WEEKDAY_NAMES[x] for x in d)
    return f"{days} {camp['hours'][0]:02d}:00–{camp['hours'][1]:02d}:00"


def _config_block(camp):
    return dict(reward_type=camp["reward_type"], offer_headline=camp["offer_headline"], offer_terms=camp["offer_terms"],
                discount_pct=camp["discount_pct"], cap_per_txn_sgd=camp["cap_per_txn_sgd"], target_pool=camp["target_pool"],
                target_segments=camp["target_segments"], days_of_week=camp["days_of_week"], hours=camp["hours"], outlets=camp["outlets"],
                channel=dict(feed=True, push_requested=bool(camp["channel_push"]), push_granted=bool(camp["channel_push"])),
                redemption_limit=camp["redemption_limit"], per_customer_limit=camp["per_customer_limit"],
                max_cost_sgd=(camp["redemption_limit"] * camp["cap_per_txn_sgd"]) if camp["redemption_limit"] and camp["cap_per_txn_sgd"] else None,
                recommended_window=camp["recommended_window"], changes_from_recommendation=camp["config_changes"],
                new_or_returning="New customer" if camp["target_pool"] == "acquisition" else "Returning customer")


def summarise_unmeasured(raw, camp, alloc):
    """Campaigns without transaction-level data for their merchant: delivery and redemption counts only."""
    status = camp["status"]
    ws = date.fromisoformat(camp["window_start"]) if camp["window_start"] else None
    we = date.fromisoformat(camp["window_end"]) if camp["window_end"] else None
    treated = alloc[alloc["arm"] == "treated"]
    out = dict(campaign_id=camp["campaign_id"], merchant_id=camp["merchant_id"], name=camp["name"], status=status,
               status_display=STATUS_DISPLAY[status], measured=False,
               window=f"{ws.isoformat()} to {we.isoformat()}" if ws else None, configuration=_config_block(camp),
               reach=round_reach(len(treated)), redemptions=int((treated["status"] == "redeemed").sum()),
               pushed=int(treated["pushed_at"].notna().sum()),
               note="No transaction-level acquiring data is loaded for this merchant in the demo, so incremental sales and net are not computed.")
    if status == "active":
        out["days_remaining"] = (we - DEMO_DATE).days
        out["days_elapsed"] = (DEMO_DATE - ws).days
    return out


def build_campaign_results(raw, recommendations, priority):
    camps = raw["campaigns"]
    alloc = raw["allocations"]
    m_by_id = raw["merchant_by_id"]
    completed, active, applied = [], [], []
    for _, camp in camps.iterrows():
        a = alloc[alloc["campaign_id"] == camp["campaign_id"]]
        if camp["status"] == "completed" and camp["merchant_id"] == "M0001":
            completed.append(measure_completed(raw, camp, a))
        elif camp["status"] == "completed":
            completed.append(summarise_unmeasured(raw, camp, a))
        elif camp["status"] == "active":
            active.append(summarise_unmeasured(raw, camp, a))
        elif camp["status"] == "applied":
            rec = recommendations.get(camp["merchant_id"], {})
            top = next((r for r in (rec.get("ranked") or []) if not r["disabled"]), None)
            applied.append(dict(campaign_id=camp["campaign_id"], merchant_id=camp["merchant_id"], merchant_name=m_by_id.loc[camp["merchant_id"], "canonical_name"],
                                sector=m_by_id.loc[camp["merchant_id"], "sector"], status="applied", status_display=STATUS_DISPLAY["applied"],
                                applied_at=camp["applied_at"], days_waiting=(DEMO_DATE - date.fromisoformat(camp["applied_at"])).days,
                                eligibility=rec.get("eligibility"), recommended_reward=(dict(type=top["type"], label=top["label"]) if top else None),
                                priority=priority.get(camp["merchant_id"]),
                                rm_message="A relationship manager will be in touch within the week."))
    completed.sort(key=lambda c: c["window"] or "", reverse=True)
    return dict(completed=completed, active=active, applied=applied, status_display=STATUS_DISPLAY,
                basis="Every figure computed from allocations.parquet and campaign-tagged transactions; nothing typed in.")
