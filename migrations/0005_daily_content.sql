ALTER TABLE posts ADD COLUMN batch_date TEXT;
ALTER TABLE posts ADD COLUMN batch_slot INTEGER;
ALTER TABLE posts ADD COLUMN source_template INTEGER;
ALTER TABLE posts ADD COLUMN source_name TEXT;
ALTER TABLE posts ADD COLUMN source_title TEXT;
ALTER TABLE posts ADD COLUMN source_url TEXT;
ALTER TABLE posts ADD COLUMN source_published_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_daily_batch
  ON posts(batch_date, batch_slot)
  WHERE batch_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_source_url
  ON posts(source_url)
  WHERE source_url IS NOT NULL;
