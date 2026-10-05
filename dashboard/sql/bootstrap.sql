CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  owner_id INTEGER,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  storage_message_id INTEGER,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_users (
  uid INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_file_id TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS "akun-telegram" (
  uid INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  photo_file_id TEXT,
  auth_date INTEGER,
  allows_write_to_pm INTEGER,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_akun_telegram_name
  ON "akun-telegram"(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_akun_telegram_username
  ON "akun-telegram"(username);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  uid INTEGER NOT NULL,
  device_id TEXT,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  uid INTEGER NOT NULL,
  sender TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  read_at TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  reply_to_id TEXT,
  ai_input_tokens INTEGER,
  ai_output_tokens INTEGER,
  sender_device_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_uid_created
  ON messages(uid, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  uid INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  ip TEXT,
  location TEXT,
  device TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_uid_created
  ON notifications(uid, created_at);

CREATE TABLE IF NOT EXISTS device_ids (
  device_id TEXT NOT NULL,
  uid INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  device_type TEXT,
  os TEXT,
  brand TEXT,
  model TEXT,
  browser TEXT,
  cpu_cores INTEGER,
  ram_gb REAL,
  user_agent TEXT,
  language TEXT,
  timezone TEXT,
  platform TEXT,
  max_touch INTEGER,
  color_depth INTEGER,
  webgl_vendor TEXT,
  webgl_renderer TEXT,
  screen_w INTEGER,
  screen_h INTEGER,
  viewport_w INTEGER,
  viewport_h INTEGER,
  screen_avail_w INTEGER,
  screen_avail_h INTEGER,
  pixel_ratio REAL,
  orientation TEXT,
  color_gamut TEXT,
  network_type TEXT,
  browser_version TEXT,
  ua_architecture TEXT,
  ua_platform_version TEXT,
  ua_bitness TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (device_id, uid)
);

CREATE TABLE IF NOT EXISTS session_blacklist (
  device_id TEXT NOT NULL,
  uid INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (device_id, uid)
);

CREATE TABLE IF NOT EXISTS user_covers (
  uid INTEGER PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'color',
  color1 TEXT,
  color2 TEXT,
  icon TEXT,
  storage_path TEXT,
  storage_message_id INTEGER,
  content_type TEXT,
  bg_size REAL,
  bg_x REAL,
  bg_y REAL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS telegram_bot_user_ids (
  telegram_uid INTEGER PRIMARY KEY,
  first_seen_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS telegram_bot_user_ids_no_update
BEFORE UPDATE ON telegram_bot_user_ids
BEGIN
  SELECT RAISE(ABORT, 'Telegram bot user IDs are append-only');
END;

CREATE TRIGGER IF NOT EXISTS telegram_bot_user_ids_no_delete
BEFORE DELETE ON telegram_bot_user_ids
BEGIN
  SELECT RAISE(ABORT, 'Telegram bot user IDs are append-only');
END;

CREATE TABLE IF NOT EXISTS telegram_login_challenges (
  challenge_hash TEXT PRIMARY KEY,
  requester_hash TEXT,
  uid INTEGER,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'consumed')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_login_challenges_requester_created
  ON telegram_login_challenges(requester_hash, created_at);

CREATE TABLE IF NOT EXISTS account_session_versions (
  uid INTEGER PRIMARY KEY,
  session_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_preferences (
  uid INTEGER PRIMARY KEY,
  display_name TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_message_hides (
  uid INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (uid, message_id)
);

CREATE TABLE IF NOT EXISTS chat_message_pins (
  uid INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (uid, message_id)
);

CREATE TABLE IF NOT EXISTS chat_notification_pins (
  uid INTEGER NOT NULL,
  notification_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (uid, notification_id)
);

CREATE TABLE IF NOT EXISTS device_link_tokens (
  token_hash TEXT PRIMARY KEY,
  uid INTEGER NOT NULL,
  created_by_device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_device_link_tokens_expiry
  ON device_link_tokens(expires_at);

CREATE TABLE IF NOT EXISTS library_nodes (
  id TEXT PRIMARY KEY,
  owner_uid INTEGER NOT NULL,
  parent_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('folder', 'text', 'media')),
  name TEXT NOT NULL,
  content TEXT,
  content_type TEXT,
  storage_file_id TEXT,
  thumbnail_content TEXT,
  thumbnail_file_id TEXT,
  thumbnail_message_id INTEGER,
  storage_message_id INTEGER,
  file_size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS library_nodes_owner_parent
  ON library_nodes(owner_uid, parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS library_nodes_unique_location
  ON library_nodes(owner_uid, COALESCE(parent_id, ''), name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS github_credentials (
  uid INTEGER PRIMARY KEY,
  encrypted_token TEXT NOT NULL,
  github_login TEXT NOT NULL,
  scopes TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_provider_keys (
  id TEXT PRIMARY KEY,
  uid INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS system_incident_alerts (
  fingerprint TEXT PRIMARY KEY,
  last_notified_at INTEGER NOT NULL
);
