import express from 'express';
import { body, validationResult } from 'express-validator';
import db from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const { search, city, state, is_active } = req.query;
    let query = 'SELECT * FROM suppliers WHERE user_id = ?';
    const params = [req.user.id];

    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (city) {
      query += ' AND city = ?';
      params.push(city);
    }
    if (state) {
      query += ' AND state = ?';
      params.push(state);
    }
    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    query += ' ORDER BY name';
    const suppliers = db.prepare(query).all(...params);
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!supplier) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    const purchases = db.prepare(`
      SELECT SUM(dc.amount) as total_purchases, COUNT(*) as total_orders
      FROM direct_costs dc
      WHERE dc.supplier_id = ?
    `).get(req.params.id);
    
    res.json({ ...supplier, ...purchases });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proveedor' });
  }
});

router.post('/', authenticateToken, [
  body('name').trim().notEmpty().withMessage('El nombre es requerido')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, phone, address, country, city, postal_code, notes } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO suppliers (user_id, name, email, phone, address, country, city, postal_code, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, name, email || null, phone || null, address || null, country || null, city || null, postal_code || null, notes || null);

    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(supplier);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

router.put('/:id', authenticateToken, (req, res) => {
  const { name, email, phone, address, country, city, postal_code, notes, is_active } = req.body;

  try {
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!supplier) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    db.prepare(`
      UPDATE suppliers SET 
        name = ?, email = ?, phone = ?, address = ?, country = ?, city = ?,
        postal_code = ?, notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, email, phone, address, country, city, postal_code, notes, is_active ?? 1, req.params.id);

    const updated = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!supplier) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Proveedor eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

export default router;