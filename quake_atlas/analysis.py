"""Magnitude statistics and the JSON export for the website."""
import json
import math
import sqlite3
from datetime import date
from pathlib import Path

import numpy as np

MC = 4.8              
DM = 0.1               
MAX_DEPTH_KM = 70      
MIN_EVENTS_FOR_B = 50  

AFTERSHOCK_SQL = """
SELECT m.id, m.time, m.mag, m.place, COUNT(a.id) AS aftershocks_30d
FROM events m
LEFT JOIN events a
  ON a.id != m.id AND a.mag >= 4.5
 AND a.time > m.time
 AND julianday(a.time) - julianday(m.time) <= 30
 AND ABS(a.latitude - m.latitude) < 1 AND ABS(a.longitude - m.longitude) < 1
WHERE m.mag >= 6.0
  AND julianday((SELECT MAX(time) FROM events)) - julianday(m.time) >= 30
GROUP BY m.id ORDER BY m.mag DESC, m.time
"""


def estimate_b(mags, mc, dm=DM):
    """Aki-Utsu b-value. Returns (b, standard error, number of events used)."""
    m = np.asarray(mags, dtype=float)
    m = m[m >= mc - 1e-9]
    n = len(m)
    if n == 0:
        raise ValueError("no magnitudes at or above mc")
    b = math.log10(math.e) / (m.mean() - (mc - dm / 2))
    return b, b / math.sqrt(n), n


def max_curvature_mc(mags):
    """The 0.1-wide magnitude bin holding the most events."""
    values, counts = np.unique(np.round(mags, 1), return_counts=True)
    return float(values[counts.argmax()])


def shallow_mags(con, region=None):
    sql = "SELECT mag FROM events WHERE depth_km <= ?"
    args = [MAX_DEPTH_KM]
    if region:
        sql += " AND region = ?"
        args.append(region)
    return [r[0] for r in con.execute(sql, args)]


def rows(con, sql, args=()):
    return [dict(r) for r in con.execute(sql, args)]


def b_entry(label, mags):
    usable = [m for m in mags if m >= MC - 1e-9]
    if len(usable) < MIN_EVENTS_FOR_B:
        return {"region": label, "n": len(usable), "b": None, "se": None}
    b, se, n = estimate_b(usable, MC)
    return {"region": label, "n": n, "b": round(b, 3), "se": round(se, 3)}


def export_summary(db_path="quake.db", out_path="docs/data/summary.json"):
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    b_values = [b_entry("All", shallow_mags(con))]
    for region in ("West", "Central", "East"):
        b_values.append(b_entry(region, shallow_mags(con, region)))
        all_mags = shallow_mags(con)
        b_curve = []
        for i in range(40, 53):
            b, se, n = estimate_b(all_mags, i / 10)
            b_curve.append({"mc": i / 10, "b": round(b, 3), "se": round(se, 3), "n": n})
    summary = {
        "generated": date.today().isoformat(),
        "mc": MC,
        "max_depth_km": MAX_DEPTH_KM,
        "catalog": rows(con, "SELECT COUNT(*) AS n, MIN(time) AS start, MAX(time) AS end FROM events")[0],
        "yearly": rows(con, "SELECT CAST(strftime('%Y', time) AS INTEGER) AS year, COUNT(*) AS n, "
                            "MAX(mag) AS max_mag FROM events GROUP BY year ORDER BY year"),
        "histogram": rows(con, "SELECT ROUND(mag, 1) AS mag, COUNT(*) AS n FROM events "
                               "GROUP BY ROUND(mag, 1) ORDER BY mag"),
        "b_values": b_values,
        "b_vs_mc": b_curve,
        "aftershocks": rows(con, AFTERSHOCK_SQL),
        "events": [[round(r["latitude"], 2), round(r["longitude"], 2), r["mag"], r["time"][:10]]
                   for r in rows(con, "SELECT latitude, longitude, mag, time FROM events "
                                      "WHERE mag >= 4.5 ORDER BY time")],
    }
    con.close()
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, separators=(",", ":")))
    print(f"wrote {out} ({out.stat().st_size // 1024} KB), {len(summary['events'])} map events")


if __name__ == "__main__":
    export_summary()