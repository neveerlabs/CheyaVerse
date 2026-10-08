CREATE TABLE IF NOT EXISTS public.media (
  id TEXT PRIMARY KEY,
  owner_id BIGINT,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  storage_message_id BIGINT,
  content_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.telegram_users (
  uid BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_file_id TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS public."akun-telegram" (
  uid BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  photo_file_id TEXT,
  auth_date BIGINT,
  allows_write_to_pm INTEGER,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_akun_telegram_name
  ON public."akun-telegram"(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_akun_telegram_username
  ON public."akun-telegram"(username);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  uid BIGINT NOT NULL,
  device_id TEXT,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  uid BIGINT NOT NULL,
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
  ai_input_tokens BIGINT,
  ai_output_tokens BIGINT,
  sender_device_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_uid_created
  ON public.messages(uid, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_ai_memory_search
  ON public.messages USING GIN (to_tsvector('simple'::regconfig, content))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  uid BIGINT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  ip TEXT,
  location TEXT,
  device TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_uid_created
  ON public.notifications(uid, created_at);

CREATE TABLE IF NOT EXISTS public.device_ids (
  device_id TEXT NOT NULL,
  uid BIGINT NOT NULL,
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

CREATE TABLE IF NOT EXISTS public.session_blacklist (
  device_id TEXT NOT NULL,
  uid BIGINT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (device_id, uid)
);

CREATE TABLE IF NOT EXISTS public.web_presence (
  uid BIGINT NOT NULL,
  device_id TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (uid, device_id)
);

CREATE TABLE IF NOT EXISTS public.device_account_state (
  device_id TEXT PRIMARY KEY,
  current_uid BIGINT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_covers (
  uid BIGINT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'color',
  color1 TEXT,
  color2 TEXT,
  icon TEXT,
  storage_path TEXT,
  storage_message_id BIGINT,
  content_type TEXT,
  bg_size REAL,
  bg_x REAL,
  bg_y REAL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS public.telegram_bot_user_ids (
  telegram_uid BIGINT PRIMARY KEY,
  first_seen_at TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION public.prevent_telegram_bot_user_id_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Telegram bot user IDs are append-only';
END;
$$;

DROP TRIGGER IF EXISTS telegram_bot_user_ids_no_update
  ON public.telegram_bot_user_ids;
CREATE TRIGGER telegram_bot_user_ids_no_update
BEFORE UPDATE ON public.telegram_bot_user_ids
FOR EACH ROW EXECUTE FUNCTION public.prevent_telegram_bot_user_id_mutation();

DROP TRIGGER IF EXISTS telegram_bot_user_ids_no_delete
  ON public.telegram_bot_user_ids;
CREATE TRIGGER telegram_bot_user_ids_no_delete
BEFORE DELETE ON public.telegram_bot_user_ids
FOR EACH ROW EXECUTE FUNCTION public.prevent_telegram_bot_user_id_mutation();

CREATE TABLE IF NOT EXISTS public.telegram_login_challenges (
  challenge_hash TEXT PRIMARY KEY,
  requester_hash TEXT,
  uid BIGINT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'consumed')),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  approved_at BIGINT,
  consumed_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_login_challenges_requester_created
  ON public.telegram_login_challenges(requester_hash, created_at);

CREATE TABLE IF NOT EXISTS public.account_session_versions (
  uid BIGINT PRIMARY KEY,
  session_version BIGINT NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.account_preferences (
  uid BIGINT PRIMARY KEY,
  display_name TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.chat_message_hides (
  uid BIGINT NOT NULL,
  message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (uid, message_id)
);

CREATE TABLE IF NOT EXISTS public.chat_message_pins (
  uid BIGINT NOT NULL,
  message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (uid, message_id)
);

CREATE TABLE IF NOT EXISTS public.chat_notification_pins (
  uid BIGINT NOT NULL,
  notification_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (uid, notification_id)
);

CREATE TABLE IF NOT EXISTS public.device_link_tokens (
  token_hash TEXT PRIMARY KEY,
  uid BIGINT NOT NULL,
  created_by_device_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_device_link_tokens_expiry
  ON public.device_link_tokens(expires_at);

CREATE TABLE IF NOT EXISTS public.library_nodes (
  id TEXT PRIMARY KEY,
  owner_uid BIGINT NOT NULL,
  parent_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('folder', 'text', 'media')),
  name TEXT NOT NULL,
  content TEXT,
  content_type TEXT,
  storage_file_id TEXT,
  thumbnail_content TEXT,
  thumbnail_file_id TEXT,
  thumbnail_message_id BIGINT,
  storage_message_id BIGINT,
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS library_nodes_owner_parent
  ON public.library_nodes(owner_uid, parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS library_nodes_unique_location
  ON public.library_nodes(owner_uid, COALESCE(parent_id, ''), lower(name));

CREATE TABLE IF NOT EXISTS public.github_credentials (
  uid BIGINT PRIMARY KEY,
  encrypted_token TEXT NOT NULL,
  github_login TEXT NOT NULL,
  scopes TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ai_provider_keys (
  id TEXT PRIMARY KEY,
  uid BIGINT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT,
  endpoint_url TEXT
);
ALTER TABLE public.ai_provider_keys
  ADD COLUMN IF NOT EXISTS endpoint_url TEXT;
ALTER TABLE public.ai_provider_keys
  ALTER COLUMN uid TYPE BIGINT USING uid::BIGINT;

CREATE TABLE IF NOT EXISTS public.telegram_group_ai_settings (
  group_id BIGINT PRIMARY KEY,
  owner_uid BIGINT NOT NULL,
  group_title TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  send_enabled INTEGER NOT NULL DEFAULT 0,
  enabled_by BIGINT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
ALTER TABLE public.telegram_group_ai_settings
  ADD COLUMN IF NOT EXISTS send_enabled INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.telegram_group_ai_consents (
  group_id BIGINT NOT NULL,
  telegram_uid BIGINT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  consented_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (group_id, telegram_uid)
);
CREATE TABLE IF NOT EXISTS public.system_incident_alerts (
  fingerprint TEXT PRIMARY KEY,
  last_notified_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.system_db_activity (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  last_user_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.system_db_activity (singleton, last_user_activity_at)
VALUES (TRUE, now())
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.system_keepalive (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  touched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_keepalive_runs (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.telegram_ai_provider_rotation (
  uid BIGINT NOT NULL,
  provider_set TEXT NOT NULL,
  pair_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (uid, provider_set)
);

CREATE OR REPLACE FUNCTION public.record_user_database_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.system_db_activity (singleton, last_user_activity_at)
  VALUES (TRUE, clock_timestamp())
  ON CONFLICT (singleton)
  DO UPDATE SET last_user_activity_at = EXCLUDED.last_user_activity_at;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'media',
    'telegram_users',
    'akun-telegram',
    'push_subscriptions',
    'messages',
    'notifications',
    'device_ids',
    'session_blacklist',
    'user_covers',
    'telegram_bot_user_ids',
    'telegram_login_challenges',
    'account_session_versions',
    'account_preferences',
    'chat_message_hides',
    'chat_message_pins',
    'chat_notification_pins',
    'device_link_tokens',
    'library_nodes',
    'github_credentials',
    'ai_provider_keys',
    'telegram_group_ai_settings',
    'telegram_group_ai_consents'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS track_user_database_activity ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER track_user_database_activity
       AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH STATEMENT
       EXECUTE FUNCTION public.record_user_database_activity()',
      table_name
    );
  END LOOP;
END;
$$;

-- Browser clients may subscribe to changes but can only see their own rows.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
REVOKE ALL ON public.messages, public.notifications, public.media, public.user_covers,
  public.chat_message_hides, public.chat_message_pins, public.chat_notification_pins,
  public.session_blacklist, public.library_nodes, public.web_presence,
  public.device_account_state, public.telegram_group_ai_settings,
  public.telegram_group_ai_consents
  FROM anon, authenticated;
GRANT SELECT ON public.messages, public.notifications, public.media, public.user_covers,
  public.chat_message_hides, public.chat_message_pins, public.chat_notification_pins,
  public.session_blacklist, public.library_nodes
  TO authenticated;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_covers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_hides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_notification_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_account_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_group_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_group_ai_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_realtime_own_rows ON public.messages;
CREATE POLICY messages_realtime_own_rows ON public.messages
  FOR SELECT TO authenticated
  USING (
    uid::TEXT = (
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB
      ->> 'telegram_uid'
    )
  );

DROP POLICY IF EXISTS notifications_realtime_own_rows ON public.notifications;
CREATE POLICY notifications_realtime_own_rows ON public.notifications
  FOR SELECT TO authenticated
  USING (
    uid::TEXT = (
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB
      ->> 'telegram_uid'
    )
  );

DROP POLICY IF EXISTS media_realtime_own_rows ON public.media;
CREATE POLICY media_realtime_own_rows ON public.media
  FOR SELECT TO authenticated
  USING (
    owner_id::TEXT = (
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB
      ->> 'telegram_uid'
    )
  );

DROP POLICY IF EXISTS user_covers_realtime_own_rows ON public.user_covers;
CREATE POLICY user_covers_realtime_own_rows ON public.user_covers
  FOR SELECT TO authenticated
  USING (
    uid::TEXT = (
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB
      ->> 'telegram_uid'
    )
  );

DROP POLICY IF EXISTS chat_message_hides_realtime_own_rows
  ON public.chat_message_hides;
CREATE POLICY chat_message_hides_realtime_own_rows ON public.chat_message_hides
  FOR SELECT TO authenticated
  USING (
    uid::TEXT = (
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB
      ->> 'telegram_uid'
    )
  );

DROP POLICY IF EXISTS chat_message_pins_realtime_own_rows
  ON public.chat_message_pins;
CREATE POLICY chat_message_pins_realtime_own_rows ON public.chat_message_pins
  FOR SELECT TO authenticated
  USING (
    uid::TEXT = (
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB
      ->> 'telegram_uid'
    )
  );

DROP POLICY IF EXISTS chat_notification_pins_realtime_own_rows
  ON public.chat_notification_pins;
CREATE POLICY chat_notification_pins_realtime_own_rows
  ON public.chat_notification_pins
  FOR SELECT TO authenticated
  USING (
    uid::TEXT = (
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB
      ->> 'telegram_uid'
    )
  );

DROP POLICY IF EXISTS session_blacklist_realtime_own_rows
  ON public.session_blacklist;
CREATE POLICY session_blacklist_realtime_own_rows ON public.session_blacklist
  FOR SELECT TO authenticated
  USING (
    uid::TEXT = (
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB
      ->> 'telegram_uid'
    )
  );

DROP POLICY IF EXISTS library_nodes_realtime_own_rows ON public.library_nodes;
CREATE POLICY library_nodes_realtime_own_rows ON public.library_nodes
  FOR SELECT TO authenticated
  USING (
    owner_uid::TEXT = (
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB
      ->> 'telegram_uid'
    )
  );

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.media REPLICA IDENTITY FULL;
ALTER TABLE public.user_covers REPLICA IDENTITY FULL;
ALTER TABLE public.chat_message_hides REPLICA IDENTITY FULL;
ALTER TABLE public.chat_message_pins REPLICA IDENTITY FULL;
ALTER TABLE public.chat_notification_pins REPLICA IDENTITY FULL;
ALTER TABLE public.session_blacklist REPLICA IDENTITY FULL;
ALTER TABLE public.library_nodes REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.media;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_covers;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_hides;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_pins;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_notification_pins;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.session_blacklist;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.library_nodes;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- Private Storage bucket for uploads from the bot and dashboard.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-media', 'user-media', FALSE, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- Upgrade the legacy AI preferences table if it was created with a 32-bit UID.
DO $migration$
BEGIN
  IF to_regclass('public.ai_context_preferences') IS NOT NULL THEN
    ALTER TABLE public.ai_context_preferences
      ALTER COLUMN uid TYPE BIGINT USING uid::BIGINT;
  END IF;
END;
$migration$;