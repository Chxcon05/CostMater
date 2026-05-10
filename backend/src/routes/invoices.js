import express from 'express';
import db from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

function generateInvoiceNumber(userId) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const count = db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE user_id = ?').get(userId).cnt + 1;
  return `FAC-${year}${month}-${String(count).padStart(4, '0')}`;
}

router.get('/', authenticateToken, (req, res) => {
  try {
    const { status, customer_id } = req.query;
    let query = `
      SELECT i.*, c.name as customer_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.user_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND i.status = ?';
      params.push(status);
    }
    if (customer_id) {
      query += ' AND i.customer_id = ?';
      params.push(customer_id);
    }

    query += ' ORDER BY i.created_at DESC';
    const invoices = db.prepare(query).all(...params);
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, c.name as customer_name, c.email as customer_email, c.rfc as customer_rfc, c.address as customer_address
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.id = ? AND i.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const items = db.prepare(`
      SELECT ii.*, p.name as product_name
      FROM invoice_items ii
      LEFT JOIN products p ON ii.product_id = p.id
      WHERE ii.invoice_id = ?
    `).all(req.params.id);

    res.json({ ...invoice, items });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener factura' });
  }
});

router.post('/', authenticateToken, (req, res) => {
  const { quote_id, customer_id, items, tax_percent, payment_method, due_date, notes } = req.body;

  try {
    const invoice_number = generateInvoiceNumber(req.user.id);
    const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_price)), 0);
    const taxAmount = subtotal * (tax_percent || 16) / 100;
    const total = subtotal + taxAmount;

    const result = db.prepare(`
      INSERT INTO invoices (user_id, quote_id, customer_id, invoice_number, subtotal, tax_percent, tax_amount, total, payment_method, due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, quote_id || null, customer_id || null, invoice_number, subtotal, tax_percent || 16, taxAmount, total, payment_method || 'efectivo', due_date || null, notes || '');

    items.forEach(item => {
      const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
      db.prepare(`
        INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(result.lastInsertRowid, item.product_id || null, item.description, item.quantity, item.unit_price, itemTotal);
    });

    if (quote_id) {
      db.prepare(`UPDATE quotes SET status = 'aprobada' WHERE id = ?`).run(quote_id);
    }

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(result.lastInsertRowid);
    const invoiceItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(result.lastInsertRowid);

    res.status(201).json({ ...invoice, items: invoiceItems });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear factura' });
  }
});

router.put('/:id', authenticateToken, (req, res) => {
  const { status, payment_date } = req.body;

  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    db.prepare(`
      UPDATE invoices SET status = ?, payment_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, payment_date, req.params.id);

    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar factura' });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(req.params.id);
    db.prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar factura' });
  }
});

export default router;