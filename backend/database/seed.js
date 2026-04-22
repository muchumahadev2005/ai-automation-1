/**
 * Database Seed Script
 * Populates database with sample data for development
 */
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
require('dotenv').config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'exam_automation',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

async function seedDatabase() {
  console.log('🌱 Starting database seeding...');

  const pool = new Pool(config);

  try {
    // Hash passwords
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com';
    const adminPassword = await bcrypt.hash('admin123', 10);
    const teacherPassword = await bcrypt.hash('123456789', 10);
    const studentPassword = await bcrypt.hash('student123', 10);

    // Create sample admin
    const adminId = uuidv4();
    await pool.query(`
      INSERT INTO users (id, name, email, password, role, profile_completed)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          password = EXCLUDED.password,
          role = EXCLUDED.role,
          profile_completed = EXCLUDED.profile_completed,
          is_active = true
      `, [adminId, 'Platform Admin', adminEmail, adminPassword, 'ADMIN', true]);

      console.log(`🛡️ Sample admin upserted: ${adminEmail} / admin123`);

    // Create sample teacher
    const teacherUpsert = await pool.query(`
      INSERT INTO users (id, name, email, password, role, employee_id, profile_completed)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          password = EXCLUDED.password,
          role = EXCLUDED.role,
          employee_id = EXCLUDED.employee_id,
          profile_completed = EXCLUDED.profile_completed,
          is_active = true
      RETURNING id
    `, [uuidv4(), 'Mahadev', 'mahadev1@gmail.com', teacherPassword, 'TEACHER', 'EMP001', true]);

    const teacherId = teacherUpsert.rows[0].id;

    console.log('👨‍🏫 Sample teacher upserted: mahadev1@gmail.com / 123456789');

    // Create sample students
    const students = [
      { name: 'Alice Johnson', email: 'alice@example.com', branch: 'CSE', year: 3, regNo: 'CSE2023001' },
      { name: 'Bob Williams', email: 'bob@example.com', branch: 'CSE', year: 3, regNo: 'CSE2023002' },
      { name: 'Charlie Brown', email: 'charlie@example.com', branch: 'IT', year: 2, regNo: 'IT2024001' },
    ];

    for (const student of students) {
      await pool.query(`
        INSERT INTO users (id, name, email, password, role, branch, year, register_number, profile_completed)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (email) DO NOTHING
      `, [uuidv4(), student.name, student.email, studentPassword, 'STUDENT', student.branch, student.year, student.regNo, true]);
    }

    console.log('👨‍🎓 Sample students created (password: student123)');

    // Create sample exam
    const examId = uuidv4();
    await pool.query(`
      INSERT INTO exams (id, title, description, branch, year, duration_minutes, status, created_by, pass_percentage)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT DO NOTHING
    `, [
      examId,
      'Data Structures Mid-Term',
      'Mid-term examination covering arrays, linked lists, stacks, and queues',
      'CSE',
      3,
      60,
      'PUBLISHED',
      teacherId,
      40
    ]);

    console.log('📝 Sample exam created: Data Structures Mid-Term');

    // Create sample questions
    const questions = [
      {
        text: 'What is the time complexity of accessing an element in an array by index?',
        a: 'O(1)', b: 'O(n)', c: 'O(log n)', d: 'O(n²)',
        correct: 'A'
      },
      {
        text: 'Which data structure uses LIFO principle?',
        a: 'Queue', b: 'Stack', c: 'Array', d: 'Linked List',
        correct: 'B'
      },
      {
        text: 'What is the worst-case time complexity of inserting at the beginning of an array?',
        a: 'O(1)', b: 'O(log n)', c: 'O(n)', d: 'O(n²)',
        correct: 'C'
      },
      {
        text: 'Which data structure is best for implementing a FIFO queue?',
        a: 'Stack', b: 'Array', c: 'Linked List', d: 'Binary Tree',
        correct: 'C'
      },
      {
        text: 'What is the space complexity of a recursive factorial function?',
        a: 'O(1)', b: 'O(n)', c: 'O(log n)', d: 'O(n²)',
        correct: 'B'
      }
    ];

    for (const q of questions) {
      await pool.query(`
        INSERT INTO questions (id, exam_id, question_text, option_a, option_b, option_c, option_d, correct_option)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [uuidv4(), examId, q.text, q.a, q.b, q.c, q.d, q.correct]);
    }

    console.log('❓ Sample questions created (5 questions)');

    console.log('');
    console.log('✅ Database seeding complete!');
    console.log('');
    console.log('📋 Test Credentials:');
      console.log(`   Admin: ${adminEmail} / admin123`);
    console.log('   Teacher: mahadev1@gmail.com / 123456789');
    console.log('   Student: alice@example.com / student123');

  } catch (error) {
    console.error('❌ Database seeding failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDatabase();
