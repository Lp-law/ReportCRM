CREATE TABLE IF NOT EXISTS section_templates (
  id TEXT PRIMARY KEY,
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS best_practices (
  id TEXT PRIMARY KEY,
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'BEST_PRACTICE',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ NULL,
  behavior TEXT NOT NULL DEFAULT 'INSERTABLE',
  source_report_id TEXT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
ON user_sessions (expires_at);
