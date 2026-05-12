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
      db.run("ALTER TABLE products ADD COLUMN updated_at DATETIME");
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
    if (!ccolNames.includes('updated_at')) db.run('ALTER TABLE customers ADD COLUMN updated_at DATETIME');
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
      country TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    const scols = db.exec("PRAGMA table_info(suppliers)");
    const scolNames = scols[0]?.values.map(c => c[1]) || [];
    if (!scolNames.includes('city')) db.run('ALTER TABLE suppliers ADD COLUMN city TEXT');
    if (!scolNames.includes('postal_code')) db.run('ALTER TABLE suppliers ADD COLUMN postal_code TEXT');
    if (!scolNames.includes('notes')) db.run('ALTER TABLE suppliers ADD COLUMN notes TEXT');
    if (!scolNames.includes('is_active')) db.run('ALTER TABLE suppliers ADD COLUMN is_active INTEGER DEFAULT 1');
    if (!scolNames.includes('updated_at')) db.run('ALTER TABLE suppliers ADD COLUMN updated_at DATETIME');
    if (!scolNames.includes('country')) db.run('ALTER TABLE suppliers ADD COLUMN country TEXT');
    saveDb();
  } catch (e) { console.error('Error altering suppliers:', e); }

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
      quote_number TEXT,
      subtotal DECIMAL(10,2) DEFAULT 0,
      discount_percent DECIMAL(5,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      tax_percent DECIMAL(5,2) DEFAULT 16,
      tax_amount DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) DEFAULT 0,
      status TEXT DEFAULT 'borrador',
      validity_days INTEGER DEFAULT 15,
      valid_from DATE,
      valid_until DATE,
      notes TEXT,
      terms TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );
  `);

  try {
    const qcols = db.exec("PRAGMA table_info(quotes)");
    const qcolNames = qcols[0]?.values.map(c => c[1]) || [];
    if (!qcolNames.includes('quote_number')) db.run('ALTER TABLE quotes ADD COLUMN quote_number TEXT');
    if (!qcolNames.includes('subtotal')) db.run('ALTER TABLE quotes ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0');
    if (!qcolNames.includes('discount_percent')) db.run('ALTER TABLE quotes ADD COLUMN discount_percent DECIMAL(5,2) DEFAULT 0');
    if (!qcolNames.includes('discount_amount')) db.run('ALTER TABLE quotes ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0');
    if (!qcolNames.includes('tax_percent')) db.run('ALTER TABLE quotes ADD COLUMN tax_percent DECIMAL(5,2) DEFAULT 16');
    if (!qcolNames.includes('tax_amount')) db.run('ALTER TABLE quotes ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0');
    if (!qcolNames.includes('validity_days')) db.run('ALTER TABLE quotes ADD COLUMN validity_days INTEGER DEFAULT 15');
    if (!qcolNames.includes('valid_from')) db.run('ALTER TABLE quotes ADD COLUMN valid_from DATE');
    if (!qcolNames.includes('valid_until')) db.run('ALTER TABLE quotes ADD COLUMN valid_until DATE');
    if (!qcolNames.includes('terms')) db.run('ALTER TABLE quotes ADD COLUMN terms TEXT');
    if (!qcolNames.includes('updated_at')) db.run('ALTER TABLE quotes ADD COLUMN updated_at DATETIME');
    saveDb();
  } catch (e) { console.error('Error altering quotes:', e); }

  db.run(`
    CREATE TABLE IF NOT EXISTS quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL,
      product_id INTEGER,
      description TEXT,
      quantity DECIMAL(10,2) DEFAULT 1,
      unit_price DECIMAL(10,2) DEFAULT 0,
      cost DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) DEFAULT 0,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );
  `);

  try {
    const qicols = db.exec("PRAGMA table_info(quote_items)");
    const qicolNames = qicols[0]?.values.map(c => c[1]) || [];
    if (!qicolNames.includes('description')) db.run('ALTER TABLE quote_items ADD COLUMN description TEXT');
    if (!qicolNames.includes('cost')) db.run('ALTER TABLE quote_items ADD COLUMN cost DECIMAL(10,2) DEFAULT 0');
    saveDb();
  } catch (e) { console.error('Error altering quote_items:', e); }

  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      customer_id INTEGER,
      quote_id INTEGER,
      invoice_number TEXT,
      subtotal DECIMAL(10,2),
      tax DECIMAL(10,2),
      tax_percent DECIMAL(5,2) DEFAULT 16,
      tax_amount DECIMAL(10,2),
      total DECIMAL(10,2),
      status TEXT DEFAULT 'pendiente',
      payment_method TEXT DEFAULT 'efectivo',
      issue_date DATE,
      due_date DATE,
      notes TEXT,
      payment_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL
    );
  `);

  try {
    const icols = db.exec("PRAGMA table_info(invoices)");
    const icolNames = icols[0]?.values.map(c => c[1]) || [];
    if (!icolNames.includes('tax_percent')) db.run('ALTER TABLE invoices ADD COLUMN tax_percent DECIMAL(5,2) DEFAULT 16');
    if (!icolNames.includes('tax_amount')) db.run('ALTER TABLE invoices ADD COLUMN tax_amount DECIMAL(10,2)');
    if (!icolNames.includes('payment_method')) db.run('ALTER TABLE invoices ADD COLUMN payment_method TEXT DEFAULT \'efectivo\'');
    if (!icolNames.includes('payment_date')) db.run('ALTER TABLE invoices ADD COLUMN payment_date DATE');
    if (!icolNames.includes('updated_at')) db.run('ALTER TABLE invoices ADD COLUMN updated_at DATETIME');
    saveDb();
  } catch (e) { console.error('Error altering invoices:', e); }

  db.run(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER,
      description TEXT,
      quantity DECIMAL(10,2) DEFAULT 1,
      unit_price DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );
  `);

  try {
    const iicols = db.exec("PRAGMA table_info(invoice_items)");
    const iicolNames = iicols[0]?.values.map(c => c[1]) || [];
    if (!iicolNames.includes('description')) db.run('ALTER TABLE invoice_items ADD COLUMN description TEXT');
    saveDb();
  } catch (e) { console.error('Error altering invoice_items:', e); }

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
