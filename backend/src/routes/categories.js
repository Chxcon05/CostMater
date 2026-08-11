import { get, all, run } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { broadcastNotification } from './notifications.js';

export function categoryRoutes(app) {
  app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
      const categories = await all(`
        SELECT c.*, COUNT(p.id) as product_count
        FROM categories c
        LEFT JOIN products p ON c.id = p.category_id
        GROUP BY c.id
        ORDER BY c.name
      `);
      res.json(categories);
    } catch (error) { res.status(500).json({ error: 'Error al obtener categorías' }); }
  });

  app.post('/api/categories', authenticateToken, requireRole('admin'), async (req, res) => {
    const { name, description, color } = req.body;
    try {
      const result = await run('INSERT INTO categories (user_id, name, description, color) VALUES (?, ?, ?, ?)', [req.user.id, name, description || '', color || '#3b82f6']);
      const cat = await get('SELECT * FROM categories WHERE id = ?', [result.lastInsertRowid]);
      await audit(req.user.id, 'categories', cat.id, 'CREATE', null, cat);
      await broadcastNotification('success', 'Nueva categoría', `El usuario "${req.user.name}" añadió la categoría "${cat.name}".`, '/products');
      res.status(201).json(cat);
    } catch (error) { console.error('POST /api/categories error:', error); res.status(500).json({ error: 'Error al crear categoría' }); }
  });

  app.put('/api/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const { name, description, color } = req.body;
    try {
      const old = await get('SELECT * FROM categories WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!old) return res.status(404).json({ error: 'Categoría no encontrada' });
      await run('UPDATE categories SET name = ?, description = ?, color = ? WHERE id = ? AND user_id = ?', [name || old.name, description !== undefined ? description : old.description, color || old.color, req.params.id, req.user.id]);
      const updated = await get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'categories', req.params.id, 'UPDATE', old, updated);
      res.json(updated);
    } catch (error) { console.error('PUT /api/categories/:id error:', error); res.status(500).json({ error: 'Error al actualizar categoría' }); }
  });

  app.delete('/api/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const cat = await get('SELECT * FROM categories WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      await run('DELETE FROM categories WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      await audit(req.user.id, 'categories', req.params.id, 'DELETE', cat, null);
      await broadcastNotification('warning', 'Categoría eliminada', `El usuario "${req.user.name}" eliminó la categoría "${cat.name}".`, '/products');
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar categoría' }); }
  });
}
