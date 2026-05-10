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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CostMaster API is running', version: '2.0.0' });
});

const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

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

  app.use((err, req, res, next) => {
    console.error('Error del servidor:', err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`CostMaster API running on http://localhost:${PORT}`);
  });
}

export default app;