import { get, all, run } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

export function notificationRoutes(app) {
  app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
      const { limit = 20 } = req.query;
      const items = await all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?', [req.user.id, parseInt(limit)]);
      const unread = (await get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0', [req.user.id]))?.count || 0;
      res.json({ items, unread });
    } catch (error) {
      console.error('Error al obtener notificaciones:', error);
      res.status(500).json({ error: 'Error al obtener notificaciones' });
    }
  });

  app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
      await run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Error al marcar notificación' });
    }
  });

  app.post('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
      await run('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', [req.user.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Error al marcar notificaciones' });
    }
  });

  app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
    try {
      await run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Error al eliminar notificación' });
    }
  });
}

export async function createNotification(userId, type, title, message, link = null) {
  try {
    await run('INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)', [userId, type, title, message, link]);
  } catch (error) {
    console.error('Error al crear notificación:', error);
  }
}

export async function broadcastNotification(type, title, message, link = null) {
  try {
    const users = await all('SELECT id FROM users');
    for (const u of users) {
      await run('INSERT INTO notifications (user_id, type, title, message, link, source) VALUES (?, ?, ?, ?, ?, ?)',
        [u.id, type, title, message, link, 'event']);
    }
  } catch (error) {
    console.error('Error al crear notificación global:', error);
  }
}

export async function syncNotifications(userId) {
  try {
    const products = await all(`
      SELECT p.id, p.name, p.quantity, p.min_quantity, p.selling_price,
        COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as total_direct_costs,
        COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as total_indirect_costs
      FROM products p
      WHERE p.user_id = ?
    `, [userId]);

    await run('DELETE FROM notifications WHERE user_id = ? AND source = \'system\'', [userId]);

    for (const p of products) {
      const cost = parseFloat(p.total_direct_costs) + parseFloat(p.total_indirect_costs);
      const price = parseFloat(p.selling_price || 0);
      if (!price) {
        await run('INSERT INTO notifications (user_id, type, title, message, link, source) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'info', 'Producto sin precio', `El producto "${p.name}" no tiene precio de venta definido.`, '/products', 'system']);
      } else if (cost > 0) {
        const margin = ((price - cost) / price) * 100;
        if (margin < 10) {
          await run('INSERT INTO notifications (user_id, type, title, message, link, source) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'warning', 'Margen bajo', `El producto "${p.name}" tiene un margen de ${margin.toFixed(1)}% (debajo del 10%).`, '/reports', 'system']);
        }
      }
      if (parseFloat(p.min_quantity || 0) > 0 && parseFloat(p.quantity || 0) <= parseFloat(p.min_quantity)) {
        await run('INSERT INTO notifications (user_id, type, title, message, link, source) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'warning', 'Stock bajo', `El producto "${p.name}" tiene ${p.quantity} unidades (mínimo ${p.min_quantity}).`, '/products', 'system']);
      }
    }
  } catch (error) {
    console.error('Error al sincronizar notificaciones:', error);
  }
}
