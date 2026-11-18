import { nickname, NICKNAME_LIFETIME } from '../shared/protocol.js'

const AGE_CONFIRMATION_KEY = 'offdeck.adult.v1'
const TUTORIAL_KEY = 'offdeck.tutorial.v1'

export function readTutorialProgress(storage) {
  try {
    const progress = storage.getItem(TUTORIAL_KEY)
    return ['completed', 'dismissed'].includes(progress) ? progress : null
  } catch {
    return null
  }
}

export function saveTutorialProgress(storage, progress) {
  try {
    storage.setItem(TUTORIAL_KEY, progress)
  } catch {}
}

export function readAgeConfirmation(storage) {
  try {
    return storage.getItem(AGE_CONFIRMATION_KEY) === 'confirmed'
  } catch {
    return false
  }
}

export function saveAgeConfirmation(storage) {
  try {
    storage.setItem(AGE_CONFIRMATION_KEY, 'confirmed')
  } catch {}
}

export function readNickname(storage, now = Date.now()) {
  try {
    const data = JSON.parse(storage.getItem('offdeck.nickname'))
    return data?.expires > now ? nickname(data.name) : null
  } catch {
    return null
  }
}

export function saveNickname(storage, name, now = Date.now()) {
  const normalized = nickname(name)
  if (!normalized) return null
  try {
    storage.setItem('offdeck.nickname', JSON.stringify({ name: normalized, expires: now + NICKNAME_LIFETIME }))
  } catch {
    // The nickname remains usable for this visit when storage is unavailable.
  }
  return normalized
}

const level = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ?
  Math.min(100, Math.max(0, Math.round(value))) : fallback

export function readSettings(storage, reduced = false) {
  let data
  try {
    data = JSON.parse(storage.getItem('offdeck.settings'))
  } catch {}
  return {
    master: level(data?.master,75),
    effects: level(data?.effects,70),
    muted: data?.muted === true,
    hints: data?.hints !== false,
    quality: ['Low','Medium','High'].includes(data?.quality) ? data.quality : 'Medium',
    sensitivity: level(data?.sensitivity,65),
    reduced: typeof data?.reduced === 'boolean' ? data.reduced : reduced
  }
}

export function saveSettings(storage, settings) {
  try {
    storage.setItem('offdeck.settings', JSON.stringify(settings))
  } catch {}
}
