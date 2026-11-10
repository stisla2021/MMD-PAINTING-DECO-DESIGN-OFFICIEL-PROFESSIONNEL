CREATE TABLE quotes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  service TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX quotes_created_at_idx ON quotes (created_at DESC);

CREATE TABLE comments (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX comments_created_at_idx ON comments (created_at DESC);

CREATE TABLE works (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  image_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX works_created_at_idx ON works (created_at DESC);

CREATE TABLE api_rate_limits (
  ip TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (ip, window_start)
);

CREATE INDEX api_rate_limits_window_start_idx
  ON api_rate_limits (window_start);
