"""
validate.py — assertions that must pass against the generator's output.

Run:
    python validate.py

Exits non-zero (and prints every failure) if any check fails.
"""

import hashlib
import json
import os
import re
import subprocess
import sys

import numpy as np
import pandas as pd

import generate as gen

RAW = gen.RAW_DIR
PUB = gen.PUB_DIR

FAILURES = []
PASSES = []


def check(name, cond, detail=""):
    if cond:
        PASSES.append(name)
    else:
        FAILURES.append(f"{name}" + (f" — {detail}" if detail else ""))


def load_json(name):
    with open(os.path.join(PUB, name)) as f:
        return json.load(f)


def main():
    merchants = pd.read_parquet(os.path.join(RAW, "merchants.parquet"))
    descriptors = pd.read_parquet(os.path.join(RAW, "merchant_descriptors.parquet"))
    cardholders = pd.read_parquet(os.path.join(RAW, "cardholders.parquet"))
    card_txns = pd.read_parquet(os.path.join(RAW, "card_transactions.parquet"))
    acquiring = pd.read_parquet(os.path.join(RAW, "acquiring_transactions.parquet"))

    # ---- 1. every category has at least 8 merchants -----------------------
    cat_counts = merchants["category"].value_counts()
    for cat_id in gen.CATEGORY_IDS:
        n = int(cat_counts.get(cat_id, 0))
        check(f"category '{cat_id}' has >=8 merchants", n >= 8, f"got {n}")

    # ---- cardholders-by-merchant (independent recomputation) ---------------
    cardholders_by_merchant = card_txns.groupby("merchant_id")["card_id"].apply(set).to_dict()
    n_total = len(cardholders)

    def lift_support(a, b):
        A, B = cardholders_by_merchant.get(a, set()), cardholders_by_merchant.get(b, set())
        if not A or not B:
            return 0.0, 0
        support = len(A & B)
        p_a, p_a_given_b = len(A) / n_total, support / len(B)
        return (p_a_given_b / p_a if p_a > 0 else 0.0), support

    # ---- 6. lift(M0001,M0055) > 2.5 with support >= 50 ----------------------
    lift_01_55, support_01_55 = lift_support("M0001", "M0055")
    check("lift(M0001,M0055) > 2.5", lift_01_55 > 2.5, f"got {lift_01_55:.3f}")
    check("support(M0001,M0055) >= 50", support_01_55 >= 50, f"got {support_01_55}")

    # ---- 2. H1 target cohort size falls between 350 and 800 -----------------
    target_cohort = cardholders_by_merchant.get("M0055", set()) - cardholders_by_merchant.get("M0001", set())
    check("H1 target cohort (M0055 \\ M0001) size in [350, 800]",
          350 <= len(target_cohort) <= 800, f"got {len(target_cohort)}")

    segments = load_json("segments.json")
    m1_lift_segs = [s for s in segments.get("M0001", []) if s.get("source") == "lift"]
    m0055_seg = next((s for s in m1_lift_segs if s.get("candidate_merchant") == "M0055"), None)
    check("segments.json M0001<-M0055 segment exists and is top-ranked",
          m0055_seg is not None and m1_lift_segs[0] is m0055_seg)
    if m0055_seg and m0055_seg.get("size") is not None:
        check("segments.json M0001<-M0055 size in [350, 800]",
              350 <= m0055_seg["size"] <= 800, f"got {m0055_seg['size']}")

    # ---- 3. Bernice in H1 cohort; Charles and Alvin are not -----------------
    alvin_id = gen.SHOWCASE_IDS["alvin"]
    bernice_id = gen.SHOWCASE_IDS["bernice"]
    charles_id = gen.SHOWCASE_IDS["charles"]
    check("Bernice is in the H1 target cohort", bernice_id in target_cohort)
    check("Alvin is NOT in the H1 target cohort (already transacts at M0001)",
          alvin_id not in target_cohort)
    check("Alvin already transacts at M0001",
          alvin_id in cardholders_by_merchant.get("M0001", set()))
    check("Charles is NOT in the H1 target cohort", charles_id not in target_cohort)
    check("Charles has never transacted at M0001 or M0055",
          charles_id not in cardholders_by_merchant.get("M0001", set()) and
          charles_id not in cardholders_by_merchant.get("M0055", set()))

    # ---- 5. all six showcase personas carry is_illustrative: true ----------
    showcase = load_json("showcase_personas.json")
    check("showcase_personas.json has exactly 6 personas", len(showcase) == 6, f"got {len(showcase)}")
    for p in showcase:
        check(f"showcase persona '{p.get('id')}' has is_illustrative=true",
              p.get("is_illustrative") is True)

    # ---- 4. every signature_pattern figure matches actual transactions -----
    by_persona = {p["id"]: p for p in showcase}

    def txns_of(card_id):
        return card_txns[card_txns["card_id"] == card_id]

    # Alvin: "127 visits to M0001. 127 flat whites."
    nums = [int(x) for x in re.findall(r"\d+", by_persona["alvin"]["signature_pattern"])]
    alvin_m0001 = len(txns_of(alvin_id)[txns_of(alvin_id)["merchant_id"] == "M0001"])
    check("Alvin signature_pattern figure matches actual M0001 visit count",
          nums and nums[0] == alvin_m0001, f"quoted={nums}, actual={alvin_m0001}")

    # Bernice: "... Zero visits to M0001."
    bernice_m0001 = len(txns_of(bernice_id)[txns_of(bernice_id)["merchant_id"] == "M0001"])
    check("Bernice actually has zero visits to M0001", bernice_m0001 == 0, f"got {bernice_m0001}")

    # Charles: "Average ticket S$180."
    charles_amounts = txns_of(charles_id)["amount_sgd"]
    nums = [int(x) for x in re.findall(r"\d+", by_persona["charles"]["signature_pattern"])]
    charles_avg_actual = round(float(charles_amounts.mean()))
    check("Charles signature_pattern average ticket matches actual transactions",
          nums and nums[0] == charles_avg_actual, f"quoted={nums}, actual_avg={charles_avg_actual}")

    # Denise: "Nothing for 41 days, then S$430 in a single afternoon."
    denise_id = gen.SHOWCASE_IDS["denise"]
    denise_days = sorted(txns_of(denise_id)["txn_datetime"].dt.date.unique())
    gaps = [(denise_days[i + 1] - denise_days[i]).days for i in range(len(denise_days) - 1)]
    nums = [int(x) for x in re.findall(r"\d+", by_persona["denise"]["signature_pattern"])]
    max_gap = max(gaps) if gaps else 0
    check("Denise signature_pattern gap-days figure matches the longest actual silent gap",
          len(nums) >= 1 and nums[0] == max_gap, f"quoted={nums[0] if nums else None}, actual_max_gap={max_gap}")
    if gaps:
        gap_idx = gaps.index(max_gap)
        burst_day = denise_days[gap_idx + 1]
        burst_total = txns_of(denise_id)[txns_of(denise_id)["txn_datetime"].dt.date == burst_day]["amount_sgd"].sum()
        check("Denise signature_pattern burst-total figure matches the burst after that gap",
              len(nums) >= 2 and abs(nums[1] - burst_total) < 0.01,
              f"quoted={nums[1] if len(nums) >= 2 else None}, actual={burst_total}")

    # Edwin: "142 transactions. Average S$9."
    edwin_id = gen.SHOWCASE_IDS["edwin"]
    edwin_txns = txns_of(edwin_id)
    nums = [int(x) for x in re.findall(r"\d+", by_persona["edwin"]["signature_pattern"])]
    check("Edwin signature_pattern transaction count matches actual",
          len(nums) >= 1 and nums[0] == len(edwin_txns), f"quoted={nums[0] if nums else None}, actual={len(edwin_txns)}")
    edwin_avg_actual = round(float(edwin_txns["amount_sgd"].mean()))
    check("Edwin signature_pattern average ticket matches actual",
          len(nums) >= 2 and nums[1] == edwin_avg_actual, f"quoted={nums[1] if len(nums) >= 2 else None}, actual={edwin_avg_actual}")

    # Farah: "9 card transactions in 12 months. All at the same clinic."
    farah_id = gen.SHOWCASE_IDS["farah"]
    farah_txns = txns_of(farah_id)
    nums = [int(x) for x in re.findall(r"\d+", by_persona["farah"]["signature_pattern"])]
    check("Farah signature_pattern transaction count matches actual",
          nums and nums[0] == len(farah_txns), f"quoted={nums}, actual={len(farah_txns)}")
    check("Farah's transactions are all at a single merchant",
          farah_txns["merchant_id"].nunique() == 1, f"got {farah_txns['merchant_id'].nunique()} distinct merchants")

    # ---- 7. no aggregator appears in any affinity.json top-10 ---------------
    affinity = load_json("affinity.json")
    aggregator_ids = set(merchants[merchants["is_aggregator"]]["merchant_id"])
    bad = []
    for mid, entry in affinity.items():
        for pair in entry.get("pairs", [])[:10]:
            if pair["merchant_id"] in aggregator_ids:
                bad.append((mid, pair["merchant_id"]))
    check("no aggregator merchant appears in any affinity.json top-10", len(bad) == 0, f"violations={bad}")

    # ---- 8. every OCBC-card acquiring txn has a matching card txn -----------
    ocbc_acq = acquiring[acquiring["is_ocbc_card"]]
    card_by_txn_id = card_txns.set_index("txn_id")
    mismatches = 0
    for _, row in ocbc_acq.iterrows():
        if row["txn_id"] not in card_by_txn_id.index:
            mismatches += 1
            continue
        card_row = card_by_txn_id.loc[row["txn_id"]]
        if abs(card_row["amount_sgd"] - row["amount_sgd"]) > 0.001 or card_row["txn_datetime"] != row["txn_datetime"]:
            mismatches += 1
    check("every OCBC-card acquiring txn matches a card txn (id/amount/timestamp)",
          mismatches == 0, f"{mismatches} of {len(ocbc_acq)} mismatched")
    check("acquiring_transactions.parquet only covers hero merchants",
          set(acquiring["merchant_id"].unique()) <= set(gen.HERO_ACQUIRING_MERCHANTS))
    m0002_ocbc_share = 0.25
    for mid in gen.HERO_ACQUIRING_MERCHANTS:
        sub = acquiring[acquiring["merchant_id"] == mid]
        if len(sub) > 0:
            share = sub["is_ocbc_card"].mean()
            check(f"{mid} acquiring OCBC-card share ~25%", abs(share - 0.25) < 0.05, f"got {share:.3f}")

    # ---- 9. no shipped segment falls below MIN_SEGMENT_SIZE unless flagged --
    bad_segments = []
    for mid, segs in segments.items():
        for s in segs:
            if s.get("suppressed"):
                if s.get("size") is not None or s.get("reason") != "below minimum segment size":
                    bad_segments.append((mid, s.get("segment_id"), "suppressed but malformed"))
            else:
                if s.get("size") is not None and s["size"] < gen.MIN_SEGMENT_SIZE:
                    bad_segments.append((mid, s.get("segment_id"), s.get("size")))
    check("no shipped (non-suppressed) segment is below MIN_SEGMENT_SIZE",
          len(bad_segments) == 0, f"violations={bad_segments}")

    # ---- H4 sanity: M0004 has no acquiring data, no personalized segment ---
    check("M0004 has no rows in acquiring_transactions.parquet",
          "M0004" not in set(acquiring["merchant_id"].unique()))
    check("affinity.json marks M0004 as unavailable (preview mode)",
          affinity.get("M0004", {}).get("available") is False)

    # ---- H2 sanity: M0002 acquiring history is thin & recent ---------------
    m0002_acq = acquiring[acquiring["merchant_id"] == "M0002"]
    m0002_start = merchants.set_index("merchant_id").loc["M0002", "acquiring_start_date"]
    check("M0002 acquiring_start_date is within the last 3 weeks of the period",
          m0002_start is not None and
          (gen.PERIOD_END_D - pd.Timestamp(m0002_start).date()).days <= 22)
    check("M0002 has a cold_start_fallback affinity entry",
          affinity.get("M0002", {}).get("cold_start_fallback") is True)

    # ---- 10. public/data/ total size under 600 KB ---------------------------
    total_bytes = sum(os.path.getsize(os.path.join(PUB, f)) for f in os.listdir(PUB)
                       if os.path.isfile(os.path.join(PUB, f)))
    check("public/data/ total size < 600 KB", total_bytes < 600 * 1024, f"got {total_bytes/1024:.1f} KB")

    # ---- 11. two consecutive runs produce identical output hashes -----------
    def hash_tree(*dirs):
        h = hashlib.sha256()
        for d in dirs:
            for root, _, files in os.walk(d):
                for fn in sorted(files):
                    p = os.path.join(root, fn)
                    h.update(p.encode())
                    with open(p, "rb") as fh:
                        h.update(fh.read())
        return h.hexdigest()

    before = hash_tree(RAW, PUB)
    print("Re-running generate.py once more to verify reproducibility (this takes a while)...")
    generate_script = os.path.join(os.path.dirname(os.path.abspath(gen.__file__)), "generate.py")
    result = subprocess.run([sys.executable, generate_script], capture_output=True, text=True)
    check("generate.py re-run exits cleanly", result.returncode == 0, result.stderr[-2000:])
    after = hash_tree(RAW, PUB)
    check("two consecutive generate.py runs produce identical output hashes", before == after)

    # ------------------------------------------------------------------------
    print(f"\n{len(PASSES)} passed, {len(FAILURES)} failed\n")
    if FAILURES:
        print("FAILURES:")
        for f in FAILURES:
            print(f"  [FAIL] {f}")
        sys.exit(1)
    else:
        print("All checks passed.")


if __name__ == "__main__":
    main()
