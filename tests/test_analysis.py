import json
import sqlite3

import numpy as np
import pandas as pd
import pytest

from quake_atlas.analysis import estimate_b, export_summary, max_curvature_mc
from quake_atlas.db import build_db

COLUMNS = ["id", "time", "latitude", "longitude",
           "depth_km", "mag", "mag_type", "place", "region"]


def synthetic_mags(b, mc, n, seed=0):
    rng = np.random.default_rng(seed)
    continuous = (mc - 0.05) + rng.exponential(1 / (b * np.log(10)), n)
    return np.round(continuous, 1)


def test_estimate_b_recovers_known_values():
    for true_b in (0.8, 1.0, 1.2):
        b, se, n = estimate_b(synthetic_mags(true_b, 4.4, 20000), 4.4)
        assert abs(b - true_b) < 0.05


def test_estimate_b_ignores_magnitudes_below_mc():
    good = synthetic_mags(1.0, 4.4, 5000)
    padded = np.concatenate([good, np.full(1000, 3.0)])
    assert estimate_b(padded, 4.4) == estimate_b(good, 4.4)


def test_standard_error_shrinks_with_more_data():
    _, se_small, _ = estimate_b(synthetic_mags(1.0, 4.4, 2000), 4.4)
    _, se_big, _ = estimate_b(synthetic_mags(1.0, 4.4, 20000), 4.4)
    assert se_big < se_small


def test_estimate_b_with_no_data_raises():
    with pytest.raises(ValueError):
        estimate_b([3.0, 3.5], 4.4)


def test_max_curvature_picks_the_fullest_bin():
    assert max_curvature_mc([4.0] * 5 + [4.3] * 10 + [4.5] * 7) == 4.3


def tiny_catalog():
    return pd.DataFrame([
        ["a", "2015-04-25 06:00:00", 28.0, 85.0, 8.0, 7.0, "mww", "mainshock", "Central"],
        ["b", "2015-04-26 06:00:00", 28.3, 85.2, 8.0, 4.6, "mb", "aftershock", "Central"],
        ["c", "2015-12-01 00:00:00", 28.0, 85.0, 8.0, 6.0, "mww", "newest", "Central"],
    ], columns=COLUMNS)


def test_export_writes_expected_json(tmp_path):
    db = tmp_path / "q.db"
    build_db(tiny_catalog(), str(db)).close()
    out = tmp_path / "site" / "summary.json"
    export_summary(str(db), str(out))
    data = json.loads(out.read_text())
    assert data["catalog"]["n"] == 3
    assert {"yearly", "histogram", "b_values", "aftershocks", "events"} <= set(data)
    assert all(row["b"] is None for row in data["b_values"])  # too few events for a b-value


def test_aftershock_table_skips_quakes_with_unfinished_windows(tmp_path):
    db = tmp_path / "q.db"
    build_db(tiny_catalog(), str(db)).close()
    out = tmp_path / "summary.json"
    export_summary(str(db), str(out))
    table = json.loads(out.read_text())["aftershocks"]
    assert [(r["id"], r["aftershocks_30d"]) for r in table] == [("a", 1)]