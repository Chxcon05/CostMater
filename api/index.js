import app from '../backend/src/app.js';
import { initDb } from '../backend/src/config/database.js';

await initDb();

export default app;
