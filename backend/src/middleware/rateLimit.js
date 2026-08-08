import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../../data/ratelimit.json');

let store = {};

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      store = JSON.parse(data);
    }
  } catch {
    store = {};
  }
}

function saveStore() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch {}
}

function cleanup(now) {
  for (const key of Object.keys(store)) {
    store[key] = store[key].filter(ts => ts > now);
    if (store[key].length === 0) delete store[key];
  }
}

export function rateLimit({ windowMs = 60000, max = 100, keyPrefix = '' } = {}) {
  loadStore();

  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    cleanup(windowStart);

    if (!store[key]) store[key] = [];
    store[key] = store[key].filter(ts => ts > windowStart);

    if (store[key].length >= max) {
      const retryAfter = Math.ceil((store[key][0] + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' });
    }

    store[key].push(now);
    saveStore();
    next();
  };
}

export const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'login' });
export const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3, keyPrefix: 'register' });
export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, keyPrefix: 'api' });
