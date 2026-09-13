"""
validate.py — definition of done for the dataset and the compute layer.

Checks mock_data_spec.md §10 and MOBIUS_BUILD_BRIEF_V2.md §7 against data/raw/, data/derived/
and public/data/. Every figure is re-derived here independently of the pipeline where the
check is about the data, and read back from public/data/ where the check is about what ships.

    python validate.py              # full: checks, then re-runs generate + pipeline and compares hashes
    python validate.py --no-rerun   # checks only (fast, for iteration)
"""

import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import date

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import config as cfg                        # noqa: E402
from common import hash_public              # noqa: E402

RAW, DERIVED, PUB = cfg.RAW_DIR, cfg.DERIVED_DIR, cfg.PUB_DIR
FAILURES, PASSES = [], []


def check(name, cond, detail=""):
    (PASSES if cond else FAILURES).append(name + (f" — {detail}" if detail and not cond else ""))


def load_pub(name):
    with open(os.path.join(PUB, name), encoding="utf-8") as f:
        return json.load(f)


def walk(obj, path="$"):
    if isinstance(obj, dict):
        yield path, obj
        for k, v in obj.items():
            yield from walk(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, f"{path}[{i}]")


def main(rerun=True):
    merchants = pd.read_parquet(os.path.join(RAW, "merchants.parquet"))
    cardholders = pd.read_parquet(os.path.join(RAW, "cardholders.parquet"))
    card_txns = pd.read_parquet(os.path.join(RAW, "card_transactions.parquet"))
    acquiring = pd.read_parquet(os.path.join(RAW, "acquiring_transactions.parquet"))
    token_map = pd.read_parquet(os.path.join(RAW, "token_map.parquet"))
    deposits = pd.read_parquet(os.path.join(RAW, "deposit_flows.parquet"))
    campaigns = pd.read_parquet(os.path.join(RAW, "campaigns.parquet"))
    allocations = pd.read_parquet(os.path.join(RAW, "allocations.parquet"))
    tags = pd.read_parquet(os.path.join(DERIVED, "cardholder_tags.parquet"))
    cohort = pd.read_parquet(os.path.join(DERIVED, "cohort_M0001.parquet"))
    alloc = pd.read_parquet(os.path.join(DERIVED, "allocation_M0001.parquet"))
    rfm = pd.read_parquet(os.path.join(DERIVED, "rfm_M0001.parquet"))
    with open(os.path.join(RAW, "cohorts.json")) as f:
        cohorts = json.load(f)
    ids = cohorts["showcase"]
    asof = card_txns[card_txns["txn_datetime"] <= cfg.DEMO_CLOCK_NAIVE]

    # ------------------------------------------------------------------ spec §10
    cat_counts = merchants["category"].value_counts()
    check("every category has >= 8 merchants", bool((cat_counts >= 8).all()), str(cat_counts[cat_counts < 8].to_dict()))

    by_m = asof.groupby("merchant_id")["card_id"].apply(set).to_dict()
    n_total = len(cardholders)
    A, B = by_m["M0001"], by_m["M0055"]
    support = len(A & B)
    lift = (support / len(B)) / (len(A) / n_total)
    check("lift(M0001,M0055) > 2.5", lift > 2.5, f"got {lift:.3f}")
    check("support(M0001,M0055) >= 50", support >= 50, f"got {support}")
    raw_cohort = B - A
    check("H1 raw cohort (M0055 \\ M0001) in [350, 800]", 350 <= len(raw_cohort) <= 800, f"got {len(raw_cohort)}")

    segments = load_pub("segments.json")
    top = segments["M0001"][0]
    check("segments.json M0001 top segment is the M0055 lift pair", top.get("candidate_merchant") == "M0055")
    check("segments.json M0001 top segment reach is a rounded count in [350, 800]",
          not top["reach"]["suppressed"] and 350 <= top["reach"]["count"] <= 800 and top["reach"]["count"] % 50 == 0, str(top["reach"]))

    final = alloc[alloc["exclusion_reason"].isna()]
    check("Bernice is in the Soujourner allocation", ids["bernice"] in set(final["card_id"]))
    check("Alvin is not in the cohort (already a customer)", ids["alvin"] in A and ids["alvin"] not in set(final["card_id"]))
    charles = cohort[cohort["card_id"] == ids["charles"]]
    check("Charles evaluated and excluded with reason price_band", len(charles) == 1 and charles["exclusion_reason"].iloc[0] == "price_band",
          str(charles["exclusion_reason"].tolist()))
    check("Alvin is in Champions", rfm[rfm["card_id"] == ids["alvin"]]["segment"].tolist() == ["Champions"],
          str(rfm[rfm["card_id"] == ids["alvin"]]["segment"].tolist()))

    personas = load_pub("showcase_personas.json")
    check("six showcase personas, all is_illustrative", len(personas) == 6 and all(p["is_illustrative"] is True for p in personas))
    byp = {p["id"]: p for p in personas}
    nums = lambda s: [int(x.replace(",", "")) for x in re.findall(r"\d[\d,]*", s)]
    t = lambda cid: asof[asof["card_id"] == cid]
    alvin_n = int((t(ids["alvin"])["merchant_id"] == "M0001").sum())
    check("Alvin signature = actual M0001 visits", nums(byp["alvin"]["signature_pattern"])[:2] == [alvin_n, alvin_n], f"{byp['alvin']['signature_pattern']} vs {alvin_n}")
    check("Bernice has zero M0001 visits", int((t(ids["bernice"])["merchant_id"] == "M0001").sum()) == 0)
    weeks = (cfg.DEMO_DATE - cfg.PERIOD_START).days / 7
    b_days = int(round((t(ids["bernice"])["merchant_id"] == "M0055").sum() / weeks))
    check("Bernice signature days-per-week = actual", nums(byp["bernice"]["signature_pattern"])[1] == b_days, byp["bernice"]["signature_pattern"])
    check("Charles signature avg ticket = actual", nums(byp["charles"]["signature_pattern"])[0] == int(round(t(ids["charles"])["amount_sgd"].mean())))
    d = t(ids["denise"]); days = sorted(d["txn_datetime"].dt.date.unique()); gaps = [(days[i + 1] - days[i]).days for i in range(len(days) - 1)]
    gi = int(np.argmax(gaps)); burst = float(d[d["txn_datetime"].dt.date == days[gi + 1]]["amount_sgd"].sum())
    check("Denise signature gap and burst = actual", nums(byp["denise"]["signature_pattern"])[:2] == [max(gaps), int(round(burst))], byp["denise"]["signature_pattern"])
    e = t(ids["edwin"])
    check("Edwin signature count and average = actual", nums(byp["edwin"]["signature_pattern"])[:2] == [len(e), int(round(e["amount_sgd"].mean()))], byp["edwin"]["signature_pattern"])
    fa = t(ids["farah"])
    check("Farah signature count = actual, single merchant", nums(byp["farah"]["signature_pattern"])[0] == len(fa) and fa["merchant_id"].nunique() == 1)

    affinity = load_pub("affinity.json")
    aggregators = set(merchants[merchants["is_aggregator"]]["merchant_id"])
    bad = [(m, p["merchant_id"]) for m, e in affinity.items() for p in e.get("pairs", [])[:10] if p["merchant_id"] in aggregators]
    check("no aggregator in any affinity top-10", not bad, str(bad))

    ocbc = acquiring[acquiring["is_ocbc_card"]]
    joined = ocbc.merge(card_txns[["txn_id", "amount_sgd", "txn_datetime"]], on="txn_id", how="left", suffixes=("", "_card"))
    mism = int((joined["amount_sgd_card"].isna() | (abs(joined["amount_sgd"] - joined["amount_sgd_card"]) > 0.001) | (joined["txn_datetime"] != joined["txn_datetime_card"])).sum())
    check("every OCBC acquiring txn matches a card txn (id/amount/timestamp)", mism == 0, f"{mism} mismatches")

    # Every count cell that ships is either suppressed (no count) or >= floor and rounded to 50.
    floor_bad = []
    for fn in sorted(os.listdir(PUB)):
        if not fn.endswith(".json"):
            continue
        for path, obj in walk(load_pub(fn)):
            if "suppressed" in obj and isinstance(obj["suppressed"], bool):
                if obj["suppressed"] and "count" in obj:
                    floor_bad.append((fn, path, "suppressed but carries a count"))
                if not obj["suppressed"] and (obj.get("count") is None or obj["count"] < cfg.MIN_SEGMENT_SIZE or obj["count"] % cfg.REACH_ROUNDING):
                    floor_bad.append((fn, path, obj.get("count")))
    check("no shipped cell below the 250 floor unless suppressed; every shipped count rounded to 50", not floor_bad, str(floor_bad[:5]))

    total_bytes = sum(os.path.getsize(os.path.join(PUB, f)) for f in os.listdir(PUB) if f.endswith(".json"))
    check("public/data < 600 KB", total_bytes < 600 * 1024, f"{total_bytes / 1024:.1f} KB")

    # ------------------------------------------------------------------ brief §7
    check("every acquiring row has a customer_token", bool(acquiring["customer_token"].notna().all()))
    resolvable = set(token_map["customer_token"])
    check("every OCBC acquiring token resolves to a card_id", bool(ocbc["customer_token"].isin(resolvable).all()))
    check("no non-OCBC acquiring token resolves", not bool(acquiring[~acquiring["is_ocbc_card"]]["customer_token"].isin(resolvable).any()))

    acquired = merchants[merchants["is_ocbc_acquired"]]["merchant_id"]
    months = deposits.groupby("merchant_id")["month"].nunique()
    short = [m for m in acquired if months.get(m, 0) < 6]
    check(f"all {len(acquired)} acquired merchants have >= 6 months of deposit flows", not short, str(short))

    recs = load_pub("reward_recommendations.json")
    elig = {m: r["eligibility"] for m, r in recs.items()}
    bal_fail = [m for m, e in elig.items() if e["avg_balance_6m_sgd"] is not None and e["avg_balance_6m_sgd"] <= cfg.ELIG_MIN_BALANCE_SGD]
    band_fail = [m for m, e in elig.items() if e["internal_score_band"] is not None and e["external_score_band"] is not None
                 and e["internal_score_band"] > 3 and e["external_score_band"] > 3]
    check("merchant master contains a balance failure", len(bal_fail) >= 1, str(bal_fail))
    check("merchant master contains a both-bands failure", len(band_fail) >= 1, str(band_fail))
    check("Soujourner passes eligibility", elig["M0001"]["passed"])
    priority = load_pub("merchant_priority.json")
    tiers = {p["tier"] for p in priority.values()}
    check("one merchant per priority tier (high/medium/low/insufficient_data)", {"high", "medium", "low", "insufficient_data"} <= tiers, str(tiers))
    check("Soujourner priority tier is high", priority["M0001"]["tier"] == "high", str(priority["M0001"]))

    dormant_tier = cardholders[cardholders["engagement_tier"] == "dormant"]["card_id"]
    flagged = set(tags[tags["dormant"]]["card_id"])
    recall = np.mean([c in flagged for c in dormant_tier])
    check("computed dormancy reproduces engagement_tier == dormant for >= 95%", recall >= 0.95, f"recall {recall:.3f}")

    opt_out = 1 - cardholders["marketing_consent"].mean()
    check("marketing_consent opt-out between 15% and 25%", 0.15 <= opt_out <= 0.25, f"{opt_out:.3f}")

    summ = load_pub("allocation_summary.json")
    check("frequency cap (30-day) removes >= 1 from the Soujourner cohort", summ["removed"]["frequency_cap"] >= 1, str(summ["removed"]))
    check("consent removes >= 1 from the Soujourner cohort", summ["removed"]["consent"] >= 1)
    edwin = alloc[alloc["card_id"] == ids["edwin"]]
    check("Edwin is allocated the feed card and push-suppressed by the weekly cap",
          len(edwin) == 1 and pd.isna(edwin["exclusion_reason"].iloc[0]) and bool(edwin["push_suppressed"].iloc[0]),
          edwin.to_dict("records"))
    check("push suppression count in allocation_summary >= 1", summ["push"]["suppressed_count"] >= 1)

    profiles = load_pub("merchant_profiles.json")
    check("Boba Lane below 100 OCBC acquiring transactions (gate fires)", not profiles["M0002"]["gate"]["passed"], str(profiles["M0002"]["gate"]))
    check("Soujourner above 100 (gate does not fire)", profiles["M0001"]["gate"]["passed"])
    check("Tanjong Kopi House card mix is the reduced state", profiles["M0004"]["card_mix"]["reduced"] is True)
    check("Soujourner card mix is the full acquiring state", profiles["M0001"]["card_mix"]["reduced"] is False)

    gaps = {g["merchant_id"]: g for g in load_pub("demand_gaps.json")}
    g1 = gaps["M0001"]
    check("Soujourner gap detected: Tue–Thu afternoon, high confidence",
          g1["type"] == "off_peak" and g1["daypart"] == "afternoon" and g1["weekdays"] == ["Tue", "Wed", "Thu"] and g1["confidence"] == "high",
          str({k: g1.get(k) for k in ("type", "window", "confidence")}))
    check("Boba Lane takes the cold-start branch", gaps["M0002"]["type"] == "cold_start")

    camps = load_pub("campaign_results.json")
    measured = {c["campaign_id"]: c for c in camps["completed"] if c.get("measured")}
    check("both Soujourner campaigns present and measured", {"C-SJ-01", "C-SJ-02"} <= set(measured), str(list(measured)))
    if {"C-SJ-01", "C-SJ-02"} <= set(measured):
        w, l = measured["C-SJ-02"], measured["C-SJ-01"]
        check("winner net positive, loser net negative", w["cost"]["net_contribution_sgd"] > 0 > l["cost"]["net_contribution_sgd"],
              f"{w['cost']['net_contribution_sgd']} / {l['cost']['net_contribution_sgd']}")
        check("winner: treated conversion beats control by >= 8 points", w["conversion"]["lift_points"] >= 8, str(w["conversion"]))
        check("winner: merchant reward cost within 15% of the brief's ≈S$220", abs(w["cost"]["reward_cost_sgd"] - 220) <= 33, str(w["cost"]["reward_cost_sgd"]))
        check("winner: operating account opened 2026-09-08", w["operating_account"] == {"opened": True, "date": "2026-09-08"})
        check("loser: redeemers were mostly existing customers", l["redeemer_profile"]["returning"] > l["redeemer_profile"]["new_to_business"])
        check("loser: window changed away from the recommended trough is recorded", len(l["configuration"]["changes_from_recommendation"]) >= 1)
        arith = abs((w["incremental"]["incremental_sales_sgd"] * cfg.ASSUMED_GROSS_MARGIN - w["cost"]["reward_cost_sgd"]) - w["cost"]["net_contribution_sgd"]) < 0.05
        check("winner: net = incremental × margin − cost (reconciles)", arith)
    check("at least one live campaign and one application in the RM lists", len(camps["active"]) >= 1 and len(camps["applied"]) >= 1)
    check("an application from an ineligible merchant is in the pending list", any(a["eligibility"] and not a["eligibility"]["passed"] for a in camps["applied"]))

    ab = profiles["M0001"]["age_bands"]
    check("at least one demographic band renders suppressed for Soujourner", any(v["suppressed"] for v in ab.values()) and any(not v["suppressed"] for v in ab.values()))

    r1 = recs["M0001"]["ranked"]
    check("Soujourner shows six ranked reward types with overseas/FX disabled",
          r1 is not None and len(r1) == 6 and [x["type"] for x in r1 if x["disabled"]] == ["overseas_fx"] and len({x["type"] for x in r1}) == 6)

    blob = "".join(open(os.path.join(PUB, f), encoding="utf-8").read().lower() for f in os.listdir(PUB) if f.endswith(".json"))
    leaks = [w for w in ("ocbc_funded", "ocbc-funded", "co-fund", "cofund", "cost_share", "cost-share", "cost split", "funding split") if w in blob]
    check("no cost-split or OCBC-contribution figure anywhere in public/data", not leaks, str(leaks))
    check("merchant_directory.json is gone", not os.path.exists(os.path.join(PUB, "merchant_directory.json")))

    rat = load_pub("rationales.json")
    check("rationales.json inputs_hash matches current public data", rat["_meta"]["inputs_hash"] == hash_public(), "re-run the pipeline / offline skills")
    for k, v in rat.items():
        if k == "_meta":
            continue
        for kk, s in v.items():
            if isinstance(s, str) and len(s.split()) > 60:
                FAILURES.append(f"rationale {k}.{kk} exceeds 60 words ({len(s.split())})")
    const = load_pub("constants.json")
    check("every shipped constant carries a basis string", all(c.get("basis") for c in const["constants"].values()))
    check("status display map ships once", const["status_display"] == cfg.STATUS_DISPLAY)

    # ------------------------------------------------------------------ reproducibility
    if rerun:
        def tree_hash(*dirs):
            h = hashlib.sha256()
            for d in dirs:
                for root, _, files in os.walk(d):
                    for fn in sorted(files):
                        p = os.path.join(root, fn)
                        h.update(os.path.relpath(p, ROOT).encode())
                        with open(p, "rb") as fh:
                            h.update(fh.read())
            return h.hexdigest()
        before = tree_hash(RAW, DERIVED, PUB)
        print("Re-running generate.py + pipeline/run_all.py to verify reproducibility (about two minutes)...")
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        r1 = subprocess.run([sys.executable, os.path.join(ROOT, "data-generator", "generate.py")], capture_output=True, text=True, env=env)
        r2 = subprocess.run([sys.executable, os.path.join(ROOT, "pipeline", "run_all.py")], capture_output=True, text=True, env=env)
        check("generate.py re-run exits cleanly", r1.returncode == 0, r1.stderr[-1500:])
        check("pipeline re-run exits cleanly", r2.returncode == 0, r2.stderr[-1500:])
        check("two consecutive runs are hash-identical (raw + derived + public)", before == tree_hash(RAW, DERIVED, PUB))

    print(f"\n{len(PASSES)} passed, {len(FAILURES)} failed\n")
    if FAILURES:
        print("FAILURES:")
        for f in FAILURES:
            print(f"  [FAIL] {f}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main(rerun="--no-rerun" not in sys.argv))
