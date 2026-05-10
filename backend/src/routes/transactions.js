import { get, all, run } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

function generateQuoteNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const result = get('SELECT COUNT(*) as cnt FROM quotes');
  const count = (result?.cnt || 0) + 1;
  return `COT-${year}${month}-${String(count).padStart(4, '0')}`;
}

function generateInvoiceNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const result = get('SELECT COUNT(*) as cnt FROM invoices');
  const count = (result?.cnt || 0) + 1;
  return `FAC-${year}${month}-${String(count).padStart(4, '0')}`;
}

export function quoteRoutes(app) {
  app.get('/api/quotes', authenticateToken, (req, res) => {
    try {
      const quotes = all(`SELECT q.*, c.name as customer_name FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id WHERE q.user_id = ? ORDER BY q.created_at DESC`, [req.user.id]);
      res.json(quotes);
    } catch (error) { res.status(500).json({ error: 'Error al obtener cotizaciones' }); }
  });

  app.get('/api/quotes/:id', authenticateToken, (req, res) => {
    try {
      const quote = get(`SELECT q.*, c.name as customer_name FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = ? AND q.user_id = ?`, [req.params.id, req.user.id]);
      if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' });
      const items = all('SELECT * FROM quote_items WHERE quote_id = ?', [req.params.id]);
      res.json({ ...quote, items });
    } catch (error) { res.status(500).json({ error: 'Error al obtener cotización' }); }
  });

  app.post('/api/quotes', authenticateToken, (req, res) => {
    const { customer_id, items, discount_percent, tax_percent, validity_days, notes, terms, valid_from } = req.body;
    try {
      const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_price)), 0);
      const discountAmount = subtotal * (discount_percent || 0) / 100;
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = taxableAmount * (tax_percent || 16) / 100;
      const total = taxableAmount + taxAmount;

      const quote_number = generateQuoteNumber();
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + (validity_days || 15));

      const { lastInsertRowid } = run(
        `INSERT INTO quotes (user_id, customer_id, quote_number, subtotal, discount_percent, discount_amount, tax_percent, tax_amount, total, validity_days, notes, terms, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, customer_id || null, quote_number, subtotal, discount_percent || 0, discountAmount, tax_percent || 16, taxAmount, total, validity_days || 15, notes || '', terms || '', valid_from || new Date().toISOString().split('T')[0], validUntil.toISOString().split('T')[0]]
      );

      const quoteId = lastInsertRowid;

      if (items && items.length > 0) {
        items.forEach(item => {
          const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
          run(
            'INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, cost, total) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [quoteId, item.product_id || null, item.description, item.quantity, item.unit_price, item.cost || 0, itemTotal]
          );
        });
      }

      res.status(201).json({ ...get('SELECT * FROM quotes WHERE id = ?', [quoteId]), items: all('SELECT * FROM quote_items WHERE quote_id = ?', [quoteId]) });
    } catch (error) { res.status(500).json({ error: 'Error al crear cotización' }); }
  });

  app.put('/api/quotes/:id', authenticateToken, (req, res) => {
    const { status, notes, terms } = req.body;
    try {
      run('UPDATE quotes SET status = ?, notes = ?, terms = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, notes, terms, req.params.id]);
      res.json(get('SELECT * FROM quotes WHERE id = ?', [req.params.id]));
    } catch (error) { res.status(500).json({ error: 'Error al actualizar cotización' }); }
  });

  app.delete('/api/quotes/:id', authenticateToken, (req, res) => {
    try {
      run('DELETE FROM quote_items WHERE quote_id = ?', [req.params.id]);
      run('DELETE FROM quotes WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar cotización' }); }
  });
}

export function invoiceRoutes(app) {
  app.get('/api/invoices', authenticateToken, (req, res) => {
    try {
      const invoices = all(`SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.user_id = ? ORDER BY i.created_at DESC`, [req.user.id]);
      res.json(invoices);
    } catch (error) { res.status(500).json({ error: 'Error al obtener facturas' }); }
  });

  app.get('/api/invoices/:id', authenticateToken, (req, res) => {
    try {
      const invoice = get(`SELECT i.*, c.name as customer_name, c.rfc as customer_rfc FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ? AND i.user_id = ?`, [req.params.id, req.user.id]);
      if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
      const items = all('SELECT * FROM invoice_items WHERE invoice_id = ?', [req.params.id]);
      res.json({ ...invoice, items });
    } catch (error) { res.status(500).json({ error: 'Error al obtener factura' }); }
  });

  app.post('/api/invoices', authenticateToken, (req, res) => {
    const { customer_id, items, tax_percent, payment_method, due_date, notes } = req.body;
    try {
      const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_price)), 0);
      const taxAmount = subtotal * (tax_percent || 16) / 100;
      const total = subtotal + taxAmount;
      const invoice_number = generateInvoiceNumber();

      const { lastInsertRowid } = run(
        `INSERT INTO invoices (user_id, customer_id, invoice_number, subtotal, tax_percent, tax_amount, total, payment_method, due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, customer_id || null, invoice_number, subtotal, tax_percent || 16, taxAmount, total, payment_method || 'efectivo', due_date, notes || '']
      );

      const invoiceId = lastInsertRowid;

      if (items && items.length > 0) {
        items.forEach(item => {
          const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
          run(
            'INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)',
            [invoiceId, item.product_id || null, item.description, item.quantity, item.unit_price, itemTotal]
          );
        });
      }

      res.status(201).json({ ...get('SELECT * FROM invoices WHERE id = ?', [invoiceId]), items: all('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoiceId]) });
    } catch (error) { res.status(500).json({ error: 'Error al crear factura' }); }
  });

  app.put('/api/invoices/:id', authenticateToken, (req, res) => {
    const { status, payment_date } = req.body;
    try {
      run('UPDATE invoices SET status = ?, payment_date = ? WHERE id = ?', [status, payment_date, req.params.id]);
      res.json(get('SELECT * FROM invoices WHERE id = ?', [req.params.id]));
    } catch (error) { res.status(500).json({ error: 'Error al actualizar factura' }); }
  });

  app.delete('/api/invoices/:id', authenticateToken, (req, res) => {
    try {
      run('DELETE FROM invoice_items WHERE invoice_id = ?', [req.params.id]);
      run('DELETE FROM invoices WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar factura' }); }
  });
}