"""
pipeline/narrowing.py — the reward manager agent's lookup table (merchant prompt §7.1).

The agent narrows a proposed segment by outlet, time of day or age band and nothing else. It
never sees a cardholder: every reach it can ever report is computed here, floored and rounded,
and only cells at or above MIN_SEGMENT_SIZE ship. A constraint set with no cell is below the
floor, and the agent refuses it without a count — absence is the refusal, so there is nothing
on the client to leak or to difference. Weekday is deliberately not a dimension: it is the
campaign window (§7.3), not a property of who is in the segment.
"""

from itertools import product

from config import LIFT_MIN_DAYPART_AVAILABILITY, DAYPARTS, DAYPART_HOURS, AGE_BANDS, MIN_SEGMENT_SIZE, REACH_ROUNDING, cell, in_catchment


def narrowing_table(raw, arow, cdf):
    """Every combination of ≤ one constraint per dimension over the segment's survivors."""
    survivors = cdf[cdf["exclusion_reason"].isna()]["card_id"].tolist()
    ch = raw["cardholder_by_id"]
    outlets = list(arow["outlets"])

    def member(cid, outlet_id, daypart, age_band):
        row = ch.loc[cid]
        if outlet_id is not None:
            o = next(x for x in outlets if x["outlet_id"] == outlet_id)
            if not in_catchment(int(row["home_district"]), int(row["work_district"]), int(o["district"])):
                return False
        if daypart is not None and row["daypart_availability"].get(daypart, 0) < LIFT_MIN_DAYPART_AVAILABILITY:
            return False
        if age_band is not None and row["age_band"] != age_band:
            return False
        return True

    cells = []
    for outlet_id, daypart, age_band in product([None] + [o["outlet_id"] for o in outlets], [None] + DAYPARTS, [None] + AGE_BANDS):
        if outlet_id is None and daypart is None and age_band is None:
            continue
        n = sum(1 for cid in survivors if member(cid, outlet_id, daypart, age_band))
        if n >= MIN_SEGMENT_SIZE:
            constraints = {k: v for k, v in (("outlet", outlet_id), ("daypart", daypart), ("age_band", age_band)) if v is not None}
            cells.append(dict(constraints=constraints, reach=cell(n)))
    return dict(
        basis=(f"Reach for every narrowing the agent may apply, computed on the segment's members; cells under {MIN_SEGMENT_SIZE} are "
               f"not shipped at all, shipped cells are rounded to {REACH_ROUNDING}. A constraint set with no cell is refused without a count."),
        dimensions=dict(
            outlet=[dict(id=o["outlet_id"], name=o["name"], district=int(o["district"])) for o in outlets],
            daypart=[dict(id=d, hours=list(DAYPART_HOURS[d])) for d in DAYPARTS],
            age_band=list(AGE_BANDS),
        ),
        rule=dict(outlet="home or work district in the outlet's district or an adjacent one",
                  daypart=f"daypart availability ≥ {LIFT_MIN_DAYPART_AVAILABILITY}", age_band="cardholder age band"),
        cells=cells,
        cells_shipped=len(cells),
    )
