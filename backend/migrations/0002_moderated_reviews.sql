ALTER TABLE comments ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE comments ADD COLUMN rating INTEGER;
ALTER TABLE comments ADD COLUMN avatar TEXT NOT NULL DEFAULT '🙂';
ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';

CREATE INDEX comments_status_created_at_idx
  ON comments (status, created_at DESC);
