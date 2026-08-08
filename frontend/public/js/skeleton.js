window.CostMaster = window.CostMaster || {};

CostMaster.Skeleton = {
  rows(count = 5) {
    return Array.from({ length: count }, () => `
      <div class="flex items-center gap-4 p-4 border-b border-[var(--border-color)]">
        <div class="skeleton-line w-1/4 h-4"></div>
        <div class="skeleton-line w-1/6 h-4 hidden sm:block"></div>
        <div class="skeleton-line w-1/5 h-4"></div>
        <div class="skeleton-line w-1/6 h-4"></div>
        <div class="skeleton-line w-1/8 h-4"></div>
      </div>`).join('');
  },

  table(container, cols = 5, rows = 5) {
    container.innerHTML = `
      <table class="w-full">
        <thead><tr>${Array.from({ length: cols }, () => `<th class="table-cell"><div class="skeleton-line h-3 w-16"></div></th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: rows }, () => `<tr>${Array.from({ length: cols }, () => `<td class="table-cell"><div class="skeleton-line h-4 w-full"></div></td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
  },

  cards(count = 4) {
    return Array.from({ length: count }, () => `
      <div class="kpi-card">
        <div class="skeleton-line w-1/3 h-3 mb-3"></div>
        <div class="skeleton-line w-1/2 h-7 mb-2"></div>
        <div class="skeleton-line w-2/3 h-3"></div>
      </div>`).join('');
  },

  chart(height = 'h-60') {
    return `<div class="${height} flex items-center justify-center"><div class="skeleton-line w-3/4 h-4"></div></div>`;
  },

  show(container, type = 'table', options = {}) {
    if (type === 'table') this.table(container, options.cols || 5, options.rows || 5);
    else if (type === 'cards') container.innerHTML = this.cards(options.count || 4);
    else if (type === 'chart') container.innerHTML = this.chart(options.height);
    else if (type === 'rows') container.innerHTML = this.rows(options.count || 5);
  }
};
