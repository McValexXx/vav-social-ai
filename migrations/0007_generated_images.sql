CREATE TABLE IF NOT EXISTS generated_images (
  post_id INTEGER NOT NULL,
  variant INTEGER NOT NULL DEFAULT 0,
  jpeg BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, variant),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_generated_images_created_at
  ON generated_images(created_at);
