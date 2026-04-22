/**
 * Syllabus Library Model
 * Handles syllabus upload metadata and query operations
 */

const db = require('../config/database');

const SyllabusLibrary = {
  /**
   * Create a new syllabus record
   * @param {Object} syllabusData
   * @returns {Promise<Object>}
   */
  async create(syllabusData) {
    const {
      subject,
      branch,
      department,
      year,
      filePath,
      originalFileName,
      mimeType,
      fileSizeBytes,
      status,
      uploadedBy,
    } = syllabusData;

    const result = await db.query(
      `INSERT INTO syllabus_library
        (subject, branch, department, year, file_path, original_file_name, mime_type, file_size_bytes, status, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'UPLOADED'), $10)
       RETURNING *`,
      [
        subject,
        branch,
        department,
        year,
        filePath,
        originalFileName,
        mimeType,
        fileSizeBytes,
        status || null,
        uploadedBy,
      ]
    );

    return this.findById(result.rows[0].id);
  },

  /**
   * Find syllabus by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const result = await db.query(
      `SELECT sl.*, u.name AS uploaded_by_name
       FROM syllabus_library sl
       LEFT JOIN users u ON u.id = sl.uploaded_by
       WHERE sl.id = $1`,
      [id]
    );

    return result.rows[0] || null;
  },

  /**
   * Get syllabus list with filters and pagination
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  async list(filters = {}) {
    const {
      search,
      branch,
      department,
      year,
      status,
      page = 1,
      limit = 20,
    } = filters;

    const whereClauses = [];
    const values = [];
    let paramIndex = 1;

    if (search) {
      whereClauses.push(
        `(sl.subject ILIKE $${paramIndex} OR sl.branch ILIKE $${paramIndex} OR sl.department ILIKE $${paramIndex})`
      );
      values.push(`%${search}%`);
      paramIndex += 1;
    }

    if (branch) {
      whereClauses.push(`sl.branch = $${paramIndex}`);
      values.push(branch);
      paramIndex += 1;
    }

    if (department) {
      whereClauses.push(`sl.department = $${paramIndex}`);
      values.push(department);
      paramIndex += 1;
    }

    if (year) {
      whereClauses.push(`sl.year = $${paramIndex}`);
      values.push(year);
      paramIndex += 1;
    }

    if (status) {
      whereClauses.push(`sl.status = $${paramIndex}`);
      values.push(status);
      paramIndex += 1;
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * safeLimit;

    const countQuery = `SELECT COUNT(*)::int AS total FROM syllabus_library sl ${whereSql}`;

    const listQuery = `
      SELECT sl.*, u.name AS uploaded_by_name
      FROM syllabus_library sl
      LEFT JOIN users u ON u.id = sl.uploaded_by
      ${whereSql}
      ORDER BY sl.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countResult = await db.query(countQuery, values);
    const listResult = await db.query(listQuery, [...values, safeLimit, offset]);

    return {
      items: listResult.rows,
      total: countResult.rows[0].total,
      page: safePage,
      limit: safeLimit,
    };
  },

  /**
   * Update syllabus by ID
   * @param {string} id
   * @param {Object} updateData
   * @returns {Promise<Object|null>}
   */
  async updateById(id, updateData) {
    const allowedFields = [
      'subject',
      'branch',
      'department',
      'year',
      'file_path',
      'original_file_name',
      'mime_type',
      'file_size_bytes',
      'status',
      'extracted_text',
    ];

    const fieldMap = {
      filePath: 'file_path',
      originalFileName: 'original_file_name',
      mimeType: 'mime_type',
      fileSizeBytes: 'file_size_bytes',
    };

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updateData)) {
      const dbField = fieldMap[key] || key;
      if (allowedFields.includes(dbField) && value !== undefined) {
        updates.push(`${dbField} = $${paramIndex}`);
        values.push(value);
        paramIndex += 1;
      }
    }

    if (!updates.length) {
      return this.findById(id);
    }

    values.push(id);

    const result = await db.query(
      `UPDATE syllabus_library
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id`,
      values
    );

    if (!result.rowCount) {
      return null;
    }

    return this.findById(id);
  },

  /**
   * Delete syllabus by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async deleteById(id) {
    const result = await db.query(
      `DELETE FROM syllabus_library
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return result.rows[0] || null;
  },

  /**
   * Get overview statistics for syllabus dashboard cards
   * @returns {Promise<Object>}
   */
  async getOverviewStats() {
    const [totalsResult, statusResult] = await Promise.all([
      db.query(
        `SELECT
          COUNT(*)::int AS total_uploaded_syllabi,
          COUNT(DISTINCT branch)::int AS total_branches,
          COUNT(DISTINCT department)::int AS total_departments,
          COUNT(DISTINCT subject)::int AS total_subjects
         FROM syllabus_library`
      ),
      db.query(
        `SELECT status, COUNT(*)::int AS count
         FROM syllabus_library
         GROUP BY status`
      ),
    ]);

    const statusCounts = {
      UPLOADED: 0,
      PROCESSING: 0,
      READY: 0,
    };

    for (const row of statusResult.rows) {
      statusCounts[row.status] = row.count;
    }

    return {
      ...totalsResult.rows[0],
      statusCounts,
    };
  },

  /**
   * Get filter options for dropdowns
   * @returns {Promise<Object>}
   */
  async getFilterOptions() {
    const [branchResult, departmentResult, yearResult, subjectResult] = await Promise.all([
      db.query('SELECT DISTINCT branch FROM syllabus_library ORDER BY branch ASC'),
      db.query('SELECT DISTINCT department FROM syllabus_library ORDER BY department ASC'),
      db.query('SELECT DISTINCT year FROM syllabus_library ORDER BY year ASC'),
      db.query('SELECT DISTINCT subject FROM syllabus_library ORDER BY subject ASC'),
    ]);

    return {
      branches: branchResult.rows.map((row) => row.branch),
      departments: departmentResult.rows.map((row) => row.department),
      years: yearResult.rows.map((row) => row.year),
      subjects: subjectResult.rows.map((row) => row.subject),
    };
  },
};

module.exports = SyllabusLibrary;
