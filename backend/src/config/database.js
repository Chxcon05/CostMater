import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR FATAL: DATABASE_URL no está definida en las variables de entorno.');
  console.error('Crea una base de datos PostgreSQL (Neon/Supabase) y agrega DATABASE_URL en .env');
  process.exit(1);
}

pg.types.setTypeParser(20, (v) => parseInt(v, 10));

const useSSL = /neon\.tech|supabase\.co|sslmode=require|ssl=true/i.test(DATABASE_URL);
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
  max: 10
});

function toPg(sql, params = []) {
  let i = 0;
  const pgSql = String(sql).replace(/\?/g, () => `$${++i}`);
  return { sql: pgSql, params };
}

async function q(sql, params = []) {
  const { sql: pgSql, params: pgParams } = toPg(sql, params);
  const result = await pool.query(pgSql, pgParams);
  return result;
}

async function get(sql, params = []) {
  const result = await q(sql, params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const result = await q(sql, params);
  return result.rows;
}

async function run(sql, params = []) {
  let querySql = String(sql);
  if (/^\s*INSERT/i.test(querySql)) {
    querySql = querySql.trim().replace(/;?\s*$/, '') + ' RETURNING id';
  }
  const result = await q(querySql, params);
  const lastInsertRowid = result.rows?.[0]?.id ?? 0;
  return { lastInsertRowid };
}

async function exec(sql, params = []) {
  return q(sql, params);
}

async function saveDb() {}

async function initDb() {
  await q('SELECT 1');

  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      company_name TEXT,
      company_rfc TEXT,
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);

  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'`);

  try {
    const adminCount = (await get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'"))?.count || 0;
    if (adminCount === 0) {
      await q("UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users)");
    }
  } catch (e) { console.error('Error promoviendo admin:', e); }

  await q(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#3b82f6',
      type TEXT CHECK(type IN ('producto', 'servicio')),
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);
  await q(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT`);
  await q(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6'`);

  await q(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      country TEXT,
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);
  await q(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city TEXT`);
  await q(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS postal_code TEXT`);
  await q(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes TEXT`);
  await q(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1`);
  await q(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TEXT`);
  await q(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country TEXT`);

  await q(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      postal_code TEXT,
      country TEXT,
      credit_limit DOUBLE PRECISION DEFAULT 0,
      payment_days INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT`);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code TEXT`);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS country TEXT`);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit DOUBLE PRECISION DEFAULT 0`);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_days INTEGER DEFAULT 0`);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT`);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TEXT`);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1`);

  await q(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT CHECK(type IN ('producto', 'servicio')),
      unit TEXT DEFAULT 'unidad',
      quantity INTEGER DEFAULT 1,
      selling_price DOUBLE PRECISION,
      wholesale_price DOUBLE PRECISION,
      min_quantity INTEGER DEFAULT 0,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      sku TEXT,
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price DOUBLE PRECISION`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS min_quantity INTEGER DEFAULT 0`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`);

  await q(`
    CREATE TABLE IF NOT EXISTS direct_costs (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT CHECK(type IN ('materia_prima', 'mano_obra', 'otro')),
      description TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      quantity DOUBLE PRECISION DEFAULT 1,
      unit_cost DOUBLE PRECISION,
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);
  await q(`ALTER TABLE direct_costs ADD COLUMN IF NOT EXISTS invoice_number TEXT`);
  await q(`ALTER TABLE direct_costs ADD COLUMN IF NOT EXISTS purchase_date TEXT`);

  await q(`
    CREATE TABLE IF NOT EXISTS indirect_costs (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT CHECK(type IN ('alquiler', 'servicios', 'depreciacion', 'otro')),
      description TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      proportion DOUBLE PRECISION DEFAULT 100,
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      quote_number TEXT,
      subtotal DOUBLE PRECISION DEFAULT 0,
      discount_percent DOUBLE PRECISION DEFAULT 0,
      discount_amount DOUBLE PRECISION DEFAULT 0,
      tax_percent DOUBLE PRECISION DEFAULT 16,
      tax_amount DOUBLE PRECISION DEFAULT 0,
      total DOUBLE PRECISION DEFAULT 0,
      status TEXT DEFAULT 'borrador',
      validity_days INTEGER DEFAULT 15,
      valid_from TEXT,
      valid_until TEXT,
      notes TEXT,
      terms TEXT,
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_number TEXT`);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS subtotal DOUBLE PRECISION DEFAULT 0`);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_percent DOUBLE PRECISION DEFAULT 0`);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION DEFAULT 0`);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tax_percent DOUBLE PRECISION DEFAULT 16`);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION DEFAULT 0`);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 15`);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_from TEXT`);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until TEXT`);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS terms TEXT`);
  await q(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`);

  await q(`
    CREATE TABLE IF NOT EXISTS quote_items (
      id SERIAL PRIMARY KEY,
      quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      description TEXT,
      quantity DOUBLE PRECISION DEFAULT 1,
      unit_price DOUBLE PRECISION DEFAULT 0,
      cost DOUBLE PRECISION DEFAULT 0,
      total DOUBLE PRECISION DEFAULT 0
    );
  `);
  await q(`ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS description TEXT`);
  await q(`ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS cost DOUBLE PRECISION DEFAULT 0`);

  await q(`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
      invoice_number TEXT,
      subtotal DOUBLE PRECISION,
      tax DOUBLE PRECISION,
      tax_percent DOUBLE PRECISION DEFAULT 16,
      tax_amount DOUBLE PRECISION,
      total DOUBLE PRECISION,
      status TEXT DEFAULT 'pendiente',
      payment_method TEXT DEFAULT 'efectivo',
      issue_date TEXT,
      due_date TEXT,
      notes TEXT,
      payment_date TEXT,
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);
  await q(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_percent DOUBLE PRECISION DEFAULT 16`);
  await q(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION`);
  await q(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'efectivo'`);
  await q(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_date TEXT`);
  await q(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`);

  await q(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      description TEXT,
      quantity DOUBLE PRECISION DEFAULT 1,
      unit_price DOUBLE PRECISION DEFAULT 0,
      total DOUBLE PRECISION DEFAULT 0
    );
  `);
  await q(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS description TEXT`);

  await q(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      action TEXT NOT NULL,
      old_values TEXT,
      new_values TEXT,
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS price_history (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      old_price DOUBLE PRECISION,
      new_price DOUBLE PRECISION NOT NULL,
      changed_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS cost_history (
      id SERIAL PRIMARY KEY,
      cost_type TEXT NOT NULL CHECK(cost_type IN ('direct', 'indirect')),
      cost_id INTEGER NOT NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      old_amount DOUBLE PRECISION,
      new_amount DOUBLE PRECISION NOT NULL,
      description TEXT,
      changed_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT,
      link TEXT,
      read INTEGER DEFAULT 0,
      source TEXT DEFAULT 'system',
      created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);
  await q(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'system'`);
}

export { initDb, run, get, all, exec, saveDb };
export default pool;
