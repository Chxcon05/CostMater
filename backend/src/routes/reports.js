import { get, all } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

export function reportRoutes(app) {
  app.get('/api/reports/summary', authenticateToken, (req, res) => {
    try {
      const productCount = get('SELECT COUNT(*) as count FROM products WHERE user_id = ?', [req.user.id])?.count || 0;
      
      const directTotal = get(`
        SELECT COALESCE(SUM(dc.amount * COALESCE(dc.quantity, 1)), 0) as total
        FROM direct_costs dc 
        JOIN products p ON dc.product_id = p.id 
        WHERE p.user_id = ?
      `, [req.user.id])?.total || 0;
      
      const indirectTotal = get(`
        SELECT COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
        FROM indirect_costs ic 
        LEFT JOIN products p ON ic.product_id = p.id 
        WHERE p.user_id = ? OR p.user_id IS NULL
      `, [req.user.id])?.total || 0;

      const products = all(`
        SELECT p.id, p.name, p.selling_price,
          COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as direct_costs,
          COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as indirect_costs
        FROM products p WHERE p.user_id = ?
      `, [req.user.id]);

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
      const directCosts = all(
        `SELECT type, SUM(amount * COALESCE(quantity, 1)) as total FROM direct_costs dc WHERE dc.product_id IN (SELECT id FROM products WHERE user_id = ?) GROUP BY type`,
        [req.user.id]
      ) || [];

      const indirectCosts = all(
        `SELECT type, SUM(amount * proportion / 100) as total FROM indirect_costs ic WHERE ic.product_id IN (SELECT id FROM products WHERE user_id = ?) OR ic.product_id IS NULL GROUP BY type`,
        [req.user.id]
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
      const products = all(`
        SELECT p.id, p.name, p.type, p.selling_price,
          COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as direct_costs,
          COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as indirect_costs
        FROM products p WHERE p.user_id = ?
      `, [req.user.id]);

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
      const months = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = d.toISOString().split('T')[0];
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
        const label = d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
        
        const direct = get(`
          SELECT COALESCE(SUM(dc.amount * COALESCE(dc.quantity, 1)), 0) as total
          FROM direct_costs dc JOIN products p ON dc.product_id = p.id
          WHERE p.user_id = ? AND dc.created_at BETWEEN ? AND ?
        `, [req.user.id, start, end])?.total || 0;
        
        const indirect = get(`
          SELECT COALESCE(SUM(ic.amount * ic.proportion / 100), 0) as total
          FROM indirect_costs ic
          LEFT JOIN products p ON ic.product_id = p.id
          WHERE (ic.user_id = ? OR p.user_id = ?) 
            AND (ic.created_at BETWEEN ? AND ? OR ic.created_at IS NULL)
        `, [req.user.id, req.user.id, start, end])?.total || 0;
        
        console.log(`Period ${label}: direct=${direct}, indirect=${indirect}`);
        months.push({ label, direct, indirect });
      }
      console.log('Period data:', months);
      res.json(months);
    } catch (error) { 
      console.error('Error in /api/reports/period:', error);
      res.status(500).json({ error: 'Error al obtener costos por período' }); 
    }
  });
}