/**
 * Teacher Invitation Model
 * Invitation lifecycle for teacher onboarding
 */

const db = require('../config/database');

const TeacherInvitation = {
  async createOrUpdatePending({ name, email, token, expiresAt, invitedBy }) {
    const result = await db.query(
      `INSERT INTO teacher_invitations (name, email, token, status, expires_at, invited_by)
       VALUES ($1, $2, $3, 'PENDING', $4, $5)
       ON CONFLICT (email)
       DO UPDATE
       SET name = EXCLUDED.name,
           token = EXCLUDED.token,
           status = 'PENDING',
           expires_at = EXCLUDED.expires_at,
           invited_by = EXCLUDED.invited_by,
           accepted_at = NULL,
           accepted_by_user_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       RETURNING id, name, email, token, status, expires_at, invited_by, created_at, updated_at`,
      [name, email, token, expiresAt, invitedBy]
    );

    return result.rows[0];
  },

  async listAll() {
    const result = await db.query(
      `SELECT id, name, email, token, status, expires_at, accepted_at, created_at, updated_at
       FROM teacher_invitations
       ORDER BY created_at DESC`
    );

    return result.rows;
  },

  async findByToken(token) {
    const result = await db.query(
      `SELECT id, name, email, token, status, expires_at, accepted_at, accepted_by_user_id, created_at
       FROM teacher_invitations
       WHERE token = $1`,
      [token]
    );

    return result.rows[0] || null;
  },

  async markAccepted(id, userId) {
    const result = await db.query(
      `UPDATE teacher_invitations
       SET status = 'ACCEPTED',
           accepted_at = CURRENT_TIMESTAMP,
           accepted_by_user_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, status, accepted_at, accepted_by_user_id`,
      [userId, id]
    );

    return result.rows[0] || null;
  },

  async expireOldInvitations() {
    await db.query(
      `UPDATE teacher_invitations
       SET status = 'EXPIRED',
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'PENDING' AND expires_at < CURRENT_TIMESTAMP`
    );
  },
};

module.exports = TeacherInvitation;
