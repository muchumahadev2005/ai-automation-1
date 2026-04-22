-- ================================================================
-- Student OTP Verification Migration
-- Adds email to students_master and creates OTP verification table
-- ================================================================

-- 1. Add email column to students_master if not exists
ALTER TABLE students_master 
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

-- 2. Create student OTP verification table
CREATE TABLE IF NOT EXISTS student_otp_verification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    otp VARCHAR(6) NOT NULL,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_student_otp_email ON student_otp_verification(email);
CREATE INDEX IF NOT EXISTS idx_student_otp_verified ON student_otp_verification(verified);
CREATE INDEX IF NOT EXISTS idx_students_master_email ON students_master(email);

-- 4. Add comment describing the table
COMMENT ON TABLE student_otp_verification IS 'Stores OTP data for student email verification during registration';
COMMENT ON COLUMN student_otp_verification.email IS 'Student email from students_master';
COMMENT ON COLUMN student_otp_verification.otp IS '6-digit OTP sent via SMTP';
COMMENT ON COLUMN student_otp_verification.attempts IS 'Number of OTP verification attempts';
COMMENT ON COLUMN student_otp_verification.max_attempts IS 'Maximum allowed OTP verification attempts';
COMMENT ON COLUMN student_otp_verification.expires_at IS 'OTP expiration timestamp (typically 10 minutes from creation)';
COMMENT ON COLUMN student_otp_verification.verified IS 'Flag indicating whether OTP was successfully verified';
