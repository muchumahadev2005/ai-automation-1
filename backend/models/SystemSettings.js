/**
 * System Settings Model
 * Persists admin-configurable platform settings
 */

const db = require('../config/database');

const SystemSettings = {
  async findSingleton() {
    const result = await db.query('SELECT * FROM system_settings WHERE id = 1');
    return result.rows[0] || null;
  },

  async createDefaults(defaults, updatedBy = null) {
    const result = await db.query(
      `INSERT INTO system_settings (
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
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE
       SET smtp_host = EXCLUDED.smtp_host,
           smtp_port = EXCLUDED.smtp_port,
           smtp_user = EXCLUDED.smtp_user,
           smtp_password = EXCLUDED.smtp_password,
           gemini_api_key = EXCLUDED.gemini_api_key,
           ollama_url = EXCLUDED.ollama_url,
           default_question_count = EXCLUDED.default_question_count,
           default_difficulty = EXCLUDED.default_difficulty,
           email_notifications_enabled = EXCLUDED.email_notifications_enabled,
           updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [
        defaults.smtpHost,
        defaults.smtpPort,
        defaults.smtpUser,
        defaults.smtpPassword,
        defaults.geminiApiKey,
        defaults.ollamaUrl,
        defaults.defaultQuestionCount,
        defaults.defaultDifficulty,
        defaults.emailNotifications,
        updatedBy,
      ]
    );

    return result.rows[0];
  },

  async getOrCreate(defaults, updatedBy = null) {
    const current = await this.findSingleton();
    if (current) {
      return current;
    }

    return this.createDefaults(defaults, updatedBy);
  },

  async update(partialData, updatedBy = null) {
    const allowedFields = {
      smtpHost: 'smtp_host',
      smtpPort: 'smtp_port',
      smtpUser: 'smtp_user',
      smtpPassword: 'smtp_password',
      geminiApiKey: 'gemini_api_key',
      ollamaUrl: 'ollama_url',
      defaultQuestionCount: 'default_question_count',
      defaultDifficulty: 'default_difficulty',
      emailNotifications: 'email_notifications_enabled',
    };

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(partialData)) {
      const column = allowedFields[key];
      if (!column || value === undefined) {
        continue;
      }

      updates.push(`${column} = $${paramIndex}`);
      values.push(value);
      paramIndex += 1;
    }

    updates.push(`updated_by = $${paramIndex}`);
    values.push(updatedBy);
    paramIndex += 1;

    const query = `
      UPDATE system_settings
      SET ${updates.join(', ')}
      WHERE id = 1
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  },
};

module.exports = SystemSettings;
