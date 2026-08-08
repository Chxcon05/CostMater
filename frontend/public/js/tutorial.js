window.CostMaster = window.CostMaster || {};

CostMaster.Tutorial = {
  steps: [
    { selector: '#sidebar', page: null, title: { es: 'Panel de Navegación', en: 'Navigation Panel' }, text: { es: 'Desde aquí accedes a todas las secciones del sistema.', en: 'Access all sections of the system from here.' } },
    { selector: null, page: '/products', title: { es: 'Productos', en: 'Products' }, text: { es: 'Registra y gestiona todos tus productos y servicios.', en: 'Register and manage all your products and services.' } },
    { selector: null, page: '/costs', title: { es: 'Costos', en: 'Costs' }, text: { es: 'Controla los costos directos e indirectos de cada producto.', en: 'Control direct and indirect costs for each product.' } },
    { selector: null, page: '/customers', title: { es: 'Clientes', en: 'Customers' }, text: { es: 'Gestiona tu cartera de clientes.', en: 'Manage your customer portfolio.' } },
    { selector: null, page: '/suppliers', title: { es: 'Proveedores', en: 'Suppliers' }, text: { es: 'Administra tus proveedores y fuentes de suministro.', en: 'Manage your suppliers and sources of supply.' } },
    { selector: null, page: '/invoices', title: { es: 'Facturas', en: 'Invoices' }, text: { es: 'Crea y administra facturas de venta para tus clientes.', en: 'Create and manage sales invoices for your customers.' } },
    { selector: null, page: '/quotes', title: { es: 'Cotizaciones', en: 'Quotes' }, text: { es: 'Genera cotizaciones para tus clientes potenciales.', en: 'Generate quotes for your potential customers.' } },
    { selector: null, page: '/ai', title: { es: 'Análisis IA', en: 'AI Analysis' }, text: { es: 'Obtén recomendaciones inteligentes de precios y proyecciones de costos.', en: 'Get smart pricing recommendations and cost forecasts.' } },
    { selector: null, page: '/reports', title: { es: 'Reportes', en: 'Reports' }, text: { es: 'Analiza la rentabilidad y toma decisiones informadas.', en: 'Analyze profitability and make informed decisions.' } }
  ],

  currentStep: 0,
  overlay: null,

  start(step) {
    this.currentStep = step || 0;
    this.createOverlay();
    this.showStep();
  },

  createOverlay() {
    if (this.overlay) this.overlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.innerHTML = `
      <div class="tutorial-spotlight" id="tutorial-spotlight"></div>
      <div class="tutorial-tooltip" id="tutorial-tooltip">
        <div class="tutorial-tooltip-header">
          <span id="tutorial-step-title"></span>
          <span class="tutorial-step-counter" id="tutorial-counter"></span>
        </div>
        <p id="tutorial-step-text"></p>
        <div class="tutorial-tooltip-actions">
          <button class="btn-secondary rounded-lg text-xs px-3 py-1.5" id="tutorial-skip">${window.t ? window.t('common.close') : 'Cerrar'}</button>
          <button class="btn-primary rounded-lg text-xs px-3 py-1.5" id="tutorial-next">${window.t ? window.t('common.next') : 'Siguiente'}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    this.overlay = overlay;

    overlay.querySelector('#tutorial-skip').addEventListener('click', () => this.complete());
    overlay.querySelector('#tutorial-next').addEventListener('click', () => this.next());
  },

  next() {
    this.currentStep++;
    if (this.currentStep >= this.steps.length) {
      this.complete();
      return;
    }
    const step = this.steps[this.currentStep];
    if (step.page && !window.location.pathname.startsWith(step.page)) {
      localStorage.setItem('tutorial_step', String(this.currentStep));
      window.location.href = step.page;
      return;
    }
    this.showStep();
  },

  showStep() {
    const step = this.steps[this.currentStep];
    const lang = localStorage.getItem('lang') || 'es';

    document.getElementById('tutorial-step-title').textContent = step.title[lang];
    document.getElementById('tutorial-step-text').textContent = step.text[lang];
    document.getElementById('tutorial-counter').textContent = `${this.currentStep + 1}/${this.steps.length}`;

    const spotlight = document.getElementById('tutorial-spotlight');
    const tooltip = document.getElementById('tutorial-tooltip');

    if (step.selector) {
      const el = document.querySelector(step.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        spotlight.style.display = 'block';
        spotlight.style.top = (rect.top - 8) + 'px';
        spotlight.style.left = (rect.left - 8) + 'px';
        spotlight.style.width = (rect.width + 16) + 'px';
        spotlight.style.height = (rect.height + 16) + 'px';
        tooltip.style.top = Math.min(rect.bottom + 16, window.innerHeight - 180) + 'px';
        tooltip.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 340)) + 'px';
        tooltip.style.transform = 'none';
        return;
      }
    }

    spotlight.style.display = 'none';
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
  },

  complete() {
    localStorage.removeItem('tutorial_step');
    if (this.overlay) this.overlay.remove();
    this.overlay = null;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const savedStep = localStorage.getItem('tutorial_step');
  if (savedStep !== null) {
    CostMaster.Tutorial.start(parseInt(savedStep));
  }
});

window.Tutorial = CostMaster.Tutorial;
