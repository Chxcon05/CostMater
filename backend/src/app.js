import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, run, get, all, exec, saveDb } from './config/database.js';
import { authRoutes } from './routes/auth.js';
import { productRoutes } from './routes/products.js';
import { costRoutes } from './routes/costs.js';
import { reportRoutes } from './routes/reports.js';
import { supplierRoutes, customerRoutes } from './routes/entities.js';
import { quoteRoutes, invoiceRoutes } from './routes/transactions.js';
import { categoryRoutes } from './routes/categories.js';
import { aiRoutes } from './routes/ai.js';
import { userRoutes } from './routes/users.js';
import { apiLimiter } from './middleware/rateLimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN;
if (!CORS_ORIGIN) {
  console.error('ERROR FATAL: CORS_ORIGIN no está definido en las variables de entorno.');
  console.error('Crea un archivo .env en backend/ basado en .env.example');
  process.exit(1);
}

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CostMaster API is running', version: '2.0.0' });
});

const frontendDistPath = path.join(__dirname, '../../frontend/dist');

export async function startServer() {
  console.log('Inicializando base de datos...');
  await initDb();
  console.log('Base de datos lista! Registrando rutas...');
  
  authRoutes(app);
  productRoutes(app);
  costRoutes(app);
  reportRoutes(app);
  supplierRoutes(app);
  customerRoutes(app);
  quoteRoutes(app);
  invoiceRoutes(app);
  categoryRoutes(app);
  aiRoutes(app);
  userRoutes(app);

  app.use('/api', apiLimiter);

  app.use((err, req, res, next) => {
    console.error('Error del servidor:', err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  app.use(express.static(frontendDistPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`CostMaster API running on http://localhost:${PORT}`);
  });
}

export default app;