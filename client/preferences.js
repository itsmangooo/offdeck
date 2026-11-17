import { nickname, NICKNAME_LIFETIME } from '../shared/protocol.js'

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
