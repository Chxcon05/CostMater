import { get, all, run } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

export function productRoutes(app) {
  app.get('/api/products', authenticateToken, (req, res) => {
    try {
      const products = all(`
        SELECT p.*,
          COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as total_direct_costs,
          COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as total_indirect_costs
        FROM products p
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC
      `, [req.user.id]);

      const result = products.map(p => ({
        ...p,
        total_cost: parseFloat(p.total_direct_costs) + parseFloat(p.total_indirect_costs),
        unit_cost: parseFloat(p.total_direct_costs) + parseFloat(p.total_indirect_costs)
      }));
      res.json(result);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'Error al obtener productos' });
    }
  });

  app.get('/api/products/:id', authenticateToken, (req, res) => {
    try {
      const product = get('SELECT * FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

      const directCosts = all('SELECT * FROM direct_costs WHERE product_id = ?', [product.id]);
      const indirectCosts = all('SELECT * FROM indirect_costs WHERE product_id = ?', [product.id]);

      const totalDirectCosts = directCosts.reduce((sum, c) => sum + (parseFloat(c.amount) * parseFloat(c.quantity || 1)), 0);
      const totalIndirectCosts = indirectCosts.reduce((sum, c) => sum + (parseFloat(c.amount) * parseFloat(c.proportion || 100) / 100), 0);

      res.json({ ...product, directCosts, indirectCosts, totalDirectCosts, totalIndirectCosts, totalCost: totalDirectCosts + totalIndirectCosts });
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener producto' });
    }
  });

  app.post('/api/products', authenticateToken, (req, res) => {
    const { name, description, type, unit, quantity, selling_price, wholesale_price, min_quantity, category_id, supplier_id, sku } = req.body;
    try {
      const { lastInsertRowid } = run(
        `INSERT INTO products (user_id, name, description, type, unit, quantity, selling_price, wholesale_price, min_quantity, category_id, supplier_id, sku)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, name, description || '', type || 'producto', unit || 'unidad', quantity || 1, selling_price || 0, wholesale_price || 0, min_quantity || 0, category_id || null, supplier_id || null, sku || null]
      );

      const product = get('SELECT * FROM products WHERE id = ?', [lastInsertRowid]);
      if (!product) return res.status(500).json({ error: 'Error al recuperar el producto creado' });
      audit(req.user.id, 'products', product.id, 'CREATE', null, product);
      res.status(201).json(product);
    } catch (error) {
      console.error('POST /api/products error:', error);
      res.status(500).json({ error: 'Error al crear producto' });
    }
  });

  app.put('/api/products/:id', authenticateToken, (req, res) => {
    const { name, description, type, unit, quantity, selling_price, wholesale_price, min_quantity, category_id, supplier_id, sku } = req.body;
    try {
      const product = get('SELECT * FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

      const catId = (category_id === '' || category_id === undefined) ? null : parseInt(category_id) || null;
      const supId = (supplier_id === '' || supplier_id === undefined) ? null : parseInt(supplier_id) || null;

      run(
        `UPDATE products SET name = ?, description = ?, type = ?, unit = ?, quantity = ?, selling_price = ?, wholesale_price = ?, min_quantity = ?, category_id = ?, supplier_id = ?, sku = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [name, description || '', type || 'producto', unit || 'unidad', quantity || 1, selling_price || 0, wholesale_price || 0, min_quantity || 0, catId, supId, sku || '', req.params.id]
      );

      if (parseFloat(product.selling_price) !== parseFloat(selling_price || 0)) {
        run(
          `INSERT INTO price_history (product_id, user_id, old_price, new_price) VALUES (?, ?, ?, ?)`,
          [req.params.id, req.user.id, product.selling_price || 0, selling_price || 0]
        );
      }

      const updated = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
      audit(req.user.id, 'products', req.params.id, 'UPDATE', product, updated);
      res.json(updated);
    } catch (error) {
      console.error('PUT Error:', error);
      res.status(500).json({ error: 'Error al actualizar producto' });
    }
  });

  app.delete('/api/products/:id', authenticateToken, (req, res) => {
    try {
      const product = get('SELECT * FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
      run('DELETE FROM products WHERE id = ?', [req.params.id]);
      audit(req.user.id, 'products', req.params.id, 'DELETE', product, null);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Error al eliminar producto' });
    }
  });
}