import sqlite3

import pandas as pd
import pytest

from quake_atlas.db import build_db

COLUMNS = ["id", "time", "latitude", "longitude",
           "depth_km", "mag", "mag_type", "place", "region"]


def tiny_catalog():
    return pd.DataFrame([
        ["a", "2015-04-25 06:11:25", 28.2, 84.7, 8.2, 7.8, "mww", "x", "Central"],
        ["b", "2016-01-01 00:00:00", 27.0, 85.0, 10.0, 4.5, "mb", "y", "Central"],
    ], columns=COLUMNS)


def test_rows_are_loaded():
    con = build_db(tiny_catalog(), ":memory:")
    assert con.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 2


def test_duplicate_id_is_rejected():
    con = build_db(tiny_catalog(), ":memory:")
    with pytest.raises(sqlite3.IntegrityError):
        con.execute("INSERT INTO events VALUES "
                    "('a','2020-01-01 00:00:00',1,1,1,5,'mb','z','West')")


def test_time_works_with_sqlite_date_functions():
    con = build_db(tiny_catalog(), ":memory:")
    years = [r[0] for r in con.execute(
        "SELECT strftime('%Y', time) FROM events ORDER BY time")]
    assert years == ["2015", "2016"]