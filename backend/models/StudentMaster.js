/**
 * Student Master Model
 * Admin-managed student registry operations
 */

const db = require('../config/database');

const StudentMaster = {
  async findAll(search = '') {
    if (!search) {
      const result = await db.query(
        `SELECT id, registration_number, name, email, branch, department, created_at, updated_at
         FROM students_master
         ORDER BY registration_number ASC`
      );

      return result.rows;
    }

    const searchPattern = `%${search}%`;

    const result = await db.query(
      `SELECT id, registration_number, name, email, branch, department, created_at, updated_at
       FROM students_master
       WHERE registration_number ILIKE $1 OR name ILIKE $1
       ORDER BY registration_number ASC`,
      [searchPattern]
    );

    return result.rows;
  },

  async findById(id) {
    const result = await db.query(
      `SELECT id, registration_number, name, email, branch, department, created_at, updated_at
       FROM students_master
       WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  },

  async updateById(id, updateData) {
    const allowedFields = ['registration_number', 'name', 'email', 'branch', 'department'];
    const updates = [];
    const values = [];
    let index = 1;

    for (const [key, value] of Object.entries(updateData)) {
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbField) && value !== undefined) {
        updates.push(`${dbField} = $${index}`);
        values.push(value);
        index += 1;
      }
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = await db.query(
      `UPDATE students_master
       SET ${updates.join(', ')}
       WHERE id = $${index}
       RETURNING id, registration_number, name, email, branch, department, created_at, updated_at`,
      values
    );

    return result.rows[0] || null;
  },

  async deleteById(id) {
    const result = await db.query(
      'DELETE FROM students_master WHERE id = $1 RETURNING id',
      [id]
    );

    return !!result.rows[0];
  },

  async create(data) {
    const { registration_number, name, email, branch, department } = data;

    const result = await db.query(
      `INSERT INTO students_master (registration_number, name, email, branch, department)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, registration_number, name, email, branch, department, created_at, updated_at`,
      [registration_number, name, email, branch || '', department]
    );

    return result.rows[0] || null;
  },

  async upsertMany(rows) {
    if (!rows.length) {
      return {
        totalProcessed: 0,
        insertedCount: 0,
        updatedCount: 0,
      };
    }

    const regNumbers = rows.map((row) => row.registration_number);

    const existing = await db.query(
      'SELECT registration_number FROM students_master WHERE registration_number = ANY($1::text[])',
      [regNumbers]
    );

    const existingSet = new Set(existing.rows.map((row) => row.registration_number));

    const insertedCount = rows.filter((row) => !existingSet.has(row.registration_number)).length;
    const updatedCount = rows.length - insertedCount;

    const values = [];
    const placeholders = rows.map((row, rowIndex) => {
      const offset = rowIndex * 4;
      values.push(row.registration_number, row.name, row.branch, row.department);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
    });

    await db.query(
      `INSERT INTO students_master (registration_number, name, branch, department)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (registration_number)
       DO UPDATE
       SET name = EXCLUDED.name,
           branch = EXCLUDED.branch,
           department = EXCLUDED.department,
           updated_at = CURRENT_TIMESTAMP`,
      values
    );

    return {
      totalProcessed: rows.length,
      insertedCount,
      updatedCount,
    };
  },
};

module.exports = StudentMaster;
