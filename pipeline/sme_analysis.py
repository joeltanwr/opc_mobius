"""
pipeline/sme_analysis.py — implements sme-business-customer-analysis plus the brief's §5
demand-gap rule. Writes merchant_profiles.json and demand_gaps.json; per-customer RFM goes
to data/derived/ (raw-only).

Detection runs on the merchant's own acquiring data where OCBC is the acquirer (all cards and
PayNow, customers keyed by token), otherwise on OCBC-issued card transactions only — and the
output says which.
"""

import os
from datetime import date, timedelta

import numpy as np
import pandas as pd

from config import (DERIVED_DIR, DEMO_DATE, PERIOD_START, LOGIN_MERCHANTS, HERO_ACQUIRING_MERCHANTS, GATE_MIN_OCBC_TXNS,
                    GAP_SLOT_RATIO, GAP_MIN_WEEKS, GAP_HIGH_CONF_WEEKS, GAP_TRAILING_WEEKS, GAP_COLD_START_WEEKS,
                    GAP_PEER_RATIO, GAP_MIN_SLOT_BASELINE, GAP_MIN_VOLUME_12W, RECENT_REPEATER_DAYS, TRAILING_MONTHS, DAYPARTS, DAYPART_HOURS, WEEKDAY_NAMES,
                    AGE_BANDS, RFM_SEGMENTS, DISTRICT_ADJACENCY, cell, composition_shares, round_reach)
from common import daypart_of_hour, pct, key_merchants

# Trailing 12 complete weeks (Mon–Sun) before the demo clock.
_LAST_SUNDAY = DEMO_DATE - timedelta(days=DEMO_DATE.weekday() + 1)
WEEKS_START = _LAST_SUNDAY - timedelta(days=7 * GAP_TRAILING_WEEKS - 1)
WEEKS_END = _LAST_SUNDAY
COMPLETE_MONTHS = [m for m in sorted(set((PERIOD_START + timedelta(days=i)).strftime("%Y-%m") for i in range((DEMO_DATE - PERIOD_START).days)))
                   if m < DEMO_DATE.strftime("%Y-%m")]


# ----------------------------------------------------------------------------------------------
# Source selection
# ----------------------------------------------------------------------------------------------

def merchant_source(raw, mid):
    m = raw["merchant_by_id"].loc[mid]
    if mid in HERO_ACQUIRING_MERCHANTS:
        a = raw["acquiring"][raw["acquiring"]["merchant_id"] == mid]
        src = pd.DataFrame(dict(cust=a["customer_token"].values, card_id=a["customer_token"].map(raw["token_to_card"]).values,
                                amount=a["amount_sgd"].values, dt=a["txn_datetime"].values, is_ocbc=a["is_ocbc_card"].values,
                                tender=np.where(a["payment_method"] == "paynow", "PayNow", a["issuer_bank"].fillna("other")),
                                scheme=a["card_scheme"].values, outlet_id=a["outlet_id"].values, campaign_id=a["campaign_id"].values))
        coverage = dict(coverage="acquiring", label="From your OCBC merchant acquiring records",
                        note="All cards and PayNow at your terminals. OCBC-issued cards resolve to a cardholder; other cards are a token only.",
                        acquiring_start_date=m["acquiring_start_date"])
    else:
        t = raw["card_txns"][raw["card_txns"]["merchant_id"] == mid]
        src = pd.DataFrame(dict(cust=t["card_id"].values, card_id=t["card_id"].values, amount=t["amount_sgd"].values,
                                dt=t["txn_datetime"].values, is_ocbc=True, tender="OCBC", scheme=t["channel"].values,
                                outlet_id=None, campaign_id=t["campaign_id"].values))
        if m["is_ocbc_acquired"]:
            coverage = dict(coverage="ocbc_cards_only", label="OCBC-issued cards only",
                            note="Transaction-level acquiring detail is not loaded for this merchant in the demo; figures cover OCBC cardholders only (about a quarter of card volume).",
                            acquiring_start_date=m["acquiring_start_date"])
        else:
            coverage = dict(coverage="ocbc_cards_only", label="OCBC-issued cards only",
                            note="OCBC is not this merchant's acquirer, so only OCBC-issued card spend is visible. Moving acquiring to OCBC completes the picture.",
                            acquiring_start_date=None)
    src["dt"] = pd.to_datetime(src["dt"])
    src["date"] = src["dt"].dt.date
    src = src.sort_values("dt").reset_index(drop=True)
    return src, coverage


# ----------------------------------------------------------------------------------------------
# RFM (reused by campaign.py at a different as-of)
# ----------------------------------------------------------------------------------------------

def _quintile(series, invert=False):
    ranks = series.rank(method="first")
    q = pd.qcut(ranks, 5, labels=[1, 2, 3, 4, 5]).astype(int)
    return (6 - q) if invert else q


def rfm_table(src, as_of):
    """Per-customer R/F/M scores and segment, over all customers in `src` with dt <= as_of."""
    s = src[src["date"] <= as_of]
    g = s.groupby("cust").agg(last=("date", "max"), first=("date", "min"), F=("amount", "size"), M=("amount", "sum"),
                              card_id=("card_id", "first"))
    if len(g) < 5:
        g["R_days"] = [(as_of - d).days for d in g["last"]]
        g["R"] = g["F_s"] = g["M_s"] = g["FM"] = 3
        g["segment"] = "Need Attention"
        return g
    g["R_days"] = [(as_of - d).days for d in g["last"]]
    g["R"] = _quintile(g["R_days"], invert=True)
    g["F_s"] = _quintile(g["F"])
    g["M_s"] = _quintile(g["M"])
    g["FM"] = np.round((g["F_s"] + g["M_s"]) / 2).astype(int)

    def seg(r, fm):
        for name, (rlo, rhi), (flo, fhi) in RFM_SEGMENTS:
            if rlo <= r <= rhi and flo <= fm <= fhi:
                return name
        return "Need Attention"
    g["segment"] = [seg(r, fm) for r, fm in zip(g["R"], g["FM"])]
    return g


# ----------------------------------------------------------------------------------------------
# Demand-gap detection (brief §5)
# ----------------------------------------------------------------------------------------------

def _slot_table(df, start, end):
    """[12 weeks, 7 weekdays, 5 dayparts] counts for rows dated within [start, end]."""
    d = df[(df["date"] >= start) & (df["date"] <= end)]
    W = np.zeros((GAP_TRAILING_WEEKS, 7, 5))
    if len(d) == 0:
        return W
    week = ((pd.to_datetime(d["date"]) - pd.Timestamp(start)).dt.days // 7).to_numpy()
    wd = d["dt"].dt.weekday.to_numpy()
    dp = d["dt"].dt.hour.map(lambda h: DAYPARTS.index(daypart_of_hour(h))).to_numpy()
    np.add.at(W, (week, wd, dp), 1)
    return W


def _peer_ids(raw, mid):
    m = raw["merchant_by_id"].loc[mid]
    ms = raw["merchants"]
    same_cat = ms[(ms["category"] == m["category"]) & (ms["merchant_id"] != mid)]
    near = same_cat[same_cat["postal_district"].apply(lambda d: d == m["postal_district"] or d in DISTRICT_ADJACENCY[m["postal_district"]])]
    if len(near) >= 3:
        return near["merchant_id"].tolist(), "same category, same or adjacent district"
    return same_cat["merchant_id"].tolist(), "same category, all districts (fewer than 3 adjacent peers)"


def detect_gap(raw, mid, src, history_start):
    peers, peer_basis = _peer_ids(raw, mid)
    ct = raw["card_txns"]
    peer_shares = []
    for pid in peers:
        pt = ct[ct["merchant_id"] == pid][["txn_datetime", "amount_sgd"]].rename(columns={"txn_datetime": "dt"})
        pt["date"] = pt["dt"].dt.date
        Wp = _slot_table(pt, WEEKS_START, WEEKS_END)
        if Wp.sum() >= 100:
            peer_shares.append(Wp.sum(0) / Wp.sum())
    peer_median = np.median(np.stack(peer_shares), axis=0) if peer_shares else None

    history_weeks = (DEMO_DATE - history_start).days / 7 if history_start else 0.0
    base = dict(merchant_id=mid, peers_used=len(peer_shares), peer_basis=peer_basis,
                trailing_window=f"{WEEKS_START.isoformat()} to {WEEKS_END.isoformat()}", history_weeks=round(history_weeks, 1))

    if history_weeks < GAP_COLD_START_WEEKS:
        shape = {d: round(float(peer_median[:, i].sum()), 3) for i, d in enumerate(DAYPARTS)} if peer_median is not None else None
        return dict(base, type="cold_start", confidence="none",
                    message="Under four weeks of trading history. Showing the peer daypart shape only; no gap of your own can be detected yet.",
                    peer_daypart_shape=shape, slots=None), None

    W = _slot_table(src, WEEKS_START, WEEKS_END)
    total = W.sum()
    if total < GAP_MIN_VOLUME_12W:
        return dict(base, type="insufficient_volume", confidence="none",
                    message=f"Only {int(total)} transactions in the trailing 12 weeks (minimum {GAP_MIN_VOLUME_12W}); too thin to detect a daypart gap without inventing one.",
                    slots=None), None
    own_share = (W.sum(0) / total) if total else np.zeros((7, 5))
    weeks_below = np.zeros((7, 5), dtype=int)
    for w in range(GAP_TRAILING_WEEKS):
        for di in range(5):
            own_mean = W[w, :, di].mean()
            if own_mean < GAP_MIN_SLOT_BASELINE:
                continue
            for wd in range(7):
                if W[w, wd, di] <= GAP_SLOT_RATIO * own_mean:
                    weeks_below[wd, di] += 1
    own_pass = weeks_below >= GAP_MIN_WEEKS
    peer_pass = (own_share < GAP_PEER_RATIO * peer_median) if peer_median is not None else np.zeros((7, 5), dtype=bool)

    slots = []
    max_share = own_share.max() if total else 0
    for wd in range(7):
        for di, d in enumerate(DAYPARTS):
            conf = None
            if own_pass[wd, di] and peer_pass[wd, di] and weeks_below[wd, di] >= GAP_HIGH_CONF_WEEKS:
                conf = "high"
            elif own_pass[wd, di]:
                conf = "medium"
            elif peer_pass[wd, di]:
                conf = "low"
            slots.append(dict(weekday=WEEKDAY_NAMES[wd], daypart=d, hours=list(DAYPART_HOURS[d]),
                              count_12w=int(W[:, wd, di].sum()), share=round(float(own_share[wd, di]), 4),
                              weeks_below=int(weeks_below[wd, di]), gap_confidence=conf,
                              incremental_factor=round(float(1 - own_share[wd, di] / max_share), 2) if max_share else None))

    flagged = [s for s in slots if s["gap_confidence"]]
    own_flagged = [s for s in flagged if s["gap_confidence"] in ("high", "medium")]
    if not flagged:
        return dict(base, type="none", confidence="none",
                    message="No weekday × daypart slot ran at or below 75% of its own daypart baseline in 8 of the last 12 weeks, and none sat clearly below peer share. No daypart gap detected.",
                    slots=slots), slots
    if not own_flagged:
        # Peer-only differences describe a different trading shape, not a trough in the merchant's own week. Reported, not headlined.
        peer_dps = sorted({s["daypart"] for s in flagged}, key=DAYPARTS.index)
        return dict(base, type="peer_only", confidence="low",
                    message=("No slot fell below your own weekday baseline. " + ", ".join(peer_dps).capitalize() +
                             " share runs below comparable merchants (low confidence) — a shape difference, not a trough to fill."),
                    other_flagged_slots=[dict(weekday=s["weekday"], daypart=s["daypart"], gap_confidence=s["gap_confidence"]) for s in flagged],
                    slots=slots), slots
    # Headline: among slots that fail the own-baseline test, the daypart with the most, best confidence first.
    order = {"high": 0, "medium": 1, "low": 2}
    by_dp = {}
    for s in own_flagged:
        by_dp.setdefault(s["daypart"], []).append(s)
    dp, group = sorted(by_dp.items(), key=lambda kv: (min(order[s["gap_confidence"]] for s in kv[1]), -len(kv[1])))[0]
    group = sorted(group, key=lambda s: WEEKDAY_NAMES.index(s["weekday"]))
    di = DAYPARTS.index(dp)
    wds = [WEEKDAY_NAMES.index(s["weekday"]) for s in group]
    others = [wd for wd in range(7) if wd not in wds]
    gap_mean = W[:, wds, di].sum(0).mean() if wds else 0
    base_mean = W[:, others, di].sum(0).mean() if others else 0
    vs_own = round((gap_mean / base_mean - 1) * 100, 1) if base_mean else None
    vs_peer = None
    if peer_median is not None:
        own_block = own_share[wds, di].sum(); peer_block = peer_median[wds, di].sum()
        vs_peer = round((own_block / peer_block - 1) * 100, 1) if peer_block else None
    conf = min(group, key=lambda s: order[s["gap_confidence"]])["gap_confidence"]
    days_label = (f"{group[0]['weekday']}–{group[-1]['weekday']}" if len(group) > 1 and wds == list(range(wds[0], wds[-1] + 1))
                  else "/".join(s["weekday"] for s in group))
    hours = DAYPART_HOURS[dp]
    return dict(base, type="off_peak", confidence=conf, daypart=dp, weekdays=[WEEKDAY_NAMES[w] for w in wds],
                window=f"{days_label} {hours[0]:02d}:00–{hours[1]:02d}:00", hours=list(hours),
                weeks_below_min=min(s["weeks_below"] for s in group),
                magnitude_vs_own_baseline_pct=vs_own, magnitude_vs_peers_pct=vs_peer,
                structural=True, structural_basis="Recurs weekly across the trailing 12 weeks; not tied to a season",
                other_flagged_slots=[dict(weekday=s["weekday"], daypart=s["daypart"], gap_confidence=s["gap_confidence"]) for s in flagged if s not in group],
                message=(f"{days_label} {hours[0]:02d}:00–{hours[1]:02d}:00 "
                         + (f"ran {abs(vs_own):.0f}% below your own weekday baseline for that time of day in at least {min(s['weeks_below'] for s in group)} of the last 12 weeks"
                            if vs_own is not None else "sat below comparable merchants' share for that time of day")
                         + (f", and {abs(vs_peer):.0f}% below comparable merchants" if vs_peer is not None and vs_peer < 0 and vs_own is not None else "") + "."),
                slots=slots), slots


# ----------------------------------------------------------------------------------------------
# Profile blocks
# ----------------------------------------------------------------------------------------------

def _monthly_series(src):
    s = src.copy()
    s["month"] = s["dt"].dt.strftime("%Y-%m")
    g = s.groupby("month").agg(txn_count=("amount", "size"), sales=("amount", "sum"), avg_ticket=("amount", "mean"))
    out = []
    for m in sorted(set(g.index) | set(COMPLETE_MONTHS)):
        if m < (src["date"].min().strftime("%Y-%m") if len(src) else m):
            continue
        r = g.loc[m] if m in g.index else None
        out.append(dict(month=m, txn_count=int(r["txn_count"]) if r is not None else 0,
                        sales_sgd=round(float(r["sales"]), 2) if r is not None else 0.0,
                        avg_ticket_sgd=round(float(r["avg_ticket"]), 2) if r is not None else None,
                        partial=m >= DEMO_DATE.strftime("%Y-%m")))
    return out


def _trend(values):
    if len(values) < 6:
        return dict(direction="insufficient history", change_pct=None, basis="fewer than 6 complete months")
    a, b = np.mean(values[:3]), np.mean(values[-3:])
    ch = (b / a - 1) * 100 if a else None
    direction = "flat" if ch is not None and abs(ch) < 5 else ("rising" if ch and ch > 0 else "falling")
    return dict(direction=direction, change_pct=round(ch, 1) if ch is not None else None, basis="last 3 complete months vs first 3")


def _rfv_blocks(src):
    g = src.groupby("cust").agg(last=("date", "max"), first=("date", "min"), n=("amount", "size"), spend=("amount", "sum"))
    n_cust = len(g)
    if n_cust == 0:
        return None
    days = np.array([(DEMO_DATE - d).days for d in g["last"]])
    rep = g[g["n"] >= 2]
    gaps = ((rep["last"] - rep["first"]).apply(lambda x: x.days) / (rep["n"] - 1)) if len(rep) else pd.Series(dtype=float)
    spend_sorted = np.sort(g["spend"].to_numpy())[::-1]
    total = spend_sorted.sum()
    cum = lambda frac: spend_sorted[:max(int(round(n_cust * frac)), 1)].sum()
    top10, top25, top50 = cum(0.10), cum(0.25), cum(0.50)
    recent = rep[[(DEMO_DATE - d).days <= RECENT_REPEATER_DAYS for d in rep["last"]]]
    active_months = ((recent["last"] - recent["first"]).apply(lambda x: x.days).clip(lower=30) / 30.44) if len(recent) else pd.Series(dtype=float)
    freq_bins = [(2, 2, "2"), (3, 4, "3–4"), (5, 9, "5–9"), (10, 19, "10–19"), (20, 10 ** 9, "20+")]
    conc_top10 = pct(top10, total)
    return dict(
        days_since_last=dict(median=int(np.median(days)),
                             distribution={"0-7": pct((days <= 7).sum(), n_cust), "8-30": pct(((days > 7) & (days <= 30)).sum(), n_cust),
                                           "31-90": pct(((days > 30) & (days <= 90)).sum(), n_cust), "90+": pct((days > 90).sum(), n_cust)},
                             lapsed_share_pct=pct((days > 90).sum(), n_cust), lapsed_definition="no purchase in the last 90 days"),
        avg_days_between_purchases=dict(value=round(float(gaps.mean()), 1) if len(gaps) else None, qualifier="repeat customers only (2+ purchases)"),
        one_time_vs_repeat=dict(repeat_customer_share_pct=pct(len(rep), n_cust), repeat_txn_share_pct=pct(rep["n"].sum(), g["n"].sum()),
                                one_time_customer_share_pct=pct(n_cust - len(rep), n_cust)),
        purchase_frequency_repeat_only={label: pct(((rep["n"] >= lo) & (rep["n"] <= hi)).sum(), len(rep)) for lo, hi, label in freq_bins} if len(rep) else None,
        revenue_by_percentile=dict(top_10_pct=conc_top10, next_15_pct=pct(top25 - top10, total), next_25_pct=pct(top50 - top25, total),
                                   bottom_50_pct=pct(total - top50, total),
                                   interpretation=(f"Your top 10% of customers bring {conc_top10:.0f}% of revenue. "
                                                   + ("That is a regulars-led business, which is what a neighbourhood café looks like when it is working — not a data problem." if conc_top10 >= 30
                                                      else "Revenue is spread thinly across customers; loyalty mechanics have less to work with here."))),
        recent_repeaters=dict(share_of_repeaters_pct=pct(len(recent), len(rep)) if len(rep) else None,
                              avg_txn_per_month=round(float((recent["n"] / active_months).mean()), 2) if len(recent) else None,
                              basis=f"repeat customers whose last purchase is within {RECENT_REPEATER_DAYS} days of the demo clock"),
        customers_total=int(n_cust),
    )


def _hourly(src):
    hours = src["dt"].dt.hour
    counts = hours.value_counts().reindex(range(7, 24), fill_value=0)
    total = counts.sum()
    share = [round(float(c / total), 4) if total else 0.0 for c in counts]
    return dict(hours=list(range(7, 24)), share=share, peak_hour=int(counts.idxmax()) if total else None)


def _customer_profile(raw, src, card_ids_all, card_ids_top, group_cats):
    ct = raw["card_txns"]
    m_cat = raw["merchant_by_id"]["category"]

    def pass_(ids):
        t = ct[ct["card_id"].isin(ids)]
        t = t[~t["merchant_id"].isin(raw["aggregator_ids"])]
        t = t.assign(category=t["merchant_id"].map(m_cat))
        by_cat = t.groupby("category")["amount_sgd"].sum().sort_values(ascending=False)
        total = by_cat.sum()
        top = [dict(category=c, label=raw["category_label"][c], share_pct=pct(v, total)) for c, v in by_cat.head(5).items()]
        sub = by_cat[by_cat.index.isin(group_cats)]
        sub_total = sub.sum()
        sub_split = [dict(category=c, label=raw["category_label"][c], share_pct=pct(v, sub_total)) for c, v in sub.items()]
        breadth = t.groupby("card_id")["category"].nunique().median() if len(t) else None
        return dict(top_categories=top, sub_category_split=sub_split, basket_breadth_median_categories=int(breadth) if breadth else None)

    src_ids = src[src["card_id"].notna()]
    def interval(ids):
        s = src_ids[src_ids["card_id"].isin(ids)].groupby("card_id").agg(first=("date", "min"), last=("date", "max"), n=("amount", "size"))
        s = s[s["n"] >= 2]
        return round(float(((s["last"] - s["first"]).apply(lambda x: x.days) / (s["n"] - 1)).mean()), 1) if len(s) else None
    return dict(all_customers=pass_(card_ids_all), top_20pct=pass_(card_ids_top),
                differences=dict(visit_interval_days_all=interval(card_ids_all), visit_interval_days_top20=interval(card_ids_top),
                                 top20_revenue_share_pct=None),  # filled by caller
                basis="OCBC cardholders who transacted here, spend elsewhere by category, aggregators excluded")


def analyse_merchant(raw, mid, tags):
    m = raw["merchant_by_id"].loc[mid]
    src, coverage = merchant_source(raw, mid)
    n_ocbc = int(src["is_ocbc"].sum())
    gate_passed = n_ocbc >= GATE_MIN_OCBC_TXNS
    history_start = (date.fromisoformat(coverage["acquiring_start_date"]) if coverage.get("acquiring_start_date") else src["date"].min() if len(src) else None)
    if history_start and history_start < PERIOD_START:
        history_start = PERIOD_START
    coverage["history_weeks"] = round((DEMO_DATE - history_start).days / 7, 1) if history_start else 0

    gap, slots = detect_gap(raw, mid, src, history_start)
    monthly = _monthly_series(src)
    complete = [x for x in monthly if not x["partial"]]
    last6 = complete[-TRAILING_MONTHS:]
    ocbc_customers = src[src["card_id"].notna()]["card_id"].nunique()
    tender = src["tender"].value_counts(normalize=True)
    scheme = src["scheme"].value_counts(normalize=True)

    profile = dict(
        merchant_id=mid, name=m["canonical_name"], category=m["category"], sector=m["sector"], district=int(m["postal_district"]),
        price_band=int(m["price_band"]), outlets=m["outlets"], is_ocbc_acquired=bool(m["is_ocbc_acquired"]), is_ocbc_customer=bool(m["is_ocbc_customer"]),
        data_source=coverage,
        gate=dict(ocbc_txn_count=n_ocbc, threshold=GATE_MIN_OCBC_TXNS, passed=gate_passed,
                  basis="OCBC-card transactions in the merchant's own data since the demo period start (acquiring start where later)",
                  message=None if gate_passed else "For customer profile data, continue banking to gather valuable transaction data to unlock greater insights."),
        trading_summary=dict(
            avg_monthly_txns_6m=int(round(np.mean([x["txn_count"] for x in last6]))) if last6 else None,
            avg_monthly_sales_6m_sgd=round(float(np.mean([x["sales_sgd"] for x in last6])), 2) if last6 else None,
            trailing_window=f"{last6[0]['month']} to {last6[-1]['month']}" if last6 else None,
            avg_ticket_sgd=round(float(src["amount"].mean()), 2) if len(src) else None,
            top_payment_method=(str(scheme.index[0]).title() if len(scheme) else None),
            core_customer_base=cell(ocbc_customers), core_customer_base_basis="unique OCBC cardholders transacting, rounded to 50",
            all_customers_seen=round_reach(src["cust"].nunique()) if coverage["coverage"] == "acquiring" else None,
            volume_trend=_trend([x["txn_count"] for x in complete]), ticket_trend=_trend([x["avg_ticket_sgd"] or 0 for x in complete]),
        ),
        series=dict(monthly=monthly),
        rfv=_rfv_blocks(src),
        trading_pattern=dict(hourly=_hourly(src),
                             trough=(dict(window=gap.get("window"), daypart=gap.get("daypart"), weekdays=gap.get("weekdays"),
                                          magnitude_vs_own_baseline_pct=gap.get("magnitude_vs_own_baseline_pct"), confidence=gap.get("confidence"))
                                     if gap["type"] == "off_peak" else None),
                             slots=slots),
        relationship=dict(owner_name=m["owner_name"], owner_role=m["owner_role"], products_held=m["products_held"],
                          last_contact_date=m["last_contact_date"], relationship_start_date=m["relationship_start_date"],
                          years_with_ocbc=round((DEMO_DATE - date.fromisoformat(m["relationship_start_date"])).days / 365.25, 1) if m["relationship_start_date"] else None),
    )

    # Age bands — OCBC-resolvable customers only, floor + rounding.
    resolvable = src[src["card_id"].notna()]["card_id"].unique()
    ages = raw["cardholder_by_id"].loc[resolvable, "age_band"].value_counts() if len(resolvable) else pd.Series(dtype=int)
    profile["age_bands"] = {b: cell(int(ages.get(b, 0))) for b in AGE_BANDS}
    profile["age_bands_basis"] = "OCBC cardholders who transacted here; bands under 250 suppressed, others rounded to 50"

    # Card mix — only meaningful where OCBC acquires, and a composition breakdown either way, so
    # the floor lands on the population behind the percentages rather than on the percentages.
    if coverage["coverage"] == "acquiring":
        mix = composition_shares({k: round(float(tender.get(k, 0.0)) * 100, 1) for k in ["OCBC", "DBS", "UOB", "other", "PayNow"]},
                                 int(src["cust"].nunique()), "card mix", "customers at your terminals")
        profile["card_mix"] = dict(reduced=False, label="From your OCBC merchant acquiring records", **mix,
                                   cash_note="Cash is not visible to any bank and is not shown.")
    else:
        mix = composition_shares({"OCBC": 100.0}, int(len(resolvable)), "card mix", "OCBC cardholders who transacted here")
        profile["card_mix"] = dict(reduced=True, label="OCBC-issued cards only", **mix,
                                   cross_sell_note="Moving your acquiring to OCBC completes this picture with every card and PayNow at your terminals.")

    # Daily series for merchants with transaction-level acquiring data.
    if mid in HERO_ACQUIRING_MERCHANTS and len(src):
        daily = src.groupby("date").agg(n=("amount", "size"), s=("amount", "sum"))
        profile["series"]["daily"] = [[d.isoformat(), int(r["n"]), round(float(r["s"]), 2)] for d, r in daily.iterrows()]

    rfm_rows = None
    if gate_passed and len(src):
        rfm = rfm_table(src, DEMO_DATE)
        counts = rfm["segment"].value_counts()
        seg_cells = {name: cell(int(counts.get(name, 0))) for name, _, _ in RFM_SEGMENTS}
        lapsed = int(sum(counts.get(s, 0) for s in ("At Risk", "Can't Lose Them", "Hibernating", "Lost")))
        profile["rfm"] = dict(segments=seg_cells, lapsed_total=cell(lapsed),
                              lapsed_definition="At Risk + Can't Lose Them + Hibernating + Lost",
                              window=f"{PERIOD_START.isoformat()} to {DEMO_DATE.isoformat()}",
                              customers_scored=int(len(rfm)), ocbc_resolvable=int(rfm["card_id"].notna().sum()),
                              coverage_note=("Scored on every customer at your terminals; only OCBC cardholders can be reached with an offer."
                                             if coverage["coverage"] == "acquiring" else "Scored on OCBC cardholders only."))
        top_n = max(int(round(len(rfm) * 0.2)), 1)
        top = rfm.sort_values("M", ascending=False).head(top_n)
        ids_all = [c for c in rfm["card_id"].dropna().unique()]
        ids_top = [c for c in top["card_id"].dropna().unique()]
        if mid in LOGIN_MERCHANTS and ids_all:
            group_cats = [c for c, g in raw["category_group"].items() if g == raw["category_group"][m["category"]]]
            cp = _customer_profile(raw, src, ids_all, ids_top, group_cats)
            cp["differences"]["top20_revenue_share_pct"] = pct(top["M"].sum(), rfm["M"].sum())
            profile["customer_profile"] = cp
        rfm_rows = rfm.reset_index()[["cust", "card_id", "R", "F_s", "M_s", "FM", "segment", "F", "M", "R_days"]]
        rfm_rows.to_parquet(os.path.join(DERIVED_DIR, f"rfm_{mid}.parquet"), index=False)
    else:
        profile["rfm"] = None
        profile["customer_profile"] = None

    gap = {k: v for k, v in gap.items() if k != "slots"}       # the 35-slot table lives in the login profiles' trading_pattern
    if mid not in key_merchants(raw):
        # Light profile: enough for the RM caseload list and nothing the screens never show.
        profile = {k: profile[k] for k in ("merchant_id", "name", "category", "sector", "district", "is_ocbc_acquired", "is_ocbc_customer",
                                           "data_source", "gate", "trading_summary", "relationship")}
        profile["light"] = True
    elif mid not in LOGIN_MERCHANTS:
        profile["trading_pattern"]["slots"] = None
    return profile, gap, rfm_rows


def build_profiles(raw, tags):
    profiles, gaps, rfm_by_merchant = {}, [], {}
    targets = raw["merchants"][raw["merchants"]["is_ocbc_customer"]]["merchant_id"].tolist()
    for mid in targets:
        p, g, r = analyse_merchant(raw, mid, tags)
        profiles[mid] = p
        gaps.append(g)
        if r is not None:
            rfm_by_merchant[mid] = r
    return profiles, gaps, rfm_by_merchant
