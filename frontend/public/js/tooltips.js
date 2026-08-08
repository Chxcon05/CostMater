window.CostMaster = window.CostMaster || {};

CostMaster.Tooltips = {
  dict: {
    es: {
      'iva': 'Impuesto al Valor Agregado. En México es generalmente 16% sobre el precio de venta.',
      'margen': 'Porcentaje de ganancia sobre el precio de venta. Margen saludable: >20%.',
      'proporcion': 'Porcentaje del costo indirecto que se asigna a un producto específico.',
      'costo_directo': 'Costo que se puede asignar directamente a un producto (materia prima, mano de obra).',
      'costo_indirecto': 'Costo compartido entre varios productos (alquiler, servicios, depreciación).',
      'sku': 'Stock Keeping Unit. Código único para identificar cada producto en inventario.',
      'punto_equilibrio': 'Cantidad mínima de ventas para cubrir todos los costos (ingreso = costo total).',
      'descuento': 'Reducción aplicada al precio total. Se calcula como porcentaje del subtotal.',
      'unit_cost': 'Costo promedio por unidad producida. Se calcula: costo total / cantidad.',
      'selling_price': 'Precio al que vendes el producto o servicio al cliente final.',
      'profitability': 'Capacidad de un producto para generar ganancias. Se mide por el margen de utilidad.',
      'price_history': 'Registro de todos los cambios de precio de un producto a lo largo del tiempo.',
      'cost_forecast': 'Proyección de costos futuros basada en tendencias históricas.',
      'scenario': 'Simulación qué-pasaría-si modificando variables como precio, costo o volumen.',
      'wholesale_price': 'Precio para compras al mayoreo. Generalmente menor que el precio de venta regular.',
      'credit_limit': 'Monto máximo de crédito que un cliente puede tener pendiente de pago.',
      'payment_days': 'Número de días que el cliente tiene para pagar después de la fecha de factura.',
      'validity': 'Número de días que una cotización permanece vigente desde su emisión.',
      'tax': 'Impuesto aplicado a las ventas. En México el IVA estándar es 16%.'
    },
    en: {
      'iva': 'Value Added Tax. In Mexico it is generally 16% on the sale price.',
      'margen': 'Profit percentage on the sale price. Healthy margin: >20%.',
      'proporcion': 'Percentage of indirect cost assigned to a specific product.',
      'costo_directo': 'Cost directly assignable to a product (raw materials, labor).',
      'costo_indirecto': 'Cost shared among products (rent, utilities, depreciation).',
      'sku': 'Stock Keeping Unit. Unique code to identify each product in inventory.',
      'punto_equilibrio': 'Minimum sales quantity to cover all costs (revenue = total cost).',
      'descuento': 'Reduction applied to the total price. Calculated as a percentage of the subtotal.',
      'unit_cost': 'Average cost per unit produced. Calculated: total cost / quantity.',
      'selling_price': 'Price at which you sell the product or service to the end customer.',
      'profitability': 'A product\'s ability to generate profits. Measured by profit margin.',
      'price_history': 'Record of all price changes for a product over time.',
      'cost_forecast': 'Projection of future costs based on historical trends.',
      'scenario': 'What-if simulation by modifying variables like price, cost, or volume.',
      'wholesale_price': 'Price for bulk purchases. Generally lower than regular selling price.',
      'credit_limit': 'Maximum credit amount a customer can have pending payment.',
      'payment_days': 'Number of days the customer has to pay after the invoice date.',
      'validity': 'Number of days a quote remains valid from its issue date.',
      'tax': 'Tax applied to sales. In Mexico the standard VAT is 16%.'
    }
  },

  get(key) {
    const lang = (localStorage.getItem('lang') || 'es');
    return this.dict[lang]?.[key] || this.dict['es']?.[key] || key;
  },

  create(key) {
    const tip = document.createElement('span');
    tip.className = 'tooltip-trigger';
    tip.textContent = '?';
    tip.title = this.get(key);
    return tip;
  },

  injectAll(root = document) {
    root.querySelectorAll('[data-tooltip]').forEach(el => {
      if (el.querySelector('.tooltip-trigger')) return;
      const key = el.getAttribute('data-tooltip');
      const tip = this.create(key);
      el.style.position = 'relative';
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.gap = '4px';
      el.appendChild(tip);
    });
  }
};

window.Tooltips = CostMaster.Tooltips;
