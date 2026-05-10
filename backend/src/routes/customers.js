import express from 'express';
import { body, validationResult } from 'express-validator';
import { run, get, all } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const { search, city, is_active } = req.query;
    let query = 'SELECT * FROM customers WHERE user_id = ?';
    const params = [req.user.id];

    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (city) {
      query += ' AND city = ?';
      params.push(city);
    }
    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    query += ' ORDER BY name';
    const customers = all(query, params);
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const customer = get('SELECT * FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const stats = get(`
      SELECT 
        COALESCE(SUM(i.total), 0) as total_sales,
        COUNT(i.id) as total_invoices
      FROM invoices i
      WHERE i.customer_id = ? AND i.status = 'pagada'
    `, [req.params.id]);
    
    res.json({ ...customer, ...stats });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
});

router.post('/', authenticateToken, [
  body('name').trim().notEmpty().withMessage('El nombre es requerido')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, phone, address, city, state, postal_code, country, credit_limit, payment_days, notes } = req.body;

  try {
    const params = [req.user.id, name, email || '', phone || '', address || '', city || '', state || '', postal_code || '', country || 'MX', credit_limit ? parseFloat(credit_limit) : 0, payment_days ? parseInt(payment_days) : 0, notes || ''];
    console.log('Creating customer with params:', params);
    const { lastInsertRowid } = run(`
      INSERT INTO customers (user_id, name, email, phone, address, city, state, postal_code, country, credit_limit, payment_days, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, params);

    const customer = get('SELECT * FROM customers WHERE id = ?', [lastInsertRowid]);
    console.log('Customer created:', customer);
    if (!customer) return res.status(500).json({ error: 'Error al recuperar el cliente creado' });
    res.status(201).json(customer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Error al crear cliente', details: error.message, stack: error.stack });
  }
});

router.put('/:id', authenticateToken, (req, res) => {
  const { name, email, phone, address, city, state, postal_code, country, contact_person, credit_limit, payment_days, notes, is_active } = req.body;

  try {
    const customer = get('SELECT * FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    run(`
      UPDATE customers SET 
        name = ?, email = ?, phone = ?, address = ?, city = ?, state = ?,
        postal_code = ?, country = ?, contact_person = ?, credit_limit = ?, payment_days = ?, notes = ?,
        is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `, [name, email, phone, address, city, state, postal_code, country || 'MX', contact_person, credit_limit || 0, payment_days || 0, notes, is_active ?? 1, req.params.id, req.user.id]);

    const updated = get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const customer = get('SELECT * FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    run('DELETE FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
});

export default router;