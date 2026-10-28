import pandas as pd

COLUMNS = ["id", "time", "latitude", "longitude",
           "depth_km", "mag", "mag_type", "place", "region"]

def region_for(longitude):
    if longitude < 79:
        return "West"
    if longitude < 88:
        return "Central"
    return "East"


def clean_catalog(df):
    df = df[df["type"] == "earthquake"]
    df = df.dropna(subset=["id", "time", "latitude", "longitude", "mag"])
    df = df.drop_duplicates(subset="id")
    df = df.rename(columns={"depth": "depth_km", "magType": "mag_type"})
    df = df.assign(
        time=pd.to_datetime(df["time"], utc=True, format="ISO8601")
               .dt.strftime("%Y-%m-%d %H:%M:%S"),
        region=df["longitude"].map(region_for),
    )
    return df[COLUMNS].reset_index(drop=True)