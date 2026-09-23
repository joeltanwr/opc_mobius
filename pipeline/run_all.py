"""
pipeline/run_all.py — reads data/raw/, writes public/data/. The only writer of public/data/.

    python pipeline/run_all.py
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import (PUB_DIR, constants_manifest, CONSTANTS, LOGIN_MERCHANTS, STATUS_DISPLAY, CAPPED_DISPLAY, SCALE_DISCLOSURE,
                    SCALE_POLICY, SAMPLE_CARDHOLDERS, CARDHOLDER_BASE, MIN_SEGMENT_SIZE, REACH_ROUNDING, DISTRICT_ADJACENCY)
from common import load_raw, dump_json
from tags import build_tags
from sme_analysis import build_profiles
from lift import build_affinity_and_segments
from reward import build_recommendations
from priority import build_priority
from allocate import allocate
from campaign import build_campaign_results
from personas import build_personas
from benchmarks import build_benchmarks
from deposits import build_deposits
from rationales import build_rationales


def main():
    t0 = time.time()
    for fn in os.listdir(PUB_DIR):
        if fn.endswith(".json"):
            os.remove(os.path.join(PUB_DIR, fn))     # nothing stale survives; merchant_directory.json is gone for good
    print("0. Loading raw (as-of demo clock)")
    raw = load_raw()
    sizes = {}

    print("1. tags.py — cardholder tags (raw-only)")
    tags, tag_summary = build_tags(raw)
    print(f"   dormancy threshold {tag_summary['dormancy_threshold_txn_per_month']}/month → {tag_summary['dormant_count']} dormant")

    print("2. sme_analysis.py — profiles, demand gaps, RFM")
    profiles, gaps, rfm_by_merchant = build_profiles(raw, tags)
    gaps_by_merchant = {g["merchant_id"]: g for g in gaps}
    for mid in LOGIN_MERCHANTS:
        g = gaps_by_merchant[mid]
        print(f"   {mid}: gate={'pass' if profiles[mid]['gate']['passed'] else 'FAIL'} gap={g['type']} {g.get('window', '')} conf={g['confidence']}")

    print("3. lift.py — affinity, segments, cohorts")
    affinity, segments, cohorts = build_affinity_and_segments(raw, tags, gaps_by_merchant, profiles)

    print("4. reward.py — eligibility + ranked reward types")
    recommendations = build_recommendations(raw, profiles, gaps_by_merchant, segments, rfm_by_merchant)

    print("5. priority.py — RM caseload score")
    priority = build_priority(raw)

    print("6. allocate.py — Soujourner acquisition allocation + portfolio exposure")
    allocation_summary, allocation_df = allocate(raw, tags, cohorts, rfm_by_merchant, "M0001")

    print("7. campaign.py — measured campaigns")
    campaigns = build_campaign_results(raw, recommendations, priority)

    print("8. personas, benchmarks, deposits, taxonomy")
    personas = build_personas(raw, cohorts, allocation_df, rfm_by_merchant)
    benchmarks = build_benchmarks(raw)
    deposits = build_deposits(raw)

    sizes["taxonomy.json"] = dump_json(raw["taxonomy"], "taxonomy.json")
    sizes["merchant_profiles.json"] = dump_json(profiles, "merchant_profiles.json")
    sizes["demand_gaps.json"] = dump_json(gaps, "demand_gaps.json")
    sizes["affinity.json"] = dump_json(affinity, "affinity.json")
    sizes["segments.json"] = dump_json(segments, "segments.json")
    sizes["reward_recommendations.json"] = dump_json(recommendations, "reward_recommendations.json")
    sizes["merchant_priority.json"] = dump_json(priority, "merchant_priority.json")
    sizes["allocation_summary.json"] = dump_json(allocation_summary, "allocation_summary.json")
    sizes["campaign_results.json"] = dump_json(campaigns, "campaign_results.json")
    sizes["showcase_personas.json"] = dump_json(personas, "showcase_personas.json")
    sizes["benchmarks.json"] = dump_json(benchmarks, "benchmarks.json")
    sizes["deposit_flows.json"] = dump_json(deposits, "deposit_flows.json")
    sizes["constants.json"] = dump_json(dict(constants=constants_manifest(), status_display=STATUS_DISPLAY, capped_display=CAPPED_DISPLAY, tags=tag_summary,
                                             scale_disclosure=SCALE_DISCLOSURE,
                                             scale=dict(sample_cardholders=SAMPLE_CARDHOLDERS, cardholder_base=CARDHOLDER_BASE,
                                                        floor=MIN_SEGMENT_SIZE, rounding=REACH_ROUNDING, policy=SCALE_POLICY),
                                             # The catchment rule, shipped so the cardholder app can ask the same
                                             # "near me" question the allocator asks. One table rather than two: a
                                             # copy hand-written in JavaScript would drift from in_catchment(), and
                                             # the cardholder would be shown a different idea of nearby than the
                                             # targeting engine works to.
                                             district_adjacency={str(d): sorted(n) for d, n in DISTRICT_ADJACENCY.items()}),
                                        "constants.json")

    print("9. rationales.py — auto-draft narrative with inputs_hash")
    rationales = build_rationales(profiles, gaps_by_merchant, segments, recommendations, campaigns, allocation_summary)
    sizes["rationales.json"] = dump_json(rationales, "rationales.json")

    total = sum(sizes.values())
    print("\n" + "=" * 64)
    print(f"public/data written in {time.time() - t0:.1f}s")
    print(f"{'file':<36}{'bytes':>12}")
    print("-" * 48)
    for k, v in sizes.items():
        print(f"{k:<36}{v:>12,}")
    print("-" * 48)
    print(f"{'TOTAL':<36}{total:>12,}  ({total / 1024:.1f} KB, budget 600 KB)")
    print("\nHero cohort:", segments["M0001"][0]["reach"], "| lift top pair:", affinity["M0001"]["pairs"][0] if affinity["M0001"]["pairs"] else None)
    print("Allocation:", allocation_summary["final_allocation"], "| push suppressed:", allocation_summary["push"]["suppressed_count"])
    for c in campaigns["completed"]:
        if c.get("measured"):
            print(f"{c['campaign_id']}: conv {c['conversion']['treated_rate_pct']}% vs {c['conversion']['control_rate_pct']}%, "
                  f"redeemed {c['redemption']['redeemed_transactions']}, incr S${c['incremental']['incremental_sales_sgd']}, "
                  f"cost S${c['cost']['reward_cost_sgd']}, net S${c['cost']['net_contribution_sgd']}")
    tiers = {}
    for p in priority.values():
        tiers[p["tier"]] = tiers.get(p["tier"], 0) + 1
    print("Priority tiers:", tiers, "| Soujourner:", priority["M0001"]["tier"], priority["M0001"]["score"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
