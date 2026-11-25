CREATE TABLE IF NOT EXISTS provider_calls (
  id INTEGER PRIMARY KEY,
  service TEXT NOT NULL,
  day TEXT NOT NULL,
  client_key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS provider_calls_limit ON provider_calls(service,day,client_key);
CREATE TABLE IF NOT EXISTS provider_cache (
  service TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(service,cache_key)
);
