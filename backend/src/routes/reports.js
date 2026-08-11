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
  app.get('/api/reports/summary', authenticateToken, (req, res) => {
    try {
      const productCount = get('SELECT COUNT(*) as count FROM products')?.count || 0;
      
      const directTotal = get(`
        SELECT COALESCE(SUM(dc.amount * COALESCE(dc.quantity, 1)), 0) as total
        FROM direct_costs dc 
        JOIN products p ON dc.product_id = p.id 
      `)?.total || 0;
      
      const indirectTotal = get(`
        SELECT COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
        FROM indirect_costs ic 
      `)?.total || 0;

      const products = all(`
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

  app.get('/api/reports/distribution', authenticateToken, (req, res) => {
    try {
      const { where, params } = dateRange(req);
      const directWhere = where ? `WHERE ${where}` : '';
      const directCosts = all(
        `SELECT type, SUM(amount * COALESCE(quantity, 1)) as total FROM direct_costs dc ${directWhere} GROUP BY type`,
        params
      ) || [];

      const indirectCosts = all(
        `SELECT type, SUM(amount * proportion / 100) as total FROM indirect_costs ic ${directWhere} GROUP BY type`,
        params
      ) || [];

      const totalDirect = directCosts.reduce((s, c) => s + parseFloat(c.total || 0), 0);
      const totalIndirect = indirectCosts.reduce((s, c) => s + parseFloat(c.total || 0), 0);
      const grandTotal = totalDirect + totalIndirect;

      res.json({
        direct: { items: directCosts, total: totalDirect, percentage: grandTotal > 0 ? Math.round(totalDirect / grandTotal * 100) : 0 },
        indirect: { items: indirectCosts, total: totalIndirect, percentage: grandTotal > 0 ? Math.round(totalIndirect / grandTotal * 100) : 0 },
        grandTotal
      });
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener distribución' });
    }
  });

  app.get('/api/reports/rentability', authenticateToken, (req, res) => {
    try {
      const dcRange = dateRange(req, 'dc');
      const icRange = dateRange(req, 'ic');
      const dcWhere = dcRange.where ? ` AND ${dcRange.where}` : '';
      const icWhere = icRange.where ? ` AND ${icRange.where}` : '';
      const products = all(`
        SELECT p.id, p.name, p.type, p.selling_price,
          COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id${dcWhere}), 0) as direct_costs,
          COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id${icWhere}), 0) as indirect_costs
        FROM products p
      `, [...dcRange.params, ...icRange.params]);

      const ranked = products.map(p => {
        const totalCost = parseFloat(p.direct_costs) + parseFloat(p.indirect_costs);
        const profit = parseFloat(p.selling_price || 0) - totalCost;
        const margin = parseFloat(p.selling_price || 0) > 0 ? (profit / parseFloat(p.selling_price) * 100) : 0;
        return { ...p, total_cost: totalCost, profit, margin: Math.round(margin * 100) / 100 };
      }).sort((a, b) => b.profit - a.profit);

      res.json(ranked);
    } catch (error) { res.status(500).json({ error: 'Error al obtener rentabilidad' }); }
  });

  app.get('/api/audit', authenticateToken, (req, res) => {
    try {
      const { limit = 100 } = req.query;
      const logs = all(`SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`, [req.user.id, parseInt(limit)]);
      res.json(logs);
    } catch (error) { res.status(500).json({ error: 'Error al obtener auditoría' }); }
  });

  app.get('/api/reports/period', authenticateToken, (req, res) => {
    try {
      const months = buildPeriods(req);
      const directRange = dateRange(req, 'dc');
      const indirectRange = dateRange(req, 'ic');

      months.forEach(m => {
        const directWhere = directRange.where ? ` AND ${directRange.where}` : '';
        const indirectWhere = indirectRange.where ? ` AND ${indirectRange.where}` : '';
        const direct = get(`
          SELECT COALESCE(SUM(dc.amount * COALESCE(dc.quantity, 1)), 0) as total
          FROM direct_costs dc JOIN products p ON dc.product_id = p.id
          WHERE dc.created_at BETWEEN ? AND ?${directWhere}
        `, [m.start, m.end, ...directRange.params])?.total || 0;
        
        const indirect = get(`
          SELECT COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
          FROM indirect_costs ic
          LEFT JOIN products p ON ic.product_id = p.id
          WHERE (ic.created_at BETWEEN ? AND ? OR ic.created_at IS NULL)${indirectWhere}
        `, [m.start, m.end, ...indirectRange.params])?.total || 0;
        
        m.direct = direct;
        m.indirect = indirect;
      });
      res.json(months);
    } catch (error) { 
      console.error('Error in /api/reports/period:', error);
      res.status(500).json({ error: 'Error al obtener costos por período' }); 
    }
  });

  app.get('/api/reports/variations', authenticateToken, (req, res) => {
    try {
      const months = buildPeriods(req);
      const directRange = dateRange(req, 'dc');
      const indirectRange = dateRange(req, 'ic');

      months.forEach(m => {
        const directWhere = directRange.where ? ` AND ${directRange.where}` : '';
        const indirectWhere = indirectRange.where ? ` AND ${indirectRange.where}` : '';
        m.direct = parseFloat(get(`
          SELECT COALESCE(SUM(dc.amount * COALESCE(dc.quantity, 1)), 0) as total
          FROM direct_costs dc JOIN products p ON dc.product_id = p.id
          WHERE dc.created_at BETWEEN ? AND ?${directWhere}
        `, [m.start, m.end, ...directRange.params])?.total || 0);

        m.indirect = parseFloat(get(`
          SELECT COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
          FROM indirect_costs ic
          LEFT JOIN products p ON ic.product_id = p.id
          WHERE (ic.created_at BETWEEN ? AND ? OR ic.created_at IS NULL)${indirectWhere}
        `, [m.start, m.end, ...indirectRange.params])?.total || 0);

        m.total = m.direct + m.indirect;
      });

      const withVariation = months.map((m, idx) => {
        const prev = months[idx - 1];
        const pct = (current, previous) => {
          if (!previous || previous === 0) return null;
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

  app.get('/api/reports/break-even', authenticateToken, (req, res) => {
    try {
      const products = all(`
        SELECT p.id, p.name, p.quantity, p.selling_price,
          COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as direct_costs
        FROM products p
      `);

      const fixedCosts = parseFloat(get(`
        SELECT COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
        FROM indirect_costs ic
      `)?.total || 0);

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