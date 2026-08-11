import { get, all, run } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

export function userRoutes(app) {
  app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const users = await all('SELECT id, name, email, role, company_name, created_at FROM users ORDER BY created_at DESC');
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener usuarios' });
    }
  });

  app.put('/api/users/:id/role', authenticateToken, requireRole('admin'), async (req, res) => {
    const { role } = req.body;
    try {
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Rol inválido' });
      }
      const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

      if (req.params.id === String(req.user.id) && role !== 'admin') {
        return res.status(400).json({ error: 'No puedes quitar tu propio rol de administrador' });
      }

      await run('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [role, req.params.id]);
      const updated = await get('SELECT id, name, email, role FROM users WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'users', updated.id, 'ROLE_CHANGED', { role: user.role }, { role: updated.role });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Error al actualizar el rol' });
    }
  });

  app.delete('/api/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      if (req.params.id === String(req.user.id)) {
        return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
      }
      const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

      if (user.role === 'admin') {
        const adminCount = (await get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'"))?.count || 0;
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'No puedes eliminar el último administrador' });
        }
      }

      await run('DELETE FROM users WHERE id = ?', [req.params.id]);
      await audit(req.user.id, 'users', user.id, 'DELETE', user, null);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Error al eliminar el usuario' });
    }
  });
}
