import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { get, run, all } from '../config/database.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.js';
import { audit } from '../utils/audit.js';

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role || 'user' };
}

export async function authRoutes(app) {
  app.post('/api/auth/register', registerLimiter, async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    if (typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' });
    }

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Correo electrónico inválido' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
      const existing = get('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) return res.status(400).json({ error: 'El email ya está registrado' });

      const passwordHash = await bcrypt.hash(password, 10);

      // El primer usuario del sistema obtiene el rol de administrador
      const totalUsers = get('SELECT COUNT(*) as count FROM users')?.count || 0;
      const role = totalUsers === 0 ? 'admin' : 'user';

      run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name.trim(), email.trim(), passwordHash, role]);

      const user = get('SELECT id, name, email, role FROM users WHERE email = ?', [email]);

      if (!user) {
        throw new Error('Usuario no encontrado después de crear');
      }

      audit(user.id, 'users', user.id, 'REGISTER', null, publicUser(user));

      const token = generateToken(user);

      res.status(201).json({ user: publicUser(user), token });
    } catch (error) {
      console.error('Error al crear usuario:', error);
      res.status(500).json({ error: 'Error al crear usuario' });
    }
  });

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    try {
      const user = get('SELECT * FROM users WHERE email = ?', [email]);
      if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });

      const token = generateToken(user);
      audit(user.id, 'users', user.id, 'LOGIN', null, null);
      res.json({ user: publicUser(user), token });
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      res.status(500).json({ error: 'Error al iniciar sesión' });
    }
  });

  app.post('/api/auth/logout', authenticateToken, (req, res) => {
    try {
      audit(req.user.id, 'users', req.user.id, 'LOGOUT', null, null);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Error al cerrar sesión' });
    }
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'El correo es requerido' });
    }

    try {
      const user = get('SELECT id FROM users WHERE email = ?', [email]);
      if (!user) return res.status(200).json({ message: 'Si el correo existe, recibirás un enlace de recuperación' });

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      run('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', [user.id]);
      run('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expiresAt]);

      audit(user.id, 'users', user.id, 'PASSWORD_RESET_REQUESTED', null, null);

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4321'}/reset-password?token=${token}`;

      // Sin servicio de correo configurado, se devuelve el enlace directamente
      // para entornos de desarrollo/demostración.
      res.json({
        message: 'Solicitud de recuperación registrada',
        devResetUrl: resetUrl,
        devToken: token
      });
    } catch (error) {
      console.error('Error en forgot-password:', error);
      res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token y contraseña son requeridos' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
      const reset = get('SELECT * FROM password_resets WHERE token = ? AND used = 0', [token]);
      if (!reset) return res.status(400).json({ error: 'Token inválido o ya utilizado' });

      const now = new Date().toISOString();
      if (new Date(reset.expires_at).getTime() < new Date(now).getTime()) {
        return res.status(400).json({ error: 'El token ha expirado' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [passwordHash, reset.user_id]);
      run('UPDATE password_resets SET used = 1 WHERE id = ?', [reset.id]);

      audit(reset.user_id, 'users', reset.user_id, 'PASSWORD_RESET', null, null);
      res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    } catch (error) {
      console.error('Error en reset-password:', error);
      res.status(500).json({ error: 'Error al restablecer la contraseña' });
    }
  });

  app.put('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    }

    if (typeof new_password !== 'string' || new_password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
      const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) return res.status(400).json({ error: 'La contraseña actual es incorrecta' });

      const passwordHash = await bcrypt.hash(new_password, 10);
      run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [passwordHash, req.user.id]);

      audit(req.user.id, 'users', req.user.id, 'PASSWORD_CHANGED', null, null);
      res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    } catch (error) {
      console.error('Error en change-password:', error);
      res.status(500).json({ error: 'Error al cambiar la contraseña' });
    }
  });

  app.get('/api/auth/me', authenticateToken, (req, res) => {
    try {
      const user = get('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [req.user.id]);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
      res.json({ user: publicUser(user) });
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener usuario' });
    }
  });

  app.get('/api/auth/audit', authenticateToken, (req, res) => {
    try {
      const logs = all('SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener auditoría' });
    }
  });
}
