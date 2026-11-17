import { readFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'

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

export const CARD_CATEGORIES = Object.freeze(['hookups', 'dating', 'expectations', 'dark', 'social', 'unhinged'])
const LIBRARY_COUNTS = { scenario: 250, response: 750 }

export function cardWords(text) {
  // Apostrophes should not make “its” and “it's” count as different words.
  return text.normalize('NFKC').toLowerCase().replace(/['’]/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []
}

export function validateLibrary(cards, type) {
  if (!Array.isArray(cards) || cards.length !== LIBRARY_COUNTS[type]) {
    throw new Error('Expected ' + LIBRARY_COUNTS[type] + ' ' + type + ' cards')
  }
  const ids = new Set()
  const texts = new Set()
  const categories = new Set()
  const idPattern = new RegExp('^' + type + '-[0-9]{3}$')
  for (const [index,card] of cards.entries()) {
    if (!card || typeof card !== 'object' || Object.keys(card).length !== 3 ||
        typeof card.id !== 'string' || !idPattern.test(card.id) || ids.has(card.id) ||
        !CARD_CATEGORIES.includes(card.category) || typeof card.text !== 'string') {
      throw new Error('Invalid ' + type + ' card at index ' + index)
    }
    const { id,category,text } = card
    const blanks = type === 'scenario' ? text.match(/_+/g) ?? [] : []
    if (text.length > 120 || text !== text.trim() || /[^\x20-\x7e’“”—–…éâ]/u.test(text) ||
        blanks.length > 1 || blanks.some(blank => blank !== '____')) {
      throw new Error('Invalid text for ' + id)
    }
    const signature = cardWords(text).join(' ')
    if (!signature || texts.has(signature)) throw new Error('Empty or duplicate text for ' + id)
    ids.add(id)
    texts.add(signature)
    categories.add(category)
  }
  if (categories.size !== CARD_CATEGORIES.length) throw new Error('Missing category in ' + type + ' library')
  return cards
}

function load(type) {
  const url = new URL('../decks/' + type + 's.json', import.meta.url)
  return validateLibrary(JSON.parse(readFileSync(url, 'utf8')), type)
}

export const starterDecks = { scenarios: load('scenario'), responses: load('response') }

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
