import { get, all, run } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { broadcastNotification } from './notifications.js';

export function supplierRoutes(app) {
  app.get('/api/suppliers', authenticateToken, async (req, res) => {
    try {
      const { search } = req.query;
      let sql = 'SELECT * FROM suppliers';
      const params = [];
      if (search) { sql += ' WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      sql += ' ORDER BY name';
      res.json(await all(sql, params));
    } catch (error) { res.status(500).json({ error: 'Error al obtener proveedores' }); }
  });

  app.get('/api/suppliers/:id', authenticateToken, async (req, res) => {
    try {
      const supplier = await get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
      if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });
      res.json(supplier);
    } catch (error) { res.status(500).json({ error: 'Error al obtener proveedor' }); }
  });

  app.post('/api/suppliers', authenticateToken, requireRole('admin'), async (req, res) => {
    const { name, email, phone, address, country, city, postal_code, notes } = req.body;
    try {
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es requerido' });
      const { lastInsertRowid } = await run(
        `INSERT INTO suppliers (user_id, name, email, phone, address, country, city, postal_code, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, String(name).trim(), email || null, phone || null, address || null, country || null, city || null, postal_code || null, notes || null]
      );
      const supplier = await get('SELECT * FROM suppliers WHERE id = ?', [lastInsertRowid]);
      if (!supplier) return res.status(500).json({ error: 'Error al recuperar el proveedor creado' });
      await audit(req.user.id, 'suppliers', supplier.id, 'CREATE', null, supplier);
      await broadcastNotification('success', 'Nuevo proveedor', `El usuario "${req.user.name}" añadió el proveedor "${supplier.name}".`, '/suppliers');
      res.status(201).json(supplier);
    } catch (error) { res.status(500).json({ error: 'Error al crear proveedor' }); }
  });

  app.put('/api/suppliers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const { name, email, phone, address, country, city, postal_code, notes, is_active } = req.body;
    try {
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es requerido' });
      const supplier = await get('SELECT * FROM suppliers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });
      await run(
        `UPDATE suppliers SET name = ?, email = ?, phone = ?, address = ?, country = ?, city = ?, postal_code = ?, notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [String(name).trim(), email || null, phone || null, address || null, country || null, city || null, postal_code || null, notes || null, is_active ?? 1, req.params.id]
      );
      const updated = await get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'suppliers', req.params.id, 'UPDATE', supplier, updated);
      res.json(updated);
    } catch (error) { res.status(500).json({ error: 'Error al actualizar proveedor' }); }
  });

  app.delete('/api/suppliers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const supplier = await get('SELECT * FROM suppliers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });
      await run('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'suppliers', req.params.id, 'DELETE', supplier, null);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar proveedor' }); }
  });
}

export function customerRoutes(app) {
  app.get('/api/customers', authenticateToken, async (req, res) => {
    try {
      const { search } = req.query;
      let sql = 'SELECT * FROM customers';
      const params = [];
      if (search) { sql += ' WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      sql += ' ORDER BY name';
      res.json(await all(sql, params));
    } catch (error) { res.status(500).json({ error: 'Error al obtener clientes' }); }
  });

  app.get('/api/customers/:id', authenticateToken, async (req, res) => {
    try {
      const customer = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
      if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
      res.json(customer);
    } catch (error) { res.status(500).json({ error: 'Error al obtener cliente' }); }
  });

  app.post('/api/customers', authenticateToken, requireRole('admin'), async (req, res) => {
    const { name, email, phone, address, city, postal_code, country, credit_limit, payment_days, notes } = req.body;
    try {
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es requerido' });
      const { lastInsertRowid } = await run(
        `INSERT INTO customers (user_id, name, email, phone, address, city, postal_code, country, credit_limit, payment_days, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, String(name).trim(), email || null, phone || null, address || null, city || null, postal_code || null, country || null, credit_limit || 0, payment_days || 0, notes || null]
      );
      const customer = await get('SELECT * FROM customers WHERE id = ?', [lastInsertRowid]);
      if (!customer) return res.status(500).json({ error: 'Error al recuperar el cliente creado' });
      await audit(req.user.id, 'customers', customer.id, 'CREATE', null, customer);
      await broadcastNotification('success', 'Nuevo cliente', `El usuario "${req.user.name}" añadió el cliente "${customer.name}".`, '/customers');
      res.status(201).json(customer);
    } catch (error) { res.status(500).json({ error: 'Error al crear cliente' }); }
  });

  app.put('/api/customers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const { name, email, phone, address, city, postal_code, country, credit_limit, payment_days, notes } = req.body;
    try {
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es requerido' });
      const customer = await get('SELECT * FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
      await run(
        `UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, city = ?, postal_code = ?, country = ?, credit_limit = ?, payment_days = ?, notes = ? WHERE id = ?`,
        [String(name).trim(), email || null, phone || null, address || null, city || null, postal_code || null, country || null, credit_limit || 0, payment_days || 0, notes || null, req.params.id]
      );
      const updated = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'customers', req.params.id, 'UPDATE', customer, updated);
      res.json(updated);
    } catch (error) { res.status(500).json({ error: 'Error al actualizar cliente' }); }
  });

  app.delete('/api/customers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const customer = await get('SELECT * FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
      await run('DELETE FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      await audit(req.user.id, 'customers', req.params.id, 'DELETE', customer, null);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar cliente' }); }
  });
}
