CREATE TABLE IF NOT EXISTS videos (
  post_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  narration TEXT NOT NULL,
  video_url TEXT,
  github_run_url TEXT,
  instagram_container_id TEXT,
  instagram_media_id TEXT,
  last_error TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  published_at TEXT,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_videos_status
  ON videos(status);
