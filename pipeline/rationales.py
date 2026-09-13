"""
pipeline/rationales.py — rationales.json.

The brief says this file is NOT computed: it is narrative text produced by running the four
skills offline over the generated data and hand-reviewing it. Until that run happens, this
module writes an auto-draft assembled from the pipeline's own numbers, clearly marked as such,
so every view has a fallback and the inputs_hash contract is in place from day one.
"""

from config import LOGIN_MERCHANTS
from common import hash_public


def _n(cellv):
    return f"{cellv['count']:,}" if cellv and not cellv.get("suppressed") else "a below-floor number of"


def build_rationales(profiles, gaps_by_merchant, segments, recommendations, campaigns, allocation_summary):
    out = {"_meta": dict(provenance="auto_draft_from_pipeline_numbers",
                         note="Replace each string by running docs/skills/*/SKILL.md offline over data/raw/ and hand-reviewing. ≤ 60 words each; every number must appear verbatim in the JSON it describes.",
                         inputs_hash=None)}
    for mid in LOGIN_MERCHANTS:
        p = profiles[mid]; g = gaps_by_merchant.get(mid, {}); rec = recommendations[mid]
        seg = segments.get(mid, [{}])[0] if segments.get(mid) else {}
        r = {}
        if p["gate"]["passed"]:
            rfv = p["rfv"]
            r["customer_profile"] = (f"{rfv['one_time_vs_repeat']['repeat_customer_share_pct']:.0f}% of your customers come back, and they account for "
                                     f"{rfv['one_time_vs_repeat']['repeat_txn_share_pct']:.0f}% of transactions. Your top 10% bring {rfv['revenue_by_percentile']['top_10_pct']:.0f}% of revenue.")
        else:
            r["customer_profile"] = p["gate"]["message"]
        r["demand_gap"] = g.get("message")
        if p.get("rfm"):
            r["rfm"] = (f"Champions: {_n(p['rfm']['segments']['Champions'])}. Lapsed total (At Risk, Can't Lose Them, Hibernating, Lost): "
                        f"{_n(p['rfm']['lapsed_total'])} — the pool a win-back reward draws from.")
        if rec.get("ranked"):
            top = rec["ranked"][0]
            r["reward_options"] = (f"{top['label']} ranks first for this gap: {top['reason']} Expected incremental share {top['expected_incremental_share']:.0%} (provisional). "
                                   f"Overseas/FX is ranked and rejected: no travel signal.")
        else:
            r["reward_options"] = rec["eligibility"]["message"]
        if seg:
            r["segment"] = (f"{seg.get('description', '')} Reach {_n(seg.get('reach'))} after catchment, price-band and daypart filters; consent and the frequency cap apply at allocation.")
        out[mid] = r
    for c in campaigns["completed"]:
        if c.get("measured"):
            out[c["campaign_id"]] = {"verdict": c["verdict"]}
    out["allocation"] = {"push": (f"{allocation_summary['push']['suppressed_count']} recipient(s) already at {allocation_summary['push']['cap_per_week']} pushes this week "
                                  f"receive the feed card and no push.")}
    out["_meta"]["inputs_hash"] = hash_public()
    return out
