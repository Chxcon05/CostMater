import { get, all, run } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { syncNotifications, broadcastNotification } from './notifications.js';

export function costRoutes(app) {
  app.get('/api/costs/direct', authenticateToken, async (req, res) => {
    try {
      const { productId } = req.query;
      let sql = `SELECT dc.*, p.name as product_name FROM direct_costs dc JOIN products p ON dc.product_id = p.id`;
      const params = [];
      if (productId) { sql += ' WHERE dc.product_id = ?'; params.push(productId); }
      sql += ' ORDER BY dc.created_at DESC';
      res.json(await all(sql, params));
    } catch (error) { res.status(500).json({ error: 'Error al obtener costos directos' }); }
  });

  app.post('/api/costs/direct', authenticateToken, requireRole('admin'), async (req, res) => {
    const { product_id, type, description, amount, quantity, unit_cost, invoice_number, purchase_date } = req.body;
    try {
      const product = await get('SELECT * FROM products WHERE id = ?', [product_id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
      const typeValue = ['materia_prima', 'mano_obra', 'otro'].includes(type) ? type : 'otro';
      const { lastInsertRowid } = await run(
        `INSERT INTO direct_costs (product_id, type, description, amount, quantity, unit_cost, invoice_number, purchase_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [product_id, typeValue, String(description || ''), amount, quantity || 1, unit_cost || amount, invoice_number || null, purchase_date || null]
      );
      const cost = await get('SELECT * FROM direct_costs WHERE id = ?', [lastInsertRowid]);
      if (!cost) return res.status(500).json({ error: 'Error al recuperar el costo creado' });
      await audit(req.user.id, 'direct_costs', cost.id, 'CREATE', null, cost);
      await syncNotifications(req.user.id);
      await broadcastNotification('success', 'Costo directo', `El usuario "${req.user.name}" registró un costo directo de $${parseFloat(cost.amount || 0).toFixed(2)} para "${product.name}".`, '/costs');
      res.status(201).json(cost);
    } catch (error) { 
      console.error('Error creating direct cost:', error);
      res.status(500).json({ error: 'Error al crear costo directo' }); 
    }
  });

  app.put('/api/costs/direct/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const { product_id, type, description, amount, quantity, unit_cost, invoice_number, purchase_date } = req.body;
    try {
      const cost = await get(`SELECT dc.* FROM direct_costs dc JOIN products p ON dc.product_id = p.id WHERE dc.id = ?`, [req.params.id]);
      if (!cost) return res.status(404).json({ error: 'Costo no encontrado' });
      const typeValue = ['materia_prima', 'mano_obra', 'otro'].includes(type) ? type : 'otro';
      await run(
        `UPDATE direct_costs SET product_id = ?, type = ?, description = ?, amount = ?, quantity = ?, unit_cost = ?, invoice_number = ?, purchase_date = ? WHERE id = ?`,
        [product_id, typeValue, String(description || ''), amount, quantity || 1, unit_cost || amount, invoice_number || null, purchase_date || null, req.params.id]
      );
      if (parseFloat(cost.amount) !== parseFloat(amount)) {
        await run(
          `INSERT INTO cost_history (cost_type, cost_id, product_id, user_id, old_amount, new_amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['direct', req.params.id, product_id, req.user.id, cost.amount, amount, description]
        );
      }
      const updated = await get('SELECT * FROM direct_costs WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'direct_costs', req.params.id, 'UPDATE', cost, updated);
      await syncNotifications(req.user.id);
      res.json(updated);
    } catch (error) { res.status(500).json({ error: 'Error al actualizar costo directo' }); }
  });

  app.delete('/api/costs/direct/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const cost = await get(`SELECT dc.* FROM direct_costs dc JOIN products p ON dc.product_id = p.id WHERE dc.id = ?`, [req.params.id]);
      if (!cost) return res.status(404).json({ error: 'Costo no encontrado' });
      await run('DELETE FROM direct_costs WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'direct_costs', req.params.id, 'DELETE', cost, null);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar costo directo' }); }
  });

  app.get('/api/costs/indirect', authenticateToken, async (req, res) => {
    try {
      const { productId } = req.query;
      let sql = `SELECT ic.*, p.name as product_name FROM indirect_costs ic LEFT JOIN products p ON ic.product_id = p.id`;
      const params = [];
      if (productId) { sql += ' WHERE ic.product_id = ?'; params.push(productId); }
      sql += ' ORDER BY ic.created_at DESC';
      res.json(await all(sql, params));
    } catch (error) { res.status(500).json({ error: 'Error al obtener costos indirectos' }); }
  });

  app.get('/api/costs/history', authenticateToken, async (req, res) => {
    try {
      const history = await all(`
        SELECT ch.*, p.name as product_name
        FROM cost_history ch
        LEFT JOIN products p ON ch.product_id = p.id
        ORDER BY ch.changed_at DESC
        LIMIT 100
      `);
      res.json(history);
    } catch (error) { res.status(500).json({ error: 'Error al obtener historial de costos' }); }
  });

  app.post('/api/costs/indirect', authenticateToken, requireRole('admin'), async (req, res) => {
    const { product_id, type, description, amount, proportion, prorate } = req.body;
    try {
      const amountValue = parseFloat(amount) || 0;
      const typeValue = ['alquiler', 'servicios', 'depreciacion', 'otro'].includes(type) ? type : 'otro';
      const descriptionValue = String(description || '');

      // Prorrateo automático: repartir un costo global entre todos los productos
      if (!product_id && prorate) {
        const products = await all('SELECT id FROM products');
        if (products.length === 0) {
          return res.status(400).json({ error: 'No hay productos para prorratear' });
        }
        const weights = [];
        for (const p of products) {
          const direct = (await get(`
            SELECT COALESCE(SUM(dc.amount * COALESCE(dc.quantity, 1)), 0) as total
            FROM direct_costs dc WHERE dc.product_id = ?
          `, [p.id]))?.total || 0;
          weights.push({ product_id: p.id, weight: parseFloat(direct) });
        }
        const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
        const allocated = [];
        for (const w of weights) {
          const share = totalWeight > 0 ? w.weight / totalWeight : 1 / weights.length;
          const allocatedProportion = Math.round(share * 10000) / 100;
          const { lastInsertRowid } = await run(
            `INSERT INTO indirect_costs (product_id, type, description, amount, proportion) VALUES (?, ?, ?, ?, ?)`,
            [w.product_id, typeValue, descriptionValue, amountValue, allocatedProportion]
          );
          allocated.push(await get('SELECT * FROM indirect_costs WHERE id = ?', [lastInsertRowid]));
        }
        for (const cost of allocated) {
          await audit(req.user.id, 'indirect_costs', cost.id, 'CREATE', null, cost);
        }
        await syncNotifications(req.user.id);
        await broadcastNotification('success', 'Costo indirecto', `El usuario "${req.user.name}" prorrateó un costo indirecto de $${amountValue.toFixed(2)} entre ${allocated.length} productos.`, '/costs');
        return res.status(201).json(allocated);
      }

      const params = [
        product_id ? parseInt(product_id) : null,
        typeValue,
        descriptionValue,
        amountValue,
        parseFloat(proportion) || 100
      ];
      const { lastInsertRowid } = await run(
        `INSERT INTO indirect_costs (product_id, type, description, amount, proportion) VALUES (?, ?, ?, ?, ?)`,
        params
      );
      const cost = await get('SELECT * FROM indirect_costs WHERE id = ?', [lastInsertRowid]);
      if (!cost) {
        throw new Error('Costo no encontrado después de insertar');
      }
      await audit(req.user.id, 'indirect_costs', cost.id, 'CREATE', null, cost);
      if (product_id) await syncNotifications(req.user.id);
      await broadcastNotification('success', 'Costo indirecto', `El usuario "${req.user.name}" registró un costo indirecto de $${amountValue.toFixed(2)}${descriptionValue ? ` (${descriptionValue})` : ''}.`, '/costs');
      res.status(201).json(cost);
    } catch (error) { 
      console.error('Error creating indirect cost:', error);
      res.status(500).json({ error: 'Error al crear costo indirecto' }); 
    }
  });

  app.put('/api/costs/indirect/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const { product_id, type, description, amount, proportion } = req.body;
    try {
      const cost = await get('SELECT * FROM indirect_costs WHERE id = ?', [req.params.id]);
      if (!cost) {
        return res.status(404).json({ error: 'Costo no encontrado' });
      }
      const typeValue = ['alquiler', 'servicios', 'depreciacion', 'otro'].includes(type) ? type : 'otro';
      await run(
        `UPDATE indirect_costs SET product_id = ?, type = ?, description = ?, amount = ?, proportion = ? WHERE id = ?`,
        [product_id || null, typeValue, String(description || ''), amount, proportion || 100, req.params.id]
      );
      if (parseFloat(cost.amount) !== parseFloat(amount)) {
        await run(
          `INSERT INTO cost_history (cost_type, cost_id, product_id, user_id, old_amount, new_amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['indirect', req.params.id, product_id || null, req.user.id, cost.amount, amount, description]
        );
      }
      const updated = await get('SELECT * FROM indirect_costs WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'indirect_costs', req.params.id, 'UPDATE', cost, updated);
      if (product_id) await syncNotifications(req.user.id);
      res.json(updated);
    } catch (error) { 
      console.error('Error updating indirect cost:', error);
      res.status(500).json({ error: 'Error al actualizar costo indirecto' }); 
    }
  });

  app.delete('/api/costs/indirect/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const cost = await get('SELECT * FROM indirect_costs WHERE id = ?', [req.params.id]);
      if (!cost) return res.status(404).json({ error: 'Costo no encontrado' });
      await run('DELETE FROM indirect_costs WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'indirect_costs', req.params.id, 'DELETE', cost, null);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar costo indirecto' }); }
  });
}