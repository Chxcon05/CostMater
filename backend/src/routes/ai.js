import { get, all } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

async function getTotalCost(productId) {
  const directCosts = await all('SELECT * FROM direct_costs WHERE product_id = ?', [productId]);
  const indirectCosts = await all('SELECT * FROM indirect_costs WHERE product_id = ?', [productId]);
  const totalDirect = directCosts.reduce((s, c) => s + (parseFloat(c.amount) * parseFloat(c.quantity || 1)), 0);
  const totalIndirect = indirectCosts.reduce((s, c) => s + (parseFloat(c.amount) * parseFloat(c.proportion || 100) / 100), 0);
  return totalDirect + totalIndirect;
}

export function aiRoutes(app) {
  app.post('/api/ai/price-recommendation', authenticateToken, async (req, res) => {
    try {
      const { product_id } = req.body;
      if (!product_id) return res.status(400).json({ error: 'product_id es requerido' });

      const product = await get('SELECT * FROM products WHERE id = ?', [product_id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

      const total_cost = await getTotalCost(product_id);

      const otherProducts = await all(`
        SELECT p.*,
          COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as total_direct_costs,
          COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as total_indirect_costs
        FROM products p
        WHERE p.id != ? AND p.selling_price IS NOT NULL AND p.selling_price > 0
      `, [product_id]);

      const margins = otherProducts.map(p => {
        const tc = parseFloat(p.total_direct_costs) + parseFloat(p.total_indirect_costs);
        return tc > 0 ? (parseFloat(p.selling_price) - tc) / tc : 0;
      }).filter(m => m > 0.2);

      const avgMargin = margins.length > 0
        ? margins.reduce((s, m) => s + m, 0) / margins.length
        : 0.3;

      const currentPrice = parseFloat(product.selling_price) || 0;
      const suggestedPrice = parseFloat((total_cost * (1 + avgMargin)).toFixed(2));
      const expectedMargin = total_cost > 0 ? (suggestedPrice - total_cost) / total_cost : 0;

      res.json({
        current_price: currentPrice,
        total_cost: parseFloat(total_cost.toFixed(2)),
        suggested_price: suggestedPrice,
        expected_margin: parseFloat((expectedMargin * 100).toFixed(2)),
        reasoning: margins.length > 0
          ? `Precio sugerido basado en margen promedio (${(avgMargin * 100).toFixed(1)}%) de ${margins.length} productos rentables similares.`
          : `No se encontraron productos rentables similares. Se usó margen de referencia del 30%.`
      });
    } catch (error) {
      console.error('Error en price-recommendation:', error);
      res.status(500).json({ error: 'Error al generar recomendación de precio' });
    }
  });

  app.post('/api/ai/cost-forecast', authenticateToken, async (req, res) => {
    try {
      const { product_id, months } = req.body;
      if (!product_id) return res.status(400).json({ error: 'product_id es requerido' });

      const forecastMonths = parseInt(months) || 3;

      const product = await get('SELECT * FROM products WHERE id = ?', [product_id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

      const costHistory = await all(`
        SELECT ch.*, ch.changed_at as date
        FROM cost_history ch
        WHERE ch.product_id = ?
        ORDER BY ch.changed_at ASC
      `, [product_id]);

      const directCosts = await all('SELECT created_at FROM direct_costs WHERE product_id = ? ORDER BY created_at ASC', [product_id]);
      const indirectCosts = await all('SELECT created_at FROM indirect_costs WHERE product_id = ? ORDER BY created_at ASC', [product_id]);

      const dataPoints = [];

      for (const ch of costHistory) {
        const date = new Date(ch.changed_at);
        dataPoints.push({ date, cost: parseFloat(ch.new_amount) });
      }

      for (const dc of directCosts) {
        const date = new Date(dc.created_at);
        if (!dataPoints.some(dp => dp.date.getTime() === date.getTime())) {
          dataPoints.push({ date, cost: await getTotalCost(product_id) });
        }
      }

      for (const ic of indirectCosts) {
        const date = new Date(ic.created_at);
        if (!dataPoints.some(dp => dp.date.getTime() === date.getTime())) {
          dataPoints.push({ date, cost: await getTotalCost(product_id) });
        }
      }

      dataPoints.sort((a, b) => a.date - b.date);

      const historical = dataPoints.map(dp => ({
        month: dp.date.toLocaleString('es-MX', { month: 'short' }),
        cost: dp.cost
      }));

      const costs = dataPoints.map(dp => dp.cost);

      let forecast = [];
      if (costs.length >= 2) {
        const last3 = costs.slice(-3);
        const sma = last3.reduce((s, c) => s + c, 0) / last3.length;

        const indices = costs.map((_, i) => i);
        const n = costs.length;
        const sumX = indices.reduce((s, x) => s + x, 0);
        const sumY = costs.reduce((s, y) => s + y, 0);
        const sumXY = indices.reduce((s, x, i) => s + x * costs[i], 0);
        const sumXX = indices.reduce((s, x) => s + x * x, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumY);

        const startMonth = dataPoints.length > 0 ? new Date(dataPoints[dataPoints.length - 1].date) : new Date();
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        for (let i = 1; i <= forecastMonths; i++) {
          const nextDate = new Date(startMonth);
          nextDate.setMonth(nextDate.getMonth() + i);
          const projected = sma + slope * i;

          const confidence = i === 1 ? 'alta' : i === 2 ? 'media' : 'baja';

          forecast.push({
            month: monthNames[nextDate.getMonth()],
            cost: parseFloat(projected.toFixed(2)),
            confidence
          });
        }
      } else {
        const startMonth = new Date();
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const currentCost = await getTotalCost(product_id);

        for (let i = 1; i <= forecastMonths; i++) {
          const nextDate = new Date(startMonth);
          nextDate.setMonth(nextDate.getMonth() + i);
          forecast.push({
            month: monthNames[nextDate.getMonth()],
            cost: parseFloat(currentCost.toFixed(2)),
            confidence: 'baja'
          });
        }
      }

      res.json({ historical, forecast });
    } catch (error) {
      console.error('Error en cost-forecast:', error);
      res.status(500).json({ error: 'Error al generar pronóstico de costos' });
    }
  });

  app.post('/api/ai/scenario', authenticateToken, async (req, res) => {
    try {
      const { product_id, new_price, new_cost, volume_change } = req.body;
      if (!product_id) return res.status(400).json({ error: 'product_id es requerido' });

      const product = await get('SELECT * FROM products WHERE id = ?', [product_id]);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

      const total_cost = await getTotalCost(product_id);
      const currentPrice = parseFloat(product.selling_price) || 0;
      const currentMargin = total_cost > 0 ? ((currentPrice - total_cost) / total_cost) * 100 : 0;
      const currentProfit = currentPrice - total_cost;

      const simulatedPrice = new_price !== undefined ? parseFloat(new_price) : currentPrice;
      const simulatedCost = new_cost !== undefined ? parseFloat(new_cost) : total_cost;
      const simulatedVolumeChange = volume_change !== undefined ? parseFloat(volume_change) : 0;

      const simulatedMargin = simulatedCost > 0 ? ((simulatedPrice - simulatedCost) / simulatedCost) * 100 : 0;
      const simulatedProfit = simulatedPrice - simulatedCost;

      const priceChangePct = currentPrice > 0 ? ((simulatedPrice - currentPrice) / currentPrice) * 100 : 0;
      const profitChangePct = currentProfit !== 0 ? ((simulatedProfit - currentProfit) / currentProfit) * 100 : (simulatedProfit !== 0 ? 100 : 0);

      res.json({
        current: {
          price: parseFloat(currentPrice.toFixed(2)),
          cost: parseFloat(total_cost.toFixed(2)),
          margin: parseFloat(currentMargin.toFixed(2)),
          profit: parseFloat(currentProfit.toFixed(2))
        },
        simulated: {
          price: parseFloat(simulatedPrice.toFixed(2)),
          cost: parseFloat(simulatedCost.toFixed(2)),
          margin: parseFloat(simulatedMargin.toFixed(2)),
          profit: parseFloat(simulatedProfit.toFixed(2))
        },
        impact: {
          price_change_pct: parseFloat(priceChangePct.toFixed(2)),
          profit_change_pct: parseFloat(profitChangePct.toFixed(2))
        }
      });
    } catch (error) {
      console.error('Error en scenario:', error);
      res.status(500).json({ error: 'Error al simular escenario' });
    }
  });

  app.get('/api/ai/optimization', authenticateToken, async (req, res) => {
    try {
      const products = await all(`
        SELECT p.*,
          COALESCE((SELECT SUM(dc.amount * COALESCE(dc.quantity, 1)) FROM direct_costs dc WHERE dc.product_id = p.id), 0) as total_direct_costs,
          COALESCE((SELECT SUM(ic.amount * ic.proportion / 100) FROM indirect_costs ic WHERE ic.product_id = p.id), 0) as total_indirect_costs
        FROM products p
        ORDER BY p.created_at DESC
      `);

      const result = [];
      for (const p of products) {
        const totalCost = parseFloat(p.total_direct_costs) + parseFloat(p.total_indirect_costs);
        const sellingPrice = parseFloat(p.selling_price) || 0;
        const margin = sellingPrice > 0 && totalCost > 0
          ? ((sellingPrice - totalCost) / sellingPrice) * 100
          : 0;

        const issues = [];
        const suggestions = [];

        if (sellingPrice > 0 && margin < 10) {
          issues.push('margin_low');
          const suggestedPrice = parseFloat((totalCost * 1.25).toFixed(2));
          suggestions.push(`Considera aumentar el precio a $${suggestedPrice} para lograr un margen del 25%`);
        }

        if (!p.selling_price || parseFloat(p.selling_price) === 0) {
          issues.push('no_selling_price');
          if (totalCost > 0) {
            const suggestedPrice = parseFloat((totalCost * 1.3).toFixed(2));
            suggestions.push(`Define un precio de venta. Sugerencia: $${suggestedPrice} basado en costo + 30%`);
          } else {
            suggestions.push('Define un precio de venta para este producto');
          }
        }

        const costHistory = await all(`
          SELECT new_amount, changed_at FROM cost_history
          WHERE product_id = ?
          ORDER BY changed_at ASC
        `, [p.id]);

        if (costHistory.length >= 2) {
          const first = parseFloat(costHistory[0].new_amount);
          const last = parseFloat(costHistory[costHistory.length - 1].new_amount);
          if (last > first) {
            issues.push('costs_increasing');
            suggestions.push('Revisa proveedores alternativos o negocia mejores precios para reducir costos');
          }
        }

        result.push({
          id: p.id,
          name: p.name,
          margin: parseFloat(margin.toFixed(2)),
          issues,
          suggestions
        });
      }

      res.json({ products: result });
    } catch (error) {
      console.error('Error en optimization:', error);
      res.status(500).json({ error: 'Error al generar optimización' });
    }
  });
}
