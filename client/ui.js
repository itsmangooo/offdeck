import { icon } from './icons.js'

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

export function button(label, action, { primary = false, disabled = false, glyph = '', className = '' } = {}) {
  return `<button type="button" class="${primary ? 'primary ' : ''}${className}" data-action="${action}" ${disabled ? 'disabled' : ''}>${icon(glyph)}${label}</button>`
}
