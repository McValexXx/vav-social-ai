CREATE TABLE IF NOT EXISTS instagram_messages (
  message_id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  message_text TEXT NOT NULL,
  keyword_matched INTEGER NOT NULL DEFAULT 0,
  replied INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  replied_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_instagram_messages_received_at
  ON instagram_messages(received_at);
