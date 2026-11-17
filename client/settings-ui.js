import { icon } from './icons.js'

function slider(label, key, value) {
  return `<label class="slider-label" for="opt-${key}"><span>${label}</span><output>${value}%</output></label>
    <input type="range" id="opt-${key}" name="${key}" min="0" max="100" value="${value}" data-unit="%">`
}

export function settingsMarkup(settings, nameField, pending) {
  return `<form data-form="settings" class="settings-form">
    ${nameField}
    <fieldset><legend>Audio</legend>
      ${slider('Master volume','master',settings.master)}
      ${slider('Sound effects volume','effects',settings.effects)}
      <label class="check"><input type="checkbox" name="muted" ${settings.muted ? 'checked' : ''}> Mute sound</label>
    </fieldset>
    <fieldset><legend>Display and camera</legend>
      <label>Graphics quality
        <select name="quality">
          ${['Low','Medium','High'].map(level => `<option ${settings.quality === level ? 'selected' : ''}>${level}</option>`).join('')}
        </select>
      </label>
      ${slider('Camera sensitivity','sensitivity',settings.sensitivity)}
      <label class="check"><input type="checkbox" name="reduced" ${settings.reduced ? 'checked' : ''}> Reduced motion</label>
    </fieldset>
    <button class="primary" ${pending ? 'disabled' : ''}>${icon('check')} Save Settings</button>
  </form>`
}
