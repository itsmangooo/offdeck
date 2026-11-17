import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_CONFIG, DEFAULT_MATCH_SCENARIOS, HAND_SIZE } from '../shared/protocol.js'

export const CARD_DIRECTORY = fileURLToPath(new URL('../decks/', import.meta.url))
export const CARD_FILES = Object.freeze({ scenario: 'scenarios.json', response: 'responses.json' })
export const CARD_CATEGORIES = Object.freeze(['hookups', 'dating', 'expectations', 'dark', 'social', 'unhinged'])
export const CARD_STATUSES = Object.freeze(['draft', 'approved', 'disabled'])
export const CARD_TEXT_LIMIT = 120
export const RESPONSE_FORMS = Object.freeze(['person', 'object', 'action', 'quote', 'admission', 'outcome'])

const CARD_TYPES = Object.keys(CARD_FILES)
const CARD_FIELDS = new Set(['id', 'type', 'category', 'text', 'status', 'tags', 'compatibility'])

export class CardLibraryError extends Error {}

export function cardWords(text) {
  return text.normalize('NFKC').toLowerCase().replace(/['’]/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []
}

function validCompatibility(metadata, type) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      Object.keys(metadata).length !== 1) return false
  if (type === 'response') return RESPONSE_FORMS.includes(metadata.form)
  const { accepts } = metadata
  return Array.isArray(accepts) && accepts.length > 0 && new Set(accepts).size === accepts.length &&
    accepts.every(form => RESPONSE_FORMS.includes(form))
}

function validateCard(card, type, index) {
  if (!card || typeof card !== 'object' || Array.isArray(card) ||
      Object.keys(card).some(field => !CARD_FIELDS.has(field))) {
    throw new CardLibraryError('Invalid record in ' + CARD_FILES[type] + ' at position ' + (index + 1))
  }
  const { id, text, category, status, tags, compatibility } = card
  const idPattern = new RegExp('^' + type + '-(?:[0-9]{3,6}|[a-f0-9]{12})$')
  if (typeof id !== 'string' || !idPattern.test(id)) throw new CardLibraryError('Invalid ' + type + ' ID')
  if (card.type !== type) throw new CardLibraryError(id + ' has the wrong card type')
  if (!CARD_CATEGORIES.includes(category)) throw new CardLibraryError(id + ' has an unknown category')
  if (!CARD_STATUSES.includes(status)) throw new CardLibraryError(id + ' has an unknown status')
  if (tags !== undefined && (!Array.isArray(tags) || tags.length > 8 || new Set(tags).size !== tags.length ||
      tags.some(tag => typeof tag !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(tag)))) {
    throw new CardLibraryError(id + ' needs up to eight distinct lowercase tags')
  }
  if (compatibility !== undefined && !validCompatibility(compatibility, type)) {
    throw new CardLibraryError(id + ' has invalid compatibility metadata')
  }
  if (typeof text !== 'string' || text.length > CARD_TEXT_LIMIT || text !== text.trim() ||
      text !== text.normalize('NFC') || /[^\x20-\x7e’‘“”—–…\p{Script=Latin}]/u.test(text)) {
    throw new CardLibraryError(id + ' needs single-line text within ' + CARD_TEXT_LIMIT + ' characters')
  }
  if (type === 'scenario') {
    const blanks = text.match(/_+/g) ?? []
    if (blanks.length > 1 || blanks.some(blank => blank !== '____')) {
      throw new CardLibraryError(id + ' can have one blank written as ____')
    }
  }
  const signature = cardWords(text).join(' ')
  if (!signature) throw new CardLibraryError(id + ' needs text containing words or numbers')
  return signature
}

export function validateLibrary(library) {
  if (!library || typeof library !== 'object' || Object.keys(library).length !== 2) {
    throw new CardLibraryError('The library needs scenario and response collections')
  }
  const ids = new Set()
  const texts = new Map()
  for (const type of CARD_TYPES) {
    const cards = library[type]
    if (!Array.isArray(cards)) throw new CardLibraryError(CARD_FILES[type] + ' must contain a JSON array')
    for (const [index, card] of cards.entries()) {
      const signature = validateCard(card, type, index)
      if (ids.has(card.id)) throw new CardLibraryError('Duplicate ID ' + card.id)
      if (texts.has(signature)) throw new CardLibraryError(card.id + ' duplicates ' + texts.get(signature))
      ids.add(card.id)
      texts.set(signature, card.id)
    }
  }
  return library
}

export function parseLibrary(sources) {
  const library = {}
  for (const type of CARD_TYPES) {
    try {
      library[type] = JSON.parse(sources[type])
    } catch {
      throw new CardLibraryError(CARD_FILES[type] + ' contains invalid JSON')
    }
  }
  return validateLibrary(library)
}

export function readCardLibrary(directory = CARD_DIRECTORY) {
  const sources = Object.fromEntries(CARD_TYPES.map(type => [
    type, readFileSync(join(directory, CARD_FILES[type]), 'utf8')
  ]))
  return parseLibrary(sources)
}

export function approvedDecks(library) {
  const cardsFor = type => library[type]
    .filter(card => card.status === 'approved')
    .map(({ id, text, category }) => ({ id, text, category }))
  const scenarios = cardsFor('scenario')
  const responses = cardsFor('response')
  if (scenarios.length < DEFAULT_MATCH_SCENARIOS || responses.length < DEFAULT_CONFIG.capacity * HAND_SIZE) {
    throw new CardLibraryError('The approved library cannot fill a standard match and an eight-seat hand deal')
  }
  return { scenarios, responses }
}
