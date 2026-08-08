import { get, all, run } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

export function costRoutes(app) {
  app.get('/api/costs/direct', authenticateToken, (req, res) => {
    try {
      const { productId } = req.query;
      let sql = `SELECT dc.*, p.name as product_name FROM direct_costs dc JOIN products p ON dc.product_id = p.id WHERE p.user_id = ?`;
      const params = [req.user.id];
      if (productId) { sql += ' AND dc.product_id = ?'; params.push(productId); }
      sql += ' ORDER BY dc.created_at DESC';
      res.json(all(sql, params));
    } catch (error) { res.status(500).json({ error: 'Error al obtener costos directos' }); }
  });

  app.post('/api/costs/direct', authenticateToken, (req, res) => {
    const { product_id, type, description, amount, quantity, unit_cost, invoice_number, purchase_date } = req.body;
    try {
      const product = get('SELECT * FROM products WHERE id = ? AND user_id = ?', [product_id, req.user.id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
      const { lastInsertRowid } = run(
        `INSERT INTO direct_costs (product_id, type, description, amount, quantity, unit_cost, invoice_number, purchase_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [product_id, type, description, amount, quantity || 1, unit_cost || amount, invoice_number, purchase_date]
      );
      const cost = get('SELECT * FROM direct_costs WHERE id = ?', [lastInsertRowid]);
      if (!cost) return res.status(500).json({ error: 'Error al recuperar el costo creado' });
      audit(req.user.id, 'direct_costs', cost.id, 'CREATE', null, cost);
      res.status(201).json(cost);
    } catch (error) { 
      console.error('Error creating direct cost:', error);
      res.status(500).json({ error: 'Error al crear costo directo' }); 
    }
  });

  app.put('/api/costs/direct/:id', authenticateToken, (req, res) => {
    const { product_id, type, description, amount, quantity, unit_cost, invoice_number, purchase_date } = req.body;
    try {
      const cost = get(`SELECT dc.* FROM direct_costs dc JOIN products p ON dc.product_id = p.id WHERE dc.id = ? AND p.user_id = ?`, [req.params.id, req.user.id]);
      if (!cost) return res.status(404).json({ error: 'Costo no encontrado' });
      run(
        `UPDATE direct_costs SET product_id = ?, type = ?, description = ?, amount = ?, quantity = ?, unit_cost = ?, invoice_number = ?, purchase_date = ? WHERE id = ?`,
        [product_id, type, description, amount, quantity || 1, unit_cost || amount, invoice_number, purchase_date, req.params.id]
      );
      if (parseFloat(cost.amount) !== parseFloat(amount)) {
        run(
          `INSERT INTO cost_history (cost_type, cost_id, product_id, user_id, old_amount, new_amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['direct', req.params.id, product_id, req.user.id, cost.amount, amount, description]
        );
      }
      const updated = get('SELECT * FROM direct_costs WHERE id = ?', [req.params.id]);
      audit(req.user.id, 'direct_costs', req.params.id, 'UPDATE', cost, updated);
      res.json(updated);
    } catch (error) { res.status(500).json({ error: 'Error al actualizar costo directo' }); }
  });

  app.delete('/api/costs/direct/:id', authenticateToken, (req, res) => {
    try {
      const cost = get(`SELECT dc.* FROM direct_costs dc JOIN products p ON dc.product_id = p.id WHERE dc.id = ? AND p.user_id = ?`, [req.params.id, req.user.id]);
      if (!cost) return res.status(404).json({ error: 'Costo no encontrado' });
      run('DELETE FROM direct_costs WHERE id = ?', [req.params.id]);
      audit(req.user.id, 'direct_costs', req.params.id, 'DELETE', cost, null);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar costo directo' }); }
  });

  app.get('/api/costs/indirect', authenticateToken, (req, res) => {
    try {
      const { productId } = req.query;
      let sql = `SELECT ic.*, p.name as product_name FROM indirect_costs ic LEFT JOIN products p ON ic.product_id = p.id WHERE p.user_id = ? OR ic.product_id IS NULL`;
      const params = [req.user.id];
      if (productId) { sql += ' AND ic.product_id = ?'; params.push(productId); }
      sql += ' ORDER BY ic.created_at DESC';
      res.json(all(sql, params));
    } catch (error) { res.status(500).json({ error: 'Error al obtener costos indirectos' }); }
  });

  app.post('/api/costs/indirect', authenticateToken, (req, res) => {
    const { product_id, type, description, amount, proportion } = req.body;
    try {
      const params = [
        product_id ? parseInt(product_id) : null,
        String(type || ''),
        String(description || ''),
        parseFloat(amount) || 0,
        parseFloat(proportion) || 100
      ];
      const { lastInsertRowid } = run(
        `INSERT INTO indirect_costs (product_id, type, description, amount, proportion) VALUES (?, ?, ?, ?, ?)`,
        params
      );
      const cost = get('SELECT * FROM indirect_costs WHERE id = ?', [lastInsertRowid]);
      if (!cost) {
        throw new Error('Costo no encontrado después de insertar');
      }
      audit(req.user.id, 'indirect_costs', cost.id, 'CREATE', null, cost);
      res.status(201).json(cost);
    } catch (error) { 
      console.error('Error creating indirect cost:', error);
      res.status(500).json({ error: 'Error al crear costo indirecto' }); 
    }
  });

  app.put('/api/costs/indirect/:id', authenticateToken, (req, res) => {
    const { product_id, type, description, amount, proportion } = req.body;
    try {
      const cost = get('SELECT * FROM indirect_costs WHERE id = ?', [req.params.id]);
      if (!cost) {
        return res.status(404).json({ error: 'Costo no encontrado' });
      }
      run(
        `UPDATE indirect_costs SET product_id = ?, type = ?, description = ?, amount = ?, proportion = ? WHERE id = ?`,
        [product_id || null, type, description, amount, proportion || 100, req.params.id]
      );
      if (parseFloat(cost.amount) !== parseFloat(amount)) {
        run(
          `INSERT INTO cost_history (cost_type, cost_id, product_id, user_id, old_amount, new_amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['indirect', req.params.id, product_id || null, req.user.id, cost.amount, amount, description]
        );
      }
      const updated = get('SELECT * FROM indirect_costs WHERE id = ?', [req.params.id]);
      audit(req.user.id, 'indirect_costs', req.params.id, 'UPDATE', cost, updated);
      res.json(updated);
    } catch (error) { 
      console.error('Error updating indirect cost:', error);
      res.status(500).json({ error: 'Error al actualizar costo indirecto' }); 
    }
  });

  app.delete('/api/costs/indirect/:id', authenticateToken, (req, res) => {
    try {
      const cost = get('SELECT * FROM indirect_costs WHERE id = ?', [req.params.id]);
      if (!cost) return res.status(404).json({ error: 'Costo no encontrado' });
      run('DELETE FROM indirect_costs WHERE id = ?', [req.params.id]);
      audit(req.user.id, 'indirect_costs', req.params.id, 'DELETE', cost, null);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar costo indirecto' }); }
  });
}