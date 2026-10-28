"""Download the USGS catalog for the Himalayan box, one CSV per year."""
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"
BOX = dict(minlatitude=24, maxlatitude=37, minlongitude=70, maxlongitude=98)
MIN_MAG = 4.0
FIRST_YEAR = 1990


def fetch_year(year, out_dir):
    params = dict(BOX, minmagnitude=MIN_MAG, format="csv", orderby="time-asc",
                  starttime=f"{year}-01-01", endtime=f"{year + 1}-01-01")
    out = out_dir / f"usgs_{year}.csv"
    with urllib.request.urlopen(f"{URL}?{urllib.parse.urlencode(params)}", timeout=60) as r:
        out.write_bytes(r.read())
    return out


def main(out_dir="data/raw"):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    this_year = date.today().year
    for year in range(FIRST_YEAR, this_year + 1):
        path = out_dir / f"usgs_{year}.csv"
        if path.exists() and year < this_year:  # past years never change
            continue
        print("fetching", year, fetch_year(year, out_dir))


if __name__ == "__main__":
    main()