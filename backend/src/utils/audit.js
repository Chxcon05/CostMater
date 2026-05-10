import { run } from '../config/database.js';

export function audit(userId, tableName, recordId, action, oldData = null, newData = null) {
  try {
    run(
      `INSERT INTO audit_log (user_id, table_name, record_id, action, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, tableName, recordId, action, oldData ? JSON.stringify(oldData) : null, newData ? JSON.stringify(newData) : null]
    );
  } catch (e) { console.error('Audit error:', e); }
}