import express from 'express';
import { body, validationResult } from 'express-validator';
import db from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

function generateQuoteNumber(userId) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const count = db.prepare('SELECT COUNT(*) as cnt FROM quotes WHERE user_id = ?').get(userId).cnt + 1;
  return `COT-${year}${month}-${String(count).padStart(4, '0')}`;
}

router.get('/', authenticateToken, (req, res) => {
  try {
    const { status, customer_id } = req.query;
    let query = `
      SELECT q.*, c.name as customer_name
      FROM quotes q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.user_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND q.status = ?';
      params.push(status);
    }
    if (customer_id) {
      query += ' AND q.customer_id = ?';
      params.push(customer_id);
    }

    query += ' ORDER BY q.created_at DESC';
    const quotes = db.prepare(query).all(...params);
    res.json(quotes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cotizaciones' });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const quote = db.prepare(`
      SELECT q.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      FROM quotes q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = ? AND q.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!quote) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    const items = db.prepare(`
      SELECT qi.*, p.name as product_name
      FROM quote_items qi
      LEFT JOIN products p ON qi.product_id = p.id
      WHERE qi.quote_id = ?
    `).all(req.params.id);

    res.json({ ...quote, items });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cotización' });
  }
});

router.post('/', authenticateToken, (req, res) => {
  const { customer_id, items, discount_percent, tax_percent, validity_days, notes, terms, valid_from } = req.body;

  try {
    const quote_number = generateQuoteNumber(req.user.id);
    const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_price)), 0);
    const discountAmount = subtotal * (discount_percent || 0) / 100;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = taxableAmount * (tax_percent || 16) / 100;
    const total = taxableAmount + taxAmount;

    const validUntil = valid_from ? new Date(valid_from) : new Date();
    validUntil.setDate(validUntil.getDate() + (validity_days || 15));

    const result = db.prepare(`
      INSERT INTO quotes (user_id, customer_id, quote_number, subtotal, discount_percent, discount_amount, tax_percent, tax_amount, total, validity_days, notes, terms, valid_from, valid_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, customer_id || null, quote_number, subtotal, discount_percent || 0, discountAmount, tax_percent || 16, taxAmount, total, validity_days || 15, notes || '', terms || '', valid_from || new Date().toISOString().split('T')[0], validUntil.toISOString().split('T')[0]);

    items.forEach(item => {
      const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
      db.prepare(`
        INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, cost, total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(result.lastInsertRowid, item.product_id || null, item.description, item.quantity, item.unit_price, item.cost || 0, itemTotal);
    });

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(result.lastInsertRowid);
    const quoteItems = db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(result.lastInsertRowid);

    res.status(201).json({ ...quote, items: quoteItems });
  } catch (error) {
    console.error('Error al crear cotización:', error);
    res.status(500).json({ error: 'Error al crear cotización: ' + error.message });
  }
});

router.put('/:id', authenticateToken, (req, res) => {
  const { customer_id, status, items, discount_percent, tax_percent, validity_days, notes, terms } = req.body;

  try {
    const quote = db.prepare('SELECT * FROM quotes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!quote) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    if (items) {
      db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(req.params.id);
      const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_price)), 0);
      const discountAmount = subtotal * (discount_percent || 0) / 100;
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = taxableAmount * (tax_percent || 16) / 100;
      const total = taxableAmount + taxAmount;

      db.prepare(`
        UPDATE quotes SET 
          customer_id = ?, status = ?, subtotal = ?, discount_percent = ?, discount_amount = ?,
          tax_percent = ?, tax_amount = ?, total = ?, validity_days = ?, notes = ?, terms = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(customer_id, status, subtotal, discount_percent || 0, discountAmount, tax_percent || 16, taxAmount, total, validity_days || 15, notes || '', terms || '', req.params.id);

      items.forEach(item => {
        const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
        db.prepare(`
          INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, cost, total)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(req.params.id, item.product_id || null, item.description, item.quantity, item.unit_price, item.cost || 0, itemTotal);
      });
    } else {
      db.prepare(`
        UPDATE quotes SET customer_id = ?, status = ?, notes = ?, terms = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        customer_id ?? quote.customer_id,
        status ?? quote.status,
        notes ?? quote.notes,
        terms ?? quote.terms,
        req.params.id
      );
    }

    const updated = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
    const updatedItems = db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(req.params.id);

    res.json({ ...updated, items: updatedItems });
  } catch (error) {
    console.error('Error al actualizar cotización:', error);
    res.status(500).json({ error: 'Error al actualizar cotización: ' + error.message });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(req.params.id);
    db.prepare('DELETE FROM quotes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar cotización' });
  }
});

export default router;