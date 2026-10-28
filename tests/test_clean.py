import pandas as pd

from quake_atlas.clean import clean_catalog, region_for


def row(**changes):
    base = dict(id="a", time="2015-04-25T06:11:25.950Z", latitude=28.2,
                longitude=84.7, depth=8.2, mag=7.8, magType="mww",
                place="somewhere", type="earthquake")
    base.update(changes)
    return base


def test_keeps_only_earthquakes():
    df = pd.DataFrame([row(id="a"), row(id="b", type="quarry blast")])
    assert list(clean_catalog(df)["id"]) == ["a"]


def test_drops_rows_missing_magnitude():
    df = pd.DataFrame([row(id="a"), row(id="b", mag=None)])
    assert list(clean_catalog(df)["id"]) == ["a"]


def test_dedupes_by_id():
    df = pd.DataFrame([row(id="a"), row(id="a")])
    assert len(clean_catalog(df)) == 1


def test_time_is_plain_utc_text():
    out = clean_catalog(pd.DataFrame([row()]))
    assert out.loc[0, "time"] == "2015-04-25 06:11:25"


def test_region_boundaries():
    assert region_for(78.99) == "West"
    assert region_for(79.0) == "Central"
    assert region_for(88.0) == "East"


def test_output_columns_and_renames():
    out = clean_catalog(pd.DataFrame([row()]))
    assert list(out.columns) == ["id", "time", "latitude", "longitude",
                                 "depth_km", "mag", "mag_type", "place", "region"]