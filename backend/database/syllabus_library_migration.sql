-- Non-destructive SQL migration for syllabus library

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'syllabus_upload_status') THEN
    CREATE TYPE syllabus_upload_status AS ENUM ('UPLOADED', 'PROCESSING', 'READY');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS syllabus_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject VARCHAR(255) NOT NULL,
  branch VARCHAR(50) NOT NULL,
  department VARCHAR(100) NOT NULL,
  year INTEGER NOT NULL CHECK (year >= 1 AND year <= 8),
  file_path VARCHAR(500) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  status syllabus_upload_status NOT NULL DEFAULT 'UPLOADED',
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_syllabus_branch ON syllabus_library(branch);
CREATE INDEX IF NOT EXISTS idx_syllabus_department ON syllabus_library(department);
CREATE INDEX IF NOT EXISTS idx_syllabus_year ON syllabus_library(year);
CREATE INDEX IF NOT EXISTS idx_syllabus_status ON syllabus_library(status);
CREATE INDEX IF NOT EXISTS idx_syllabus_uploaded_by ON syllabus_library(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_syllabus_created_at ON syllabus_library(created_at DESC);

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
    WHERE tgname = 'update_syllabus_library_updated_at'
  ) THEN
    CREATE TRIGGER update_syllabus_library_updated_at
    BEFORE UPDATE ON syllabus_library
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;
