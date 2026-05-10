import bcrypt from 'bcryptjs';
import { get, run } from '../config/database.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';

export async function authRoutes(app) {
  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    try {
      const existing = get('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) return res.status(400).json({ error: 'El email ya está registrado' });

      const passwordHash = await bcrypt.hash(password, 10);
      
      run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, passwordHash]);
      
      const user = get('SELECT id, name, email FROM users WHERE email = ?', [email]);
      
      if (!user) {
        throw new Error('Usuario no encontrado después de crear');
      }
      
      const token = generateToken(user);

      res.status(201).json({ user, token });
    } catch (error) {
      console.error('Error al crear usuario:', error);
      res.status(500).json({ error: 'Error al crear usuario: ' + error.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
      const user = get('SELECT * FROM users WHERE email = ?', [email]);
      if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });

      const token = generateToken(user);
      res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      res.status(500).json({ error: 'Error al iniciar sesión' });
    }
  });

  app.get('/api/auth/me', authenticateToken, (req, res) => {
    try {
      const user = get('SELECT id, name, email, created_at FROM users WHERE id = ?', [req.user.id]);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener usuario' });
    }
  });
}