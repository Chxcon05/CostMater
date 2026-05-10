import express from 'express';
import db from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const { table_name, action, start_date, end_date, limit } = req.query;
    let query = 'SELECT * FROM audit_log WHERE user_id = ?';
    const params = [req.user.id];

    if (table_name) {
      query += ' AND table_name = ?';
      params.push(table_name);
    }
    if (action) {
      query += ' AND action = ?';
      params.push(action);
    }
    if (start_date) {
      query += ' AND DATE(created_at) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND DATE(created_at) <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit) || 100);

    const logs = db.prepare(query).all(...params);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial de auditoría' });
  }
});

router.post('/', authenticateToken, (req, res) => {
  const { table_name, record_id, action, old_data, new_data, ip_address } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO audit_log (user_id, table_name, record_id, action, old_data, new_data, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      table_name,
      record_id,
      action,
      old_data ? JSON.stringify(old_data) : null,
      new_data ? JSON.stringify(new_data) : null,
      ip_address || req.ip
    );

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear registro de auditoría' });
  }
});

export default router;