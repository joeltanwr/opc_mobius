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


def _src_files():
    out = []
    for root, _, files in os.walk(os.path.join(ROOT, "src")):
        out += [os.path.join(root, f) for f in sorted(files) if f.endswith((".js", ".jsx"))]
    return out


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

    const = load_pub("constants.json")
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

    # -------------------------------------------------------------- fix 1: the floor's scope
    # The 250 floor belongs on composition breakdowns — who a group of people is made of. It does
    # not belong on the merchant's own observations of its own trade, which must render exactly.
    for cid, c in measured.items():
        rp = c["redeemer_profile"]
        redeemers = c["redemption"]["redeemers"]
        for key, comp in (("age_bands", rp["age_bands"]), ("rfm_at_redemption", rp["rfm_at_redemption"])):
            check(f"{cid} {key} is a floored composition block carrying its floor and population",
                  comp.get("floor") == cfg.MIN_SEGMENT_SIZE and comp.get("population") == redeemers and isinstance(comp.get("cells"), dict),
                  str({k: comp.get(k) for k in ("floor", "population")}))
            check(f"{cid} {key} suppression copy names the actual redeemer count",
                  f"{redeemers:,}" in comp.get("note", ""), comp.get("note"))
            check(f"{cid} {key} is withheld in full while the group is under the floor",
                  comp["all_suppressed"] == (redeemers < cfg.MIN_SEGMENT_SIZE)
                  and (all(v["suppressed"] for v in comp["cells"].values()) if comp["all_suppressed"] else True),
                  str(comp["all_suppressed"]))
        # Direct merchant observations: exact, unrounded, never a suppressible cell.
        check(f"{cid} new vs returning is exact and sums to the redeemer count",
              rp["new_to_business"] + rp["returning"] == redeemers, f"{rp['new_to_business']} + {rp['returning']} vs {redeemers}")
        direct = dict(redeemers=redeemers, new_to_business=rp["new_to_business"], returning=rp["returning"],
                      returned_within_30d=c["repeat"]["returned_within_30d"], control_returned=c["repeat"]["control_returned"],
                      incremental_transactions=c["incremental"]["incremental_transactions"])
        check(f"{cid} direct observations are not rounded to the reach granularity",
              any(v % cfg.REACH_ROUNDING for v in direct.values() if isinstance(v, int) and v),
              str(direct))
        for name, block in (("repeat", c["repeat"]), ("incremental", c["incremental"]), ("cost", c["cost"])):
            check(f"{cid} {name} renders normally — no suppression state anywhere in it",
                  not any("suppressed" in obj for _, obj in walk(block)), name)
        fp = c["floor_policy"]
        check(f"{cid} floor_policy names the floored composition keys and the exempt observations",
              fp["floor"] == cfg.MIN_SEGMENT_SIZE
              and set(fp["floored_composition"]) == {"redeemer_profile.age_bands", "redeemer_profile.rfm_at_redemption"}
              and {"repeat", "incremental", "cost"} <= set(fp["direct_observations"]), str(fp))

    # Card mix is a composition breakdown too: the floor lands on the population behind the shares.
    mixes = {m: p["card_mix"] for m, p in profiles.items() if "card_mix" in p}
    bad_mix = [(m, x.get("population")) for m, x in mixes.items()
               if x.get("floor") != cfg.MIN_SEGMENT_SIZE or x.get("population") is None
               or (x["population"] < cfg.MIN_SEGMENT_SIZE) != bool(x["all_suppressed"])
               or (x["all_suppressed"] and x["shares"] is not None)
               or (not x["all_suppressed"] and not x["shares"])]
    check("every card-mix panel carries the floor and its population, and withholds shares below the floor", not bad_mix, str(bad_mix[:5]))
    names_population = lambda x: (f"{x['population']:,}" in x["note"]) if x["population"] else x["note"].lower().startswith("no ")
    check("a below-floor card mix exists and its copy accounts for the population behind it",
          any(x["all_suppressed"] for x in mixes.values()) and all(names_population(x) for x in mixes.values() if x["all_suppressed"]),
          str([(m, x["population"], x["note"]) for m, x in mixes.items() if x["all_suppressed"] and not names_population(x)][:5]))
    check("Soujourner card mix still ships shares summing to ~100%",
          abs(sum(mixes["M0001"]["shares"].values()) - 100) < 1.5, str(mixes["M0001"]["shares"]))

    # all_customers_seen is the merchant's own count of its own terminals: exact, unrounded, and a
    # stated empty state rather than a literal 0 next to a chart.
    seen = {m: p["trading_summary"]["all_customers_seen"] for m, p in profiles.items()
            if p["trading_summary"].get("all_customers_seen") is not None}
    bad_seen = [(m, v) for m, v in seen.items()
                if v.get("floor_applies") is not False or not isinstance(v.get("count"), int)
                or (v["count"] == 0 and not v["note"].lower().startswith("no "))
                or (v["count"] and f"{v['count']:,}" not in v["note"])]
    check("all_customers_seen is a direct observation with its own copy, never a floored cell", not bad_seen, str(bad_seen[:3]))
    check("all_customers_seen is exact, not rounded to the reach granularity",
          any(v["count"] % cfg.REACH_ROUNDING for v in seen.values() if v["count"]),
          str({m: v["count"] for m, v in seen.items()}))
    check("a merchant with no trade yet states it instead of shipping a bare 0",
          any(v["count"] == 0 and v["note"].lower().startswith("no ") for v in seen.values()),
          str([(m, v["note"]) for m, v in seen.items() if v["count"] == 0]))

    # Every shipped file has to survive a strict JSON parser — the browser's JSON.parse rejects
    # bare NaN and Infinity, and one of them takes down every screen that reads the file.
    nonfinite = []
    for fn in sorted(os.listdir(PUB)):
        if not fn.endswith(".json"):
            continue
        raw_text = open(os.path.join(PUB, fn), encoding="utf-8").read()
        try:
            json.loads(raw_text, parse_constant=lambda c: (_ for _ in ()).throw(ValueError(c)))
        except ValueError as e:
            nonfinite.append((fn, str(e)))
    check("every shipped JSON file parses under a strict parser (no NaN or Infinity)", not nonfinite, str(nonfinite[:3]))

    # -------------------------------------------------------------- fix 2: caps scale with the base
    cap_like = [k for k in cfg.CONSTANTS if re.search(r"CAP|CEIL|MAX|MIN|LIMIT", k)]
    buckets = cfg.SCALE_POLICY
    classified = set(buckets["share_of_consented_base"]) | set(buckets["per_cardholder_rates"]) | set(buckets["absolute_by_design"])
    check("every cap-like constant is classified in SCALE_POLICY", not (set(cap_like) - classified), str(sorted(set(cap_like) - classified)))
    check("SCALE_POLICY classifies nothing that isn't a constant", not (classified - set(cfg.CONSTANTS)), str(sorted(classified - set(cfg.CONSTANTS))))
    check("no constant is classified in two buckets",
          len(classified) == len(buckets["share_of_consented_base"]) + len(buckets["per_cardholder_rates"]) + len(buckets["absolute_by_design"]))
    check("every share-of-base cap is a fraction, not a headcount",
          all(0 < cfg.CONSTANTS[k].value < 1 for k in buckets["share_of_consented_base"]),
          str({k: cfg.CONSTANTS[k].value for k in buckets["share_of_consented_base"]}))
    check("every per-cardholder cap is a small scale-free rate",
          all(isinstance(cfg.CONSTANTS[k].value, int) and 1 <= cfg.CONSTANTS[k].value <= 100 for k in buckets["per_cardholder_rates"]),
          str({k: cfg.CONSTANTS[k].value for k in buckets["per_cardholder_rates"]}))
    check("every absolute-by-design threshold states why it stays absolute",
          all(len(v.split()) >= 5 for v in buckets["absolute_by_design"].values()))
    check("the absolute portfolio ceiling is gone from config", "PORTFOLIO_WEEKLY_CEIL" not in cfg.CONSTANTS)

    pf = summ["portfolio"]
    check("portfolio ceiling is computed from the share and the consented base on the panel",
          pf["weekly_ceiling"] == cfg.cap_from_share(pf["weekly_ceiling_share_of_consented_base"], pf["consented_base"]),
          str({k: pf[k] for k in ("weekly_ceiling", "weekly_ceiling_share_of_consented_base", "consented_base")}))
    check("portfolio ceiling is in the same sample units as the week's contacts",
          pf["weekly_ceiling"] <= cfg.SAMPLE_CARDHOLDERS and pf["consented_base"] <= cfg.SAMPLE_CARDHOLDERS,
          str({k: pf[k] for k in ("weekly_ceiling", "consented_base")}))
    check("portfolio headroom reconciles with the ceiling and the contacts",
          pf["headroom_this_week"] == pf["weekly_ceiling"] - pf["contacted_this_week"], str(pf))
    # No cap or ceiling anywhere in public/data may be a headcount drawn from the 800,000 base:
    # every count that ships is in sample units, so a cap above the sample is two scales on one panel.
    base_scale_caps = [(f, path, k, v) for f in sorted(os.listdir(PUB)) if f.endswith(".json")
                       for path, o in walk(load_pub(f)) for k, v in o.items()
                       if re.search(r"ceiling|ceil|cap(?!tion)", k, re.I) and isinstance(v, (int, float))
                       and not isinstance(v, bool) and v > cfg.SAMPLE_CARDHOLDERS]
    check("no shipped cap or ceiling is a headcount from the 800,000 base", not base_scale_caps, str(base_scale_caps[:5]))

    check("constants.json ships one scale disclosure naming both the sample and the base",
          f"{cfg.SAMPLE_CARDHOLDERS:,}" in const["scale_disclosure"] and f"{cfg.CARDHOLDER_BASE:,}" in const["scale_disclosure"],
          const.get("scale_disclosure"))
    shell = open(os.path.join(ROOT, "src", "components", "AppShell.jsx"), encoding="utf-8").read()
    check("the shared chrome renders the shipped scale disclosure", "scale_disclosure" in shell)
    src_hits = [f for f in _src_files() if "scale_disclosure" in open(f, encoding="utf-8").read()
                and os.path.basename(f) != "DataProvider.jsx"]
    check("the scale disclosure is rendered once, not restated per screen", len(src_hits) == 1, str(src_hits))

    # -------------------------------------------------------------- shared state module (brief §4)
    # The reducer, ladder and bus are JavaScript; the only honest check is to run them. selftest.mjs
    # drives the real code against the real public/data and prints one JSON report.
    st_path = os.path.join(ROOT, "src", "state", "selftest.mjs")
    try:
        # encoding is explicit: selftest.mjs writes UTF-8, and on a cp1252 console text=True would
        # decode the em dashes in the check names into mojibake, so every lookup below would miss
        # and report a passing check as a failure.
        st = subprocess.run(["node", st_path], capture_output=True, text=True, encoding="utf-8", timeout=120)
        st_report = json.loads(st.stdout) if st.stdout.strip().startswith("{") else None
    except (OSError, subprocess.SubprocessError, ValueError) as e:      # node missing or crashed
        st, st_report = None, None
        st_error = str(e)
    if st_report is None:
        check("state module: selftest.mjs runs under node", False, (st.stderr[-600:] if st else None) or locals().get("st_error"))
    else:
        check("state module: selftest.mjs passes every check", st_report["ok"], str(st_report.get("failed")))
        ladder = st_report["notes"]["ladder"]
        check("state ladder: no unreachable state", not ladder["unreachable"], str(ladder["unreachable"]))
        check("state ladder: display map keys == ladder states (one set of keys)", not ladder["missing_display"] and not ladder["extra_display"], str(ladder))
        check("state ladder: the ladder is the brief's ladder",
              ladder["states"] == ["applied", "draft", "pending", "active", "capped", "stopped", "completed"]
              and set(ladder["terminal"]) == {"capped", "stopped", "completed"}, str(ladder["states"]))
        check("state ladder: ladder states == shipped status_display keys", set(ladder["states"]) == set(const["status_display"]), str(const["status_display"]))
        for name in ("event 1: suppression is counted, not dropped — delivered = sent + suppressed",
                     "event 2: customer profile weight moved toward the merchant's category and still sums to 1",
                     "event 3: reaching the redemption limit moves the campaign to capped with the reason",
                     "event 4: a card held at the stop can still be redeemed — never revoked",
                     "event 5: turning offers off empties the feed",
                     "bus: a tab opened later derives the same state from the log"):
            check(f"state module: {name}", st_report["checks"].get(name, {}).get("ok") is True)

    # The narrowing agent's world (merchant §7.1): a lookup table of floored, rounded reaches, and
    # the protected-characteristic policy, both shipped from the pipeline.
    hero_seg = segments["M0001"][0]
    nt = hero_seg.get("narrowing")
    check("narrowing: the hero segment ships the agent's reach table", bool(nt) and nt["cells_shipped"] == len(nt["cells"]) > 0)
    check("narrowing: every shipped cell clears the floor and is rounded — nothing below the floor is shipped at all",
          bool(nt) and all(c["reach"]["suppressed"] is False and c["reach"]["count"] >= cfg.MIN_SEGMENT_SIZE and c["reach"]["count"] % cfg.REACH_ROUNDING == 0 for c in nt["cells"]))
    check("narrowing: dimensions are outlet, daypart and age band only — weekday is the window, not the segment",
          bool(nt) and set(nt["dimensions"]) == {"outlet", "daypart", "age_band"})
    check("narrowing: a below-floor narrowing exists to refuse (lunch does not ship)",
          bool(nt) and not any(c["constraints"] == {"daypart": "lunch"} for c in nt["cells"]))
    check("narrowing: other segments carry no table (only the campaign's segment can be narrowed)", all(s.get("narrowing") is None for s in segments["M0001"][1:]))
    prot = const["constants"].get("NARROW_PROTECTED_TERMS", {})
    check("narrowing: protected-characteristic policy ships with the six characteristics and a basis",
          set(prot.get("value", {})) == {"nationality", "race", "religion", "gender", "marital status", "health"} and bool(prot.get("basis")))
    check("narrowing: refinement cap ships", const["constants"].get("NARROW_MAX_REFINEMENTS", {}).get("value") == cfg.NARROW_MAX_REFINEMENTS)
    if st_report:
        for name in ("narrow: below-floor narrowing refused with NO count reported",
                     "narrow: protected characteristic refused, explained, and does not consume a refinement",
                     "narrow: widening refused",
                     "narrow: after reset the sixth narrowing is refused by the cap — reset does not refund",
                     "permissions: OCBC staff cannot set the limit",
                     "permissions: nobody can author the segment as a field",
                     "submit: refused while a required field is missing, naming it",
                     "cohort push: the reach cap fires — campaign capped with the reason, results frozen",
                     "cohort push: Bernice's card is still honoured after the reach cap"):
            check(f"state module: {name}", st_report["checks"].get(name, {}).get("ok") is True)

    # Suppression counts reconcile end to end: the shipped allocation_summary against the derived
    # per-cardholder allocation ledger, and the personas' seeded push state against the same ledger.
    allocated = alloc[alloc["exclusion_reason"].isna()]
    check("suppression reconciles: allocation_summary.push.suppressed_count == Σ push_suppressed in the derived allocation",
          summ["push"]["suppressed_count"] == int(allocated["push_suppressed"].sum()),
          f"{summ['push']['suppressed_count']} vs {int(allocated['push_suppressed'].sum())}")
    check("suppression reconciles: push.eligible == round_reach(allocated − suppressed)",
          summ["push"]["eligible"] == cfg.round_reach(int((~allocated["push_suppressed"]).sum())),
          f"{summ['push']['eligible']} vs {cfg.round_reach(int((~allocated['push_suppressed']).sum()))}")
    p_by_id = {p["id"]: p for p in personas}
    edwin_row = allocated[allocated["card_id"] == ids["edwin"]].iloc[0]
    check("suppression reconciles: Edwin's seeded push_state matches his allocation row (at the cap, suppressed)",
          p_by_id["edwin"]["push_state"]["pushes_this_week"] == int(edwin_row["pushes_this_week"]) and p_by_id["edwin"]["push_state"]["at_push_cap"]
          and "push_suppressed_frequency_cap" in p_by_id["edwin"]["cohort_membership"], str(p_by_id["edwin"]["push_state"]))
    check("suppression reconciles: Bernice's seeded push_state matches her allocation row (clear)",
          p_by_id["bernice"]["push_state"]["pushes_this_week"] == int(allocated[allocated["card_id"] == ids["bernice"]].iloc[0]["pushes_this_week"])
          and not p_by_id["bernice"]["push_state"]["at_push_cap"])
    check("suppression reconciles: personas flagged at the cap == suppressed_count (every suppression has a name in the demo)",
          sum("push_suppressed_frequency_cap" in p["cohort_membership"] for p in personas) == summ["push"]["suppressed_count"])
    check("state seed: every persona ships consent, weights summing to 1, push_state and offer history",
          all("consent" in p and "push_state" in p and "offers" in p and abs(sum(p["profile"]["category_weights"].values()) - 1) < 0.001 for p in personas))
    check("state seed: PROFILE_WEIGHT_STEP ships with a basis and is provisional",
          const["constants"].get("PROFILE_WEIGHT_STEP", {}).get("provisional") is True and bool(const["constants"].get("PROFILE_WEIGHT_STEP", {}).get("basis")))
    seeded_expired = [o for p in personas for o in p["offers"] if o["status"] == "expired"]
    check("state seed: at least one expired reward comes from a real allocation row", len(seeded_expired) >= 1)

    # -------------------------------------------------------------- src/ against the real contract
    src_text = {f: open(f, encoding="utf-8").read() for f in _src_files()}
    shipped = {fn for fn in os.listdir(PUB) if fn.endswith(".json")}
    fetched = set(re.findall(r'"([a-z_]+\.json)"', src_text[os.path.join(ROOT, "src", "data", "DataProvider.jsx")]))
    check("every JSON file the app fetches is one the pipeline writes", not (fetched - shipped), str(sorted(fetched - shipped)))
    check("the app fetches constants.json, so the chrome has its scale line", "constants.json" in fetched)
    ghost = {f: [w for w in ("merchant_directory", "merchantDirectory", "reward_cost_total_sgd",
                             "reward_cost_ocbc_funded_sgd", "reward_cost_merchant_funded_sgd",
                             "control_organic_conversion_rate", "ticket_p50_sgd", "top_adjacent_categories")
                 if w in t] for f, t in src_text.items()}
    ghost = {os.path.relpath(f, ROOT): w for f, w in ghost.items() if w}
    check("no screen reads a field or file the pipeline stopped writing", not ghost, str(ghost))

    # Cost-sharing is settled: the merchant funds the reward in full, so the vocabulary of a split
    # must not exist in the app at all — not in a constant, a component, or a comment.
    cost_share = re.compile(r"funding[_ -]?split|co[_-]?fund|cost[_ -]?shar|ocbc[_ -]?funded|ocbc[_ -]?contribut", re.I)
    split_hits = {os.path.relpath(f, ROOT): sorted(set(m.group(0) for m in cost_share.finditer(t)))
                  for f, t in src_text.items() if cost_share.search(t)}
    check("no cost-sharing vocabulary anywhere in src/", not split_hits, str(split_hits))
    pipeline_text = {f: open(os.path.join(ROOT, "pipeline", f), encoding="utf-8").read()
                     for f in os.listdir(os.path.join(ROOT, "pipeline")) if f.endswith(".py")}
    check("no cost-sharing vocabulary anywhere in pipeline/",
          not [f for f, t in pipeline_text.items() if cost_share.search(t)],
          str([f for f, t in pipeline_text.items() if cost_share.search(t)]))
    check("every campaign's cost is the merchant's whole cost",
          all(c["cost"]["funded_by"] == "merchant" for c in camps["completed"] if c.get("measured")))

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
