CREATE TABLE analytics_daily_views (
  visit_day TEXT NOT NULL,
  page_path TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (visit_day, page_path)
);

CREATE INDEX analytics_daily_views_day_idx
  ON analytics_daily_views (visit_day);

CREATE TABLE analytics_daily_visitors (
  visitor_hash TEXT NOT NULL,
  visit_day TEXT NOT NULL,
  PRIMARY KEY (visitor_hash, visit_day)
);

CREATE INDEX analytics_daily_visitors_day_idx
  ON analytics_daily_visitors (visit_day);
