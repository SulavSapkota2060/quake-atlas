CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    time TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    depth_km REAL,
    mag REAL NOT NULL,
    mag_type TEXT,
    place TEXT, 
    region TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_time ON events(time);
CREATE INDEX IF NOT EXISTS idx_events_mag ON events(mag);


