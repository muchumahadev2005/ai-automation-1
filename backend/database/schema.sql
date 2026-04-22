-- ========================================
-- Hybrid AI-Based Online Exam Automation System
-- PostgreSQL Database Schema
-- ========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========================================
-- DROP EXISTING OBJECTS (for clean setup)
-- ========================================
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS attempts CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS syllabus_library CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS teacher_invitations CASCADE;
DROP TABLE IF EXISTS students_master CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS exam_status CASCADE;
DROP TYPE IF EXISTS attempt_status CASCADE;
DROP TYPE IF EXISTS correct_option CASCADE;
DROP TYPE IF EXISTS syllabus_upload_status CASCADE;

-- ========================================
-- CREATE ENUM TYPES
-- ========================================

-- User roles
CREATE TYPE user_role AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- Exam status
CREATE TYPE exam_status AS ENUM ('DRAFT', 'PUBLISHED', 'ACTIVE', 'CLOSED');

-- Attempt status
CREATE TYPE attempt_status AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- Correct option type
CREATE TYPE correct_option AS ENUM ('A', 'B', 'C', 'D');

-- Syllabus upload status
CREATE TYPE syllabus_upload_status AS ENUM ('UPLOADED', 'PROCESSING', 'READY');

-- ========================================
-- CREATE TABLES
-- ========================================

-- 1️⃣ USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255), -- Nullable for Google OAuth users
    role user_role NOT NULL,
    branch VARCHAR(50), -- Nullable for teachers
    year INTEGER CHECK (year >= 1 AND year <= 4), -- Nullable for teachers
    register_number VARCHAR(50) UNIQUE, -- For students
    employee_id VARCHAR(50) UNIQUE, -- For teachers
    google_id VARCHAR(255) UNIQUE, -- For Google OAuth
    profile_completed BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2️⃣ SYSTEM SETTINGS TABLE (singleton row for platform configuration)
CREATE TABLE system_settings (
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

-- 3️⃣ STUDENTS MASTER TABLE (admin-managed source of truth)
CREATE TABLE students_master (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_number VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    branch VARCHAR(50) NOT NULL,
    department VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4️⃣ TEACHER INVITATIONS TABLE
CREATE TABLE teacher_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5️⃣ EXAMS TABLE
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    branch VARCHAR(50) NOT NULL,
    year INTEGER NOT NULL CHECK (year >= 1 AND year <= 4),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    total_questions INTEGER DEFAULT 0,
    pass_percentage INTEGER DEFAULT 40 CHECK (pass_percentage >= 0 AND pass_percentage <= 100),
    randomize_questions BOOLEAN DEFAULT FALSE,
    status exam_status DEFAULT 'DRAFT',
    syllabus_path VARCHAR(500),
    published_at TIMESTAMP WITH TIME ZONE,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6️⃣ SYLLABUS LIBRARY TABLE
CREATE TABLE syllabus_library (
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
    extracted_text TEXT,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7️⃣ QUESTIONS TABLE
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    option_a VARCHAR(500) NOT NULL,
    option_b VARCHAR(500) NOT NULL,
    option_c VARCHAR(500) NOT NULL,
    option_d VARCHAR(500) NOT NULL,
    correct_option correct_option NOT NULL,
    marks INTEGER DEFAULT 1,
    explanation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8️⃣ ATTEMPTS TABLE
CREATE TABLE attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP WITH TIME ZONE,
    score INTEGER DEFAULT 0,
    total_marks INTEGER DEFAULT 0,
    percentage DECIMAL(5,2) DEFAULT 0,
    status attempt_status DEFAULT 'IN_PROGRESS',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Composite unique constraint: student can attempt an exam only once
    UNIQUE(exam_id, student_id)
);

-- 9️⃣ ANSWERS TABLE
CREATE TABLE answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_option correct_option,
    is_correct BOOLEAN DEFAULT FALSE,
    time_spent_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Composite unique constraint: one answer per question per attempt
    UNIQUE(attempt_id, question_id)
);

-- ========================================
-- CREATE INDEXES
-- ========================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_branch_year ON users(branch, year);
CREATE INDEX idx_users_google_id ON users(google_id);

-- System settings indexes
CREATE INDEX idx_system_settings_updated_by ON system_settings(updated_by);

-- Students master indexes
CREATE INDEX idx_students_master_reg_no ON students_master(registration_number);
CREATE INDEX idx_students_master_name ON students_master(name);
CREATE INDEX idx_students_master_department ON students_master(department);

-- Teacher invitations indexes
CREATE INDEX idx_teacher_invitations_email ON teacher_invitations(email);
CREATE INDEX idx_teacher_invitations_token ON teacher_invitations(token);
CREATE INDEX idx_teacher_invitations_status ON teacher_invitations(status);

-- Exams indexes
CREATE INDEX idx_exams_branch_year ON exams(branch, year);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_created_by ON exams(created_by);
CREATE INDEX idx_exams_start_end_time ON exams(start_time, end_time);

-- Syllabus library indexes
CREATE INDEX idx_syllabus_branch ON syllabus_library(branch);
CREATE INDEX idx_syllabus_department ON syllabus_library(department);
CREATE INDEX idx_syllabus_year ON syllabus_library(year);
CREATE INDEX idx_syllabus_status ON syllabus_library(status);
CREATE INDEX idx_syllabus_uploaded_by ON syllabus_library(uploaded_by);
CREATE INDEX idx_syllabus_created_at ON syllabus_library(created_at DESC);

-- Questions indexes
CREATE INDEX idx_questions_exam_id ON questions(exam_id);

-- Attempts indexes
CREATE INDEX idx_attempts_exam_id ON attempts(exam_id);
CREATE INDEX idx_attempts_student_id ON attempts(student_id);
CREATE INDEX idx_attempts_status ON attempts(status);

-- Answers indexes
CREATE INDEX idx_answers_attempt_id ON answers(attempt_id);
CREATE INDEX idx_answers_question_id ON answers(question_id);

-- ========================================
-- CREATE TRIGGER FOR updated_at
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to exams table
CREATE TRIGGER update_exams_updated_at
    BEFORE UPDATE ON exams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to system settings table
CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to syllabus library table
CREATE TRIGGER update_syllabus_library_updated_at
    BEFORE UPDATE ON syllabus_library
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to students_master table
CREATE TRIGGER update_students_master_updated_at
    BEFORE UPDATE ON students_master
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to teacher_invitations table
CREATE TRIGGER update_teacher_invitations_updated_at
    BEFORE UPDATE ON teacher_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- CREATE FUNCTION TO UPDATE EXAM QUESTION COUNT
-- ========================================

CREATE OR REPLACE FUNCTION update_exam_question_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE exams SET total_questions = total_questions + 1 WHERE id = NEW.exam_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE exams SET total_questions = total_questions - 1 WHERE id = OLD.exam_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_question_count
    AFTER INSERT OR DELETE ON questions
    FOR EACH ROW
    EXECUTE FUNCTION update_exam_question_count();

-- ========================================
-- COMMENTS FOR DOCUMENTATION
-- ========================================

COMMENT ON TABLE users IS 'Stores all users (admins, teachers, and students)';
COMMENT ON TABLE system_settings IS 'Singleton table storing admin-configurable platform settings';
COMMENT ON TABLE students_master IS 'Admin-managed student registry used for CSV sync and analytics';
COMMENT ON TABLE teacher_invitations IS 'Teacher invitation lifecycle and secure setup tokens';
COMMENT ON TABLE exams IS 'Stores exam metadata created by teachers';
COMMENT ON TABLE syllabus_library IS 'Admin-managed syllabus file library for branch/department/year/subject combinations';
COMMENT ON TABLE questions IS 'Stores MCQ questions for each exam';
COMMENT ON TABLE attempts IS 'Tracks student exam attempts';
COMMENT ON TABLE answers IS 'Stores individual answers for each attempt';

COMMENT ON COLUMN users.branch IS 'Student branch (CSD, CSE, AIDS, IT, ECE, EEE)';
COMMENT ON COLUMN users.year IS 'Student year (1-4)';
COMMENT ON COLUMN exams.status IS 'DRAFT: editing, PUBLISHED: visible, ACTIVE: live, CLOSED: finished';
COMMENT ON COLUMN attempts.status IS 'IN_PROGRESS: ongoing, SUBMITTED: completed';

-- ========================================
-- DEFAULT ADMIN USER
-- Email: admin@gmail.com
-- Password: admin123
-- ========================================

INSERT INTO users (name, email, password, role, profile_completed, is_active)
VALUES (
    'Platform Admin',
    'admin@gmail.com',
    crypt('admin123', gen_salt('bf', 10)),
    'ADMIN',
    true,
    true
)
ON CONFLICT (email) DO UPDATE
SET
    name = EXCLUDED.name,
    password = EXCLUDED.password,
    role = EXCLUDED.role,
    profile_completed = EXCLUDED.profile_completed,
    is_active = true,
    updated_at = CURRENT_TIMESTAMP;
