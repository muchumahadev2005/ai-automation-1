-- Non-destructive SQL migration for system settings

CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  smtp_host VARCHAR(255) NOT NULL DEFAULT '',
  smtp_port INTEGER NOT NULL DEFAULT 587 CHECK (smtp_port > 0 AND smtp_port <= 65535),
  smtp_user VARCHAR(255) NOT NULL DEFAULT '',
  smtp_password TEXT NOT NULL DEFAULT '',
  gemini_api_key TEXT NOT NULL DEFAULT '',
  ollama_url VARCHAR(500) NOT NULL DEFAULT 'http://localhost:11434',
  default_question_count INTEGER NOT NULL DEFAULT 20 CHECK (default_question_count > 0 AND default_question_count <= 200),
  default_difficulty VARCHAR(20) NOT NULL DEFAULT 'Medium' CHECK (default_difficulty IN ('Easy', 'Medium', 'Hard')),
  email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_settings_updated_by ON system_settings(updated_by);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_system_settings_updated_at'
  ) THEN
    CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

INSERT INTO system_settings (
  id,
  smtp_host,
  smtp_port,
  smtp_user,
  smtp_password,
  gemini_api_key,
  ollama_url,
  default_question_count,
  default_difficulty,
  email_notifications_enabled,
  updated_by
)
VALUES (1, '', 587, '', '', '', 'http://localhost:11434', 20, 'Medium', TRUE, NULL)
ON CONFLICT (id) DO NOTHING;
