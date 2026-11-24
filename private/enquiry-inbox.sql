CREATE TABLE IF NOT EXISTS enquiries (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  region_key TEXT NOT NULL,
  received_at INTEGER NOT NULL DEFAULT (unixepoch()),
  content_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS enquiries_rate ON enquiries(region_key,received_at);
CREATE INDEX IF NOT EXISTS enquiries_time ON enquiries(received_at);
