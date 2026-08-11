import jwt from 'jsonwebtoken';
import { get } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('ERROR FATAL: JWT_SECRET no está definido en las variables de entorno.');
  console.error('Crea un archivo .env en backend/ basado en .env.example');
  process.exit(1);
}

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, JWT_SECRET, (err, user) => (err ? reject(err) : resolve(user)));
    });
    const dbUser = await get('SELECT id, name, email, role FROM users WHERE id = ?', [decoded.id]);
    if (!dbUser) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    req.user = dbUser;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Token requerido' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
    }
    next();
  };
}

export { JWT_SECRET };