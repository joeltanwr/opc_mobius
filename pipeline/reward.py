"""
pipeline/reward.py — implements reward-programme-recommendation: the eligibility gate and the
six ranked reward types with RFM targets. Writes reward_recommendations.json (deterministic).
"""

from config import (ELIG_MIN_BALANCE_SGD, ELIG_MAX_SCORE_BAND, REWARD_TYPES, REWARD_RANKINGS, ACQUISITION_RANKINGS,
                    REWARD_TARGET_SEGMENTS, REWARD_REASONS, INCREMENTAL_SHARE, CONSTANTS, LOGIN_MERCHANTS, MIN_SEGMENT_SIZE)
from deposits import eligibility_inputs
from config import cell

RANK_POINTS = [60, 50, 40, 30, 20, 10]


def eligibility(raw, mid):
    avg_balance, ib, eb, months = eligibility_inputs(raw, mid)
    balance_ok = avg_balance is not None and avg_balance > ELIG_MIN_BALANCE_SGD
    bands = [b for b in (ib, eb) if b is not None]
    cleared = [name for name, b in (("internal", ib), ("external", eb)) if b is not None and b <= ELIG_MAX_SCORE_BAND]
    score_ok = len(cleared) > 0
    reasons = []
    if not balance_ok:
        reasons.append(f"average balance S${avg_balance:,.0f} is not above S${ELIG_MIN_BALANCE_SGD:,}" if avg_balance is not None else "no balance history")
    if not score_ok:
        reasons.append("neither transaction score is at band 3 or better" if bands else "no transaction score on file")
    return dict(passed=bool(balance_ok and score_ok), avg_balance_6m_sgd=avg_balance, balance_threshold_sgd=ELIG_MIN_BALANCE_SGD,
                balance_months=months, internal_score_band=ib, external_score_band=eb, max_band=ELIG_MAX_SCORE_BAND,
                cleared_by=cleared, reasons=reasons,
                message=None if (balance_ok and score_ok) else "You are not eligible for the reward programme.",
                flags=["pd_band_direction_unconfirmed"])


def _gap_type(gap, gate_passed):
    if gap is None:
        return "none", "No demand-gap analysis available."
    if gap["type"] == "cold_start":
        return "new_outlet", "Under four weeks of trading history: treated as a new outlet needing trial and awareness."
    if gap["type"] == "off_peak":
        return "off_peak", f"Recurring trough {gap['window']}, {gap['confidence']} confidence."
    return "none", "No daypart gap detected. Ranking shown for growth beyond the existing base (acquisition), flagged as such."


def _segment_cell(profile, name, rfm_frame=None):
    """An RFM segment as a *target pool*: floored at MIN_SEGMENT_SIZE, the targeting floor.

    Customer Profile's RFM chart ships under the lower MIN_BREAKDOWN_SIZE (round 8), which is a
    display floor for a breakdown of the merchant's own customers. A segment offered as somebody to
    target is a different thing and keeps 250 — counted from the per-customer frame, never from the
    display cell, so the floor bonus in the score cannot drift with the chart.
    """
    if not profile.get("rfm"):
        return {"suppressed": True, "reason": "no RFM available (gate not passed)"}
    if rfm_frame is not None:
        return cell(int((rfm_frame["segment"] == name).sum()))
    return profile["rfm"]["segments"].get(name, {"suppressed": True, "reason": "not scored"})


def recommend(raw, mid, profile, gap, segments, rfm_frame=None):
    elig = eligibility(raw, mid)
    out = dict(merchant_id=mid, name=profile["name"], eligibility=elig)
    if not elig["passed"]:
        out.update(gap_type=None, ranked=None, acquisition=None,
                   note="Eligibility failed; no recommendation is generated (reward-programme-recommendation Step 1).")
        return out
    gtype, gnote = _gap_type(gap, profile["gate"]["passed"])
    ranking = REWARD_RANKINGS["off_peak"] if gtype == "off_peak" else REWARD_RANKINGS["new_outlet"] if gtype == "new_outlet" else REWARD_RANKINGS["win_back"]
    reasons = REWARD_REASONS["off_peak"] if gtype == "off_peak" else REWARD_REASONS["new_outlet"] if gtype == "new_outlet" else REWARD_REASONS["win_back"]
    non_cust = None
    for s in segments.get(mid, []):
        if s["source"] in ("lift", "category_catchment_fallback"):
            non_cust = s["reach"]
            break
    ranked = []
    for i, t in enumerate(ranking):
        targets = REWARD_TARGET_SEGMENTS[t]
        target_cells = [dict(segment=n, reach=_segment_cell(profile, n, rfm_frame)) for n in targets]
        # For an acquisition-type mechanic the honest pool is non-customers, whose reach is a count only.
        acquisition_pool = t in ("discount", "voucher", "bundle_1for1") and gtype in ("off_peak", "new_outlet", "none")
        pool_key = "non_customers" if acquisition_pool else (targets[0] if targets else "Champions")
        share = INCREMENTAL_SHARE.get(pool_key, 0.4)
        reach_ok = (non_cust and not non_cust.get("suppressed")) if acquisition_pool else any(not c["reach"].get("suppressed") for c in target_cells)
        disabled = t == "overseas_fx"
        score = 0 if disabled else RANK_POINTS[i] + int(round(30 * share)) + (10 if reach_ok else 0)
        ranked.append(dict(rank=i + 1, type=t, label=REWARD_TYPES[t], score=score, disabled=disabled,
                           rejected_reason=reasons[t] if disabled else None, reason=reasons[t],
                           target_pool="non_customers" if acquisition_pool else "existing_customers",
                           target_segments=target_cells, non_customer_reach=non_cust if acquisition_pool else None,
                           expected_incremental_share=share, incremental_share_provisional=CONSTANTS["INCREMENTAL_SHARE"].provisional,
                           new_or_returning="New customer" if acquisition_pool else "Returning customer"))
    acq = None
    if non_cust is not None:
        acq = dict(pool="non_customers", reach=non_cust, method="merchant-pair lift" if profile["data_source"] else None,
                   templates={k: [dict(rank=i + 1, type=t, label=REWARD_TYPES[t]) for i, t in enumerate(v)] for k, v in ACQUISITION_RANKINGS.items()},
                   note="Acquisition targeting uses merchant-pair lift (brief §2); reach is a count only, post-consent at allocation.")
    out.update(gap_type=gtype, gap_note=gnote, ranked=ranked, acquisition=acq,
               score_basis="rank points 60→10 by the skill's ordering for the gap type, + 30 × expected incremental share, + 10 if the target pool clears the 250 floor; overseas/FX scores 0 (disabled)",
               flags=(["no_rfm_gate_not_passed"] if not profile["gate"]["passed"] else []) + (["gap_did_not_fit_cleanly"] if gtype == "none" else []))
    return out


def build_recommendations(raw, profiles, gaps_by_merchant, segments, rfm_by_merchant=None):
    from common import key_merchants
    keys = set(key_merchants(raw))
    out = {}
    for mid in profiles:
        if mid in keys:
            out[mid] = recommend(raw, mid, profiles[mid], gaps_by_merchant.get(mid), segments, (rfm_by_merchant or {}).get(mid))
        else:
            out[mid] = dict(merchant_id=mid, name=profiles[mid]["name"], eligibility=eligibility(raw, mid), ranked=None, acquisition=None, light=True)
    return out
