export const HAND_SIZE = 5
export const ROOM_ID = /^[a-f0-9]{36}$/
export const NICKNAME_LIFETIME = 365 * 24 * 60 * 60 * 1000
export const DEFAULT_CONFIG = Object.freeze({ capacity: 8, selectSeconds: 45, voteSeconds: 30 })

export function nickname(value) {
  if (typeof value !== 'string') return null
  const name = value.normalize('NFC').trim()
  return name.length && [...name].length <= 24 && !/[\p{C}\p{Zl}\p{Zp}]/u.test(name) ? name : null
}

export const errors = {
  BAD_LINK: 'That invitation link is invalid.',
  ROOM_GONE: 'This room has expired or could not be found.',
  FULL: 'This room is full.',
  BAD_NAME: 'Enter a nickname between 1 and 24 characters.',
  BAD_CONFIG: 'Check the capacity and timer settings.',
  BAD_SESSION: 'Your saved seat is no longer available. Join the room again.',
  REPLACED: 'Your seat is open in another tab.',
  NO_ROOM: 'Join a room first.',
  IN_ROOM: 'Leave your current room first.',
  SLOW_DOWN: 'Too many actions. Try again in a moment.',
  UNAVAILABLE: 'The server is unavailable. Try again.',
  ROOM_LIMIT: 'The server is at capacity. Try again later.',
  FORBIDDEN: 'Only the host can do that.',
  NEED_PLAYERS: 'At least three connected players are needed.',
  BAD_PHASE: 'That action is unavailable in this phase.',
  BAD_CARD: 'That card is no longer available.',
  NOT_ELIGIBLE: 'You are not eligible for that action.',
  ALREADY_SUBMITTED: 'Your response is already locked in.',
  ALREADY_VOTED: 'Your vote is already locked in.',
  OWN_CARD: 'Choose another player’s response.'
}
