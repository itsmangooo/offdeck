import { randomInt } from 'node:crypto'
import { approvedDecks, readCardLibrary } from './card-library.js'

export function makeDeck(lines, type) {
  if (!Array.isArray(lines) || !lines.length || lines.some(line =>
    typeof line !== 'string' || !line.trim() || line !== line.trim() || line.length > 170)) {
    throw new Error('Invalid ' + type + ' deck')
  }
  if (new Set(lines.map(line => line.toLowerCase())).size !== lines.length) {
    throw new Error('Duplicate text in ' + type + ' deck')
  }
  return lines.map((text, index) => ({ id: type + '-' + (index + 1), text }))
}

export const starterDecks = approvedDecks(readCardLibrary())

export function shuffled(cards, pick = randomInt) {
  const copy = [...cards]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = pick(i + 1)
    const card = copy[i]
    copy[i] = copy[j]
    copy[j] = card
  }
  return copy
}
