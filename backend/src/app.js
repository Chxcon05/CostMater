import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './config/database.js';
import { authRoutes } from './routes/auth.js';
import { productRoutes } from './routes/products.js';
import { costRoutes } from './routes/costs.js';
import { reportRoutes } from './routes/reports.js';
import { supplierRoutes, customerRoutes } from './routes/entities.js';
import { quoteRoutes, invoiceRoutes } from './routes/transactions.js';
import { categoryRoutes } from './routes/categories.js';
import { aiRoutes } from './routes/ai.js';
import { userRoutes } from './routes/users.js';
import { notificationRoutes } from './routes/notifications.js';
import { apiLimiter } from './middleware/rateLimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN;
if (CORS_ORIGIN) {
  console.log('CORS permitido para:', CORS_ORIGIN);
  app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
}
app.use(express.json());

app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CostMaster API is running', version: '2.0.0' });
});

const frontendDistPath = path.join(__dirname, '../../frontend/dist');

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
notificationRoutes(app);

app.use((err, req, res, next) => {
  console.error('Error del servidor:', err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.use(express.static(frontendDistPath));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta API no encontrada' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

export async function startServer() {
  console.log('Inicializando base de datos...');
  await initDb();
  console.log('Base de datos lista! Servidor escuchando...');

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`CostMaster API running on http://localhost:${PORT}`);
  });
}

export default app;
