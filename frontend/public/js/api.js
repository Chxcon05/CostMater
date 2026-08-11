window.CostMaster = window.CostMaster || {};
window.CostMaster.API_URL = '/api';
window.CostMaster.isAdmin = function () {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return !!(user && user.role === 'admin');
  } catch {
    return false;
  }
};

(function () {
  const applyAdminGating = function () {
    const isAdmin = window.CostMaster.isAdmin();
    document.querySelectorAll('[data-admin-only]').forEach(el => {
      if (isAdmin) {
        el.style.removeProperty('display');
      } else {
        el.style.setProperty('display', 'none', 'important');
      }
    });
  };

  const onReady = function () {
    applyAdminGating();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
  document.addEventListener('astro:after-swap', applyAdminGating);

  const refreshUser = function () {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${window.CostMaster.API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('me failed'))))
      .then(data => {
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
          applyAdminGating();
        }
      })
      .catch(() => {});
  };
  refreshUser();
})();
