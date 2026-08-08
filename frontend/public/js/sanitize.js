window.CostMaster = window.CostMaster || {};
window.CostMaster.sanitize = {
  escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }
};
