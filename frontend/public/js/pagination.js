window.CostMaster = window.CostMaster || {};

CostMaster.Pagination = {
  render(container, { page = 1, totalPages = 1, onPageChange }) {
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    container.innerHTML = `
      <div class="flex items-center justify-center gap-2 py-4">
        <button class="pg-btn btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>
          <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <span class="text-xs text-[var(--text-muted)] px-2">
          <span class="text-[var(--text-primary)] font-semibold">${page}</span> ${window.t ? window.t('common.of') : 'de'} <span class="text-[var(--text-primary)] font-semibold">${totalPages}</span>
        </span>
        <button class="pg-btn btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>
          <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>`;
    container.querySelectorAll('.pg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page);
        if (p >= 1 && p <= totalPages && onPageChange) onPageChange(p);
      });
    });
  },

  paginate(array, page, perPage = 10) {
    const totalPages = Math.ceil(array.length / perPage);
    const start = (page - 1) * perPage;
    return { items: array.slice(start, start + perPage), totalPages, page };
  }
};
