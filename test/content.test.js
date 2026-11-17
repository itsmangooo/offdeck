import test from 'node:test'
import assert from 'node:assert/strict'
import { cardWords, starterDecks, validateLibrary } from '../server/decks.js'

test('all 1,000 cards have stable unique IDs and the requested distribution', () => {
  assert.equal(starterDecks.scenarios.length, 250)
  assert.equal(starterDecks.responses.length, 750)
  const all = [...starterDecks.scenarios, ...starterDecks.responses]
  assert.equal(new Set(all.map(card => card.id)).size, 1000)
})

test('the scenario collection has questions, fill-ins and open setups', () => {
  const scenarios = starterDecks.scenarios.map(card => card.text)
  const fillIns = scenarios.filter(text => text.includes('____'))
  const questions = scenarios.filter(text => !text.includes('____') && text.endsWith('?'))
  assert.ok(fillIns.length >= 50 && fillIns.length <= 120)
  assert.ok(questions.length >= 50)
  assert.ok(scenarios.length - fillIns.length - questions.length >= 65)
})

test('at least nine in ten responses in each category are two to twelve words', () => {
  const groups = Map.groupBy(starterDecks.responses, card => card.category)
  for (const [category,cards] of groups) {
    const concise = cards.filter(card => {
      const words = card.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu).length
      return words >= 2 && words <= 12
    })
    assert.ok(concise.length / cards.length >= .9, category)
  }
})

test('invalid library records fail before a room can use them', () => {
  const scenarios = starterDecks.scenarios
  for (const invalid of [
    {}, scenarios.slice(1), [null, ...scenarios.slice(1)],
    ...[
      { id: undefined }, { id: scenarios[1].id }, { category: 'other' },
      { text: '' }, { text: ' ?' }, { text: 'A test?' }, { text: 'A\u202E test?' },
      { text: 'A'.repeat(120) + '?' }, { text: 'I saw __.' }, { text: '____ found ____.' },
      { text: scenarios[1].text.toUpperCase().replaceAll("'", '’') }
    ].map(edit => [{ ...scenarios[0], ...edit }, ...scenarios.slice(1)])
  ]) assert.throws(() => validateLibrary(invalid, 'scenario'))
})

test('near-identical phrasing is flagged for editorial review', () => {
  const duplicates = []
  for (const deck of Object.values(starterDecks)) {
    const entries = deck.map(card => ({ ...card, words: new Set(cardWords(card.text)) }))
    for (const [index, card] of entries.entries()) {
      if (card.words.size < 6) continue
      for (let j = 0; j < index; j++) {
        const other = entries[j]
        const largest = Math.max(card.words.size, other.words.size)
        if (Math.min(card.words.size, other.words.size) / largest < .82) continue
        let shared = 0
        for (const word of card.words) if (other.words.has(word)) shared++
        if (shared / (card.words.size + other.words.size - shared) >= .82) {
          duplicates.push(card.id + ' / ' + other.id + ' — ' + card.text + ' / ' + other.text)
        }
      }
    }
  }
  assert.deepEqual(duplicates, [])
})
