import { get, all } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

function dateRange(req, prefix = '') {
  const { start, end } = req.query;
  const col = prefix ? `${prefix}.created_at` : 'created_at';
  const where = [];
  const params = [];
  if (start) { where.push(`${col} >= ?`); params.push(`${start} 00:00:00`); }
  if (end) { where.push(`${col} <= ?`); params.push(`${end} 23:59:59`); }
  return { where: where.join(' AND '), params };
}

function buildPeriods(req, fallbackMonths = 6) {
  const { start, end } = req.query;
  const months = [];
  if (start && end) {
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cursor <= endDate) {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      months.push({
        start: first.toISOString().split('T')[0],
        end: last.toISOString().split('T')[0],
        label: cursor.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const now = new Date();
    for (let i = fallbackMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.toISOString().split('T')[0];
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
      months.push({
        start,
        end,
        label: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
      });
    }
  }
  return months;
}

export function reportRoutes(app) {
  app.get('/api/reports/summary', authenticateToken, async (req, res) => {
    try {
      const productCount = (await get('SELECT COUNT(*) as count FROM products'))?.count || 0;

      const directTotal = (await get(`
        SELECT COALESCE(SUM(dc.amount * COALESCE(dc.quantity, 1)), 0) as total
        FROM direct_costs dc
        JOIN products p ON dc.product_id = p.id
      `))?.total || 0;

      const indirectTotal = (await get(`
        SELECT COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
        FROM indirect_costs ic
      `))?.total || 0;

      const products = await all(`
        SELECT p.id, p.name, p.selling_price,
          COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as direct_costs,
          COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as indirect_costs
        FROM products p
      `);

      let profitableProducts = 0;
      products.forEach(p => {
        const cost = parseFloat(p.direct_costs) + parseFloat(p.indirect_costs);
        if (parseFloat(p.selling_price) > cost && parseFloat(p.selling_price) > 0) profitableProducts++;
      });

      res.json({
        totalProducts: productCount,
        totalDirectCosts: parseFloat(directTotal),
        totalIndirectCosts: parseFloat(indirectTotal),
        totalCosts: parseFloat(directTotal) + parseFloat(indirectTotal),
        profitableProducts
      });
    } catch (error) { res.status(500).json({ error: 'Error al obtener resumen' }); }
  });

  app.get('/api/reports/distribution', authenticateToken, async (req, res) => {
    try {
      const { where, params } = dateRange(req);
      let sql = `SELECT c.name as category_name, p.name as product_name, p.id as product_id,
        COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as direct_cost,
        COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as indirect_cost
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id`;
      if (where) sql += ` WHERE ${where}`;
      const rows = await all(sql, params);
      res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Error al obtener distribución' }); }
  });

  app.get('/api/reports/rentability', authenticateToken, async (req, res) => {
    try {
      const { where, params } = dateRange(req, 'p');
      const rows = await all(`SELECT p.id, p.name, p.selling_price,
        COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as direct_cost,
        COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as indirect_cost
        FROM products p
        ${where ? `WHERE ${where}` : ''}`,
        params
      );
      const result = rows.map(r => ({
        ...r,
        total_cost: parseFloat(r.direct_cost) + parseFloat(r.indirect_cost),
        margin: parseFloat(r.selling_price) > 0 ? ((parseFloat(r.selling_price) - (parseFloat(r.direct_cost) + parseFloat(r.indirect_cost))) / parseFloat(r.selling_price)) * 100 : 0
      }));
      res.json(result);
    } catch (error) { res.status(500).json({ error: 'Error al obtener rentabilidad' }); }
  });

  app.get('/api/reports/trend', authenticateToken, async (req, res) => {
    try {
      const months = buildPeriods(req);
      const { where, params } = dateRange(req, 'dc');
      const directData = await all(`
        SELECT EXTRACT(MONTH FROM dc.created_at::timestamp) as month, EXTRACT(YEAR FROM dc.created_at::timestamp) as year, COALESCE(SUM(dc.amount * COALESCE(dc.quantity, 1)), 0) as total
        FROM direct_costs dc
        ${where ? `WHERE ${where}` : ''}
        GROUP BY EXTRACT(MONTH FROM dc.created_at::timestamp), EXTRACT(YEAR FROM dc.created_at::timestamp)`,
        params
      );
      const indirectData = await all(`
        SELECT EXTRACT(MONTH FROM ic.created_at::timestamp) as month, EXTRACT(YEAR FROM ic.created_at::timestamp) as year, COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
        FROM indirect_costs ic
        ${where ? `WHERE ${where}` : ''}
        GROUP BY EXTRACT(MONTH FROM ic.created_at::timestamp), EXTRACT(YEAR FROM ic.created_at::timestamp)`,
        params
      );
      res.json({ months, directData, indirectData });
    } catch (error) { res.status(500).json({ error: 'Error al obtener tendencia' }); }
  });

  app.get('/api/reports/costs-per-product', authenticateToken, async (req, res) => {
    try {
      const rows = await all(`SELECT p.id, p.name,
        COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as direct_cost,
        COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as indirect_cost
        FROM products p`);
      res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Error al obtener costos por producto' }); }
  });

  app.get('/api/audit', authenticateToken, async (req, res) => {
    try {
      const { limit = 100 } = req.query;
      const logs = await all('SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [req.user.id, parseInt(limit)]);
      res.json(logs);
    } catch (error) { res.status(500).json({ error: 'Error al obtener auditoría' }); }
  });

  app.get('/api/reports/period', authenticateToken, async (req, res) => {
    try {
      const months = buildPeriods(req);
      const directRange = dateRange(req, 'dc');
      const indirectRange = dateRange(req, 'ic');

      for (const m of months) {
        const directWhere = directRange.where ? ` AND ${directRange.where}` : '';
        const indirectWhere = indirectRange.where ? ` AND ${indirectRange.where}` : '';
        const direct = await get(`
          SELECT COALESCE(SUM(dc.amount * COALESCE(dc.quantity, 1)), 0) as total
          FROM direct_costs dc JOIN products p ON dc.product_id = p.id
          WHERE dc.created_at BETWEEN ? AND ?${directWhere}
        `, [m.start, m.end, ...directRange.params]);

        const indirect = await get(`
          SELECT COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
          FROM indirect_costs ic
          LEFT JOIN products p ON ic.product_id = p.id
          WHERE (ic.created_at BETWEEN ? AND ? OR ic.created_at IS NULL)${indirectWhere}
        `, [m.start, m.end, ...indirectRange.params]);

        m.direct = parseFloat(direct?.total) || 0;
        m.indirect = parseFloat(indirect?.total) || 0;
      }
      res.json(months);
    } catch (error) {
      console.error('Error in /api/reports/period:', error);
      res.status(500).json({ error: 'Error al obtener costos por período' });
    }
  });

  app.get('/api/reports/variations', authenticateToken, async (req, res) => {
    try {
      const months = buildPeriods(req);
      const directRange = dateRange(req, 'dc');
      const indirectRange = dateRange(req, 'ic');

      for (const m of months) {
        const directWhere = directRange.where ? ` AND ${directRange.where}` : '';
        const indirectWhere = indirectRange.where ? ` AND ${indirectRange.where}` : '';
        const direct = await get(`
          SELECT COALESCE(SUM(dc.amount * COALESCE(dc.quantity, 1)), 0) as total
          FROM direct_costs dc JOIN products p ON dc.product_id = p.id
          WHERE dc.created_at BETWEEN ? AND ?${directWhere}
        `, [m.start, m.end, ...directRange.params]);

        const indirect = await get(`
          SELECT COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
          FROM indirect_costs ic
          LEFT JOIN products p ON ic.product_id = p.id
          WHERE (ic.created_at BETWEEN ? AND ? OR ic.created_at IS NULL)${indirectWhere}
        `, [m.start, m.end, ...indirectRange.params]);

        m.direct = parseFloat(direct?.total) || 0;
        m.indirect = parseFloat(indirect?.total) || 0;
        m.total = m.direct + m.indirect;
      }

      const withVariation = months.map((m, idx) => {
        const prev = months[idx - 1];
        const pct = (current, previous) => {
          if (previous === undefined || previous === null || previous === 0) return null;
          return Math.round(((current - previous) / previous) * 10000) / 100;
        };
        return {
          ...m,
          direct_variation: pct(m.direct, prev?.direct),
          indirect_variation: pct(m.indirect, prev?.indirect),
          total_variation: pct(m.total, prev?.total)
        };
      });

      res.json(withVariation);
    } catch (error) {
      console.error('Error in /api/reports/variations:', error);
      res.status(500).json({ error: 'Error al obtener variaciones' });
    }
  });

  app.get('/api/reports/break-even', authenticateToken, async (req, res) => {
    try {
      const products = await all(`
        SELECT p.id, p.name, p.quantity, p.selling_price,
          COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as direct_costs
        FROM products p
      `);

      const fixedCostsRow = await get(`
        SELECT COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
        FROM indirect_costs ic
      `);
      const fixedCosts = parseFloat(fixedCostsRow?.total) || 0;

      const perProduct = products.map(p => {
        const totalVariableCost = parseFloat(p.direct_costs) || 0;
        const units = Math.max(parseFloat(p.quantity) || 1, 1);
        const variableCost = totalVariableCost / units;
        const price = parseFloat(p.selling_price) || 0;
        const contribution = price - variableCost;
        const ratio = price > 0 ? contribution / price : 0;
        return {
          id: p.id,
          name: p.name,
          quantity: units,
          variable_cost: Math.round(variableCost * 100) / 100,
          selling_price: price,
          contribution: Math.round(contribution * 100) / 100,
          contribution_ratio: Math.round(ratio * 10000) / 100,
          break_even_units: contribution > 0 ? Math.ceil(fixedCosts / contribution) : null
        };
      });

      const weightedRatio = perProduct.length > 0
        ? perProduct.reduce((s, p) => s + p.contribution_ratio * p.quantity, 0) / perProduct.reduce((s, p) => s + p.quantity, 0)
        : 0;

      res.json({
        fixed_costs: fixedCosts,
        break_even_revenue: weightedRatio > 0 ? Math.round(fixedCosts / weightedRatio * 100) / 100 : null,
        contribution_ratio: Math.round(weightedRatio * 10000) / 100,
        products: perProduct
      });
    } catch (error) {
      console.error('Error in /api/reports/break-even:', error);
      res.status(500).json({ error: 'Error al obtener punto de equilibrio' });
    }
  });
}
