import glob 
import sqlite3
from pathlib import Path

import pandas as pd

from quake_atlas.clean import clean_catalog

SCHEMA = Path(__file__).parent.parent / "sql" / "schema.sql"

def load_raw(raw_dir = "data/raw"):
    files = sorted(glob.glob(f"{raw_dir}/*.csv"))
    return pd.concat(pd.read_csv(f) for f in files)


def build_db(df, db_path):
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA.read_text())
    df.to_sql("events", con, if_exists="append", index=False)
    con.commit()
    return con


def main(db_path="quake.db"):
    Path(db_path).unlink(missing_ok=True)
    con = build_db(clean_catalog(load_raw()), db_path)
    print(con.execute("SELECT COUNT(*) FROM events").fetchone()[0], "events loaded")
    con.close()


if __name__ == "__main__":
    main()


    

