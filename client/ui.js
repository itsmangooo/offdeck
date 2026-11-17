export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

export function button(label, action, { primary = false, disabled = false } = {}) {
  return `<button type="button" class="${primary ? 'primary' : ''}" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`
}
