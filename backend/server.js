import 'dotenv/config';
import { startServer } from './src/app.js';

startServer().catch(console.error);