import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/costmaster.db');
const dataDir = path.join(__dirname, '../../data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;
let dbReady = false;

async function initDb() {
  const SQL = await initSqlJs();
  let data = null;
  if (fs.existsSync(dbPath)) {
    data = fs.readFileSync(dbPath);
  }
  db = new SQL.Database(data);
  dbReady = true;
  
  // Crear tablas
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      company_name TEXT,
      company_rfc TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#3b82f6',
      type TEXT CHECK(type IN ('producto', 'servicio')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Agregar columnas si no existen (para bases de datos existentes)
  try {
    const cols = db.exec("PRAGMA table_info(categories)");
    const colNames = cols[0]?.values.map(c => c[1]) || [];
    if (!colNames.includes('description')) {
      db.run('ALTER TABLE categories ADD COLUMN description TEXT');
    }
    if (!colNames.includes('color')) {
      db.run('ALTER TABLE categories ADD COLUMN color TEXT DEFAULT \'#3b82f6\'');
    }
    saveDb();
  } catch (e) { console.error('Error altering categories:', e); }



  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT CHECK(type IN ('producto', 'servicio')),
      unit TEXT DEFAULT 'unidad',
      quantity INTEGER DEFAULT 1,
      selling_price DECIMAL(10,2),
      wholesale_price DECIMAL(10,2),
      min_quantity INTEGER DEFAULT 0,
      category_id INTEGER,
      supplier_id INTEGER,
      sku TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
    );
  `);

  try {
    const pcols = db.exec("PRAGMA table_info(products)");
    const pcolNames = pcols[0]?.values.map(c => c[1]) || [];
    if (!pcolNames.includes('wholesale_price')) {
      db.run('ALTER TABLE products ADD COLUMN wholesale_price DECIMAL(10,2)');
    }
    if (!pcolNames.includes('min_quantity')) {
      db.run('ALTER TABLE products ADD COLUMN min_quantity INTEGER DEFAULT 0');
    }
    if (!pcolNames.includes('category_id')) {
      db.run('ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL');
    }
    if (!pcolNames.includes('supplier_id')) {
      db.run('ALTER TABLE products ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL');
    }
    if (!pcolNames.includes('sku')) {
      db.run('ALTER TABLE products ADD COLUMN sku TEXT');
    }
    if (!pcolNames.includes('updated_at')) {
      db.run("ALTER TABLE products ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    }
    saveDb();
  } catch (e) { console.error('Error altering products:', e); }

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      postal_code TEXT,
      country TEXT,
      credit_limit DECIMAL(10,2) DEFAULT 0,
      payment_days INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    const ccols = db.exec("PRAGMA table_info(customers)");
    const ccolNames = ccols[0]?.values.map(c => c[1]) || [];
    if (!ccolNames.includes('city')) db.run('ALTER TABLE customers ADD COLUMN city TEXT');
    if (!ccolNames.includes('postal_code')) db.run('ALTER TABLE customers ADD COLUMN postal_code TEXT');
    if (!ccolNames.includes('country')) db.run('ALTER TABLE customers ADD COLUMN country TEXT');
    if (!ccolNames.includes('credit_limit')) db.run('ALTER TABLE customers ADD COLUMN credit_limit DECIMAL(10,2) DEFAULT 0');
    if (!ccolNames.includes('payment_days')) db.run('ALTER TABLE customers ADD COLUMN payment_days INTEGER DEFAULT 0');
    if (!ccolNames.includes('notes')) db.run('ALTER TABLE customers ADD COLUMN notes TEXT');
    if (!ccolNames.includes('updated_at')) db.run('ALTER TABLE customers ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    if (!ccolNames.includes('is_active')) db.run('ALTER TABLE customers ADD COLUMN is_active INTEGER DEFAULT 1');
    saveDb();
  } catch (e) { console.error('Error altering customers:', e); }

  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      rfc TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS direct_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      type TEXT CHECK(type IN ('materia_prima', 'mano_obra', 'otro')),
      description TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      quantity DECIMAL(10,2) DEFAULT 1,
      unit_cost DECIMAL(10,2),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  try {
    const dcols = db.exec("PRAGMA table_info(direct_costs)");
    const dcolNames = dcols[0]?.values.map(c => c[1]) || [];
    if (!dcolNames.includes('invoice_number')) {
      db.run('ALTER TABLE direct_costs ADD COLUMN invoice_number TEXT');
    }
    if (!dcolNames.includes('purchase_date')) {
      db.run('ALTER TABLE direct_costs ADD COLUMN purchase_date DATE');
    }
    saveDb();
  } catch (e) { console.error('Error altering direct_costs:', e); }

  db.run(`
    CREATE TABLE IF NOT EXISTS indirect_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      type TEXT CHECK(type IN ('alquiler', 'servicios', 'depreciacion', 'otro')),
      description TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      proportion DECIMAL(5,2) DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      customer_id INTEGER,
      product_id INTEGER,
      quantity INTEGER DEFAULT 1,
      unit_price DECIMAL(10,2),
      total DECIMAL(10,2),
      status TEXT DEFAULT 'pendiente',
      valid_until DATE,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      customer_id INTEGER,
      quote_id INTEGER,
      invoice_number TEXT,
      subtotal DECIMAL(10,2),
      tax DECIMAL(10,2),
      total DECIMAL(10,2),
      status TEXT DEFAULT 'pendiente',
      issue_date DATE,
      due_date DATE,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL
    );
  `);

  db.run(`
     CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      action TEXT NOT NULL,
      old_values TEXT,
      new_values TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  saveDb();
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

function run(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    stmt.step();
    stmt.free();
    const row = get("SELECT last_insert_rowid() as id");
    const lastInsertRowid = row?.id || 0;
    saveDb();
    return { lastInsertRowid };
  } catch (err) {
    console.error('DB run error:', err);
    throw err;
  }
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function exec(sql) {
  db.run(sql);
  saveDb();
}

export { initDb, run, get, all, exec, saveDb };
export default db;
