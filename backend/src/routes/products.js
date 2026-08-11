import { get, all, run } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { syncNotifications, broadcastNotification } from './notifications.js';

export function productRoutes(app) {
  app.get('/api/products', authenticateToken, async (req, res) => {
    try {
      const products = await all(`
        SELECT p.*,
          COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as total_direct_costs,
          COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as total_indirect_costs
        FROM products p
        ORDER BY p.created_at DESC
      `);

      const result = products.map(p => ({
        ...p,
        total_cost: parseFloat(p.total_direct_costs) + parseFloat(p.total_indirect_costs),
        unit_cost: (parseFloat(p.total_direct_costs) + parseFloat(p.total_indirect_costs)) / Math.max(parseFloat(p.quantity || 1), 1)
      }));
      res.json(result);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'Error al obtener productos' });
    }
  });

  app.get('/api/products/:id', authenticateToken, async (req, res) => {
    try {
      const product = await get('SELECT * FROM products WHERE id = ?', [req.params.id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

      const directCosts = await all('SELECT * FROM direct_costs WHERE product_id = ?', [product.id]);
      const indirectCosts = await all('SELECT * FROM indirect_costs WHERE product_id = ?', [product.id]);

      const totalDirectCosts = directCosts.reduce((sum, c) => sum + (parseFloat(c.amount) * parseFloat(c.quantity || 1)), 0);
      const totalIndirectCosts = indirectCosts.reduce((sum, c) => sum + (parseFloat(c.amount) * parseFloat(c.proportion || 100) / 100), 0);

      const priceHistory = await all('SELECT * FROM price_history WHERE product_id = ? ORDER BY changed_at DESC LIMIT 20', [product.id]);

      res.json({ ...product, directCosts, indirectCosts, totalDirectCosts, totalIndirectCosts, totalCost: totalDirectCosts + totalIndirectCosts, priceHistory });
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener producto' });
    }
  });

  app.get('/api/products/:id/price-history', authenticateToken, async (req, res) => {
    try {
      const product = await get('SELECT id FROM products WHERE id = ?', [req.params.id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
      const history = await all('SELECT * FROM price_history WHERE product_id = ? ORDER BY changed_at DESC LIMIT 50', [req.params.id]);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener historial de precios' });
    }
  });

  app.post('/api/products', authenticateToken, requireRole('admin'), async (req, res) => {
    const { name, description, type, unit, quantity, selling_price, wholesale_price, min_quantity, category_id, supplier_id, sku } = req.body;
    try {
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es requerido' });
      const { lastInsertRowid } = await run(
        `INSERT INTO products (user_id, name, description, type, unit, quantity, selling_price, wholesale_price, min_quantity, category_id, supplier_id, sku)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, String(name).trim(), description || '', type || 'producto', unit || 'unidad', quantity || 1, selling_price || 0, wholesale_price || 0, min_quantity || 0, category_id || null, supplier_id || null, sku || null]
      );

      const product = await get('SELECT * FROM products WHERE id = ?', [lastInsertRowid]);
      if (!product) return res.status(500).json({ error: 'Error al recuperar el producto creado' });
      await audit(req.user.id, 'products', product.id, 'CREATE', null, product);
      await syncNotifications(req.user.id);
      await broadcastNotification('success', 'Nuevo producto', `El usuario "${req.user.name}" añadió el producto "${product.name}".`, '/products');
      res.status(201).json(product);
    } catch (error) {
      console.error('POST /api/products error:', error);
      res.status(500).json({ error: 'Error al crear producto' });
    }
  });

  app.put('/api/products/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const { name, description, type, unit, quantity, selling_price, wholesale_price, min_quantity, category_id, supplier_id, sku } = req.body;
    try {
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es requerido' });
      const product = await get('SELECT * FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

      const catId = (category_id === '' || category_id === undefined) ? null : parseInt(category_id) || null;
      const supId = (supplier_id === '' || supplier_id === undefined) ? null : parseInt(supplier_id) || null;

      await run(
        `UPDATE products SET name = ?, description = ?, type = ?, unit = ?, quantity = ?, selling_price = ?, wholesale_price = ?, min_quantity = ?, category_id = ?, supplier_id = ?, sku = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [String(name).trim(), description || '', type || 'producto', unit || 'unidad', quantity || 1, selling_price || 0, wholesale_price || 0, min_quantity || 0, catId, supId, sku || '', req.params.id]
      );

      if (parseFloat(product.selling_price) !== parseFloat(selling_price || 0)) {
        await run(
          `INSERT INTO price_history (product_id, user_id, old_price, new_price) VALUES (?, ?, ?, ?)`,
          [req.params.id, req.user.id, product.selling_price || 0, selling_price || 0]
        );
      }

      const updated = await get('SELECT * FROM products WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'products', req.params.id, 'UPDATE', product, updated);
      await syncNotifications(req.user.id);
      res.json(updated);
    } catch (error) {
      console.error('PUT Error:', error);
      res.status(500).json({ error: 'Error al actualizar producto' });
    }
  });

  app.delete('/api/products/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const product = await get('SELECT * FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
      await run('DELETE FROM products WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'products', req.params.id, 'DELETE', product, null);
      await broadcastNotification('warning', 'Producto eliminado', `El usuario "${req.user.name}" eliminó el producto "${product.name}".`, '/products');
      await syncNotifications(req.user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Error al eliminar producto' });
    }
  });
}