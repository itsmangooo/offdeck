import test from 'node:test'
import assert from 'node:assert/strict'
import { starterDecks } from '../server/decks.js'
import { reviewHands } from '../scripts/review-cards.js'
import { approvedDecks, cardWords, parseLibrary, readCardLibrary, validateLibrary } from '../server/card-library.js'

const library = readCardLibrary()

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
  const { scenario } = library
  for (const invalid of [
    {}, [null, ...scenario.slice(1)],
    ...[
      { id: undefined }, { id: scenario[1].id }, { category: 'other' }, { type: 'response' },
      { status: 'archived' }, { tags: ['bad tag'] }, { tags: ['quiet','quiet'] },
      { unfamiliar: true }, { compatibility: { form: 'action' } },
      { compatibility: { accepts: [] } }, { compatibility: { accepts: ['action', 'action'] } },
      { text: '' }, { text: ' ?' }, { text: 'A test?' }, { text: 'A\u202E test?' },
      { text: 'A'.repeat(120) + '?' }, { text: 'I saw __.' }, { text: '____ found ____.' },
      { text: scenario[1].text.toUpperCase().replaceAll("'", '’') }
    ].map(edit => [{ ...scenario[0], ...edit }, ...scenario.slice(1)])
  ]) assert.throws(() => validateLibrary({ ...library, scenario: invalid }))
  assert.throws(() => parseLibrary({ scenario: '{broken', response: '[]' }), /invalid JSON/)
})

test('draft and disabled cards can exist without leaking into play', () => {
  const edited = structuredClone(library)
  edited.response[0].status = 'draft'
  edited.response[1].status = 'disabled'
  edited.response[2].tags = ['awkward', 'relationships']
  edited.scenario[0].status = 'disabled'
  const decks = approvedDecks(validateLibrary(edited))
  assert.equal(decks.scenarios.length, 249)
  assert.equal(decks.responses.length, 748)
  assert.ok(!decks.responses.some(card => edited.response.slice(0, 2).some(excluded => excluded.id === card.id)))
  assert.deepEqual(Object.keys(decks.responses[0]), ['id','text','category'])
  assert.throws(() => approvedDecks({ ...edited, scenario: [] }), /cannot fill/)
})

test('offline pairing samples cover each category and only use approved cards', () => {
  const first = reviewHands(library, 'bench-031')
  assert.deepEqual(first, reviewHands(library, 'bench-031'))
  assert.notDeepEqual(first, reviewHands(library, 'bench-032'))
  assert.equal(first.length, 12)
  for (const sample of first) {
    assert.equal(new Set(sample.hand.map(card => card.category)).size, 5)
    assert.ok(sample.hand.some(card => card.category === sample.scenario.category))
  }
  const edited = structuredClone(library)
  const hidden = first[0].hand[0].id
  edited.response.find(card => card.id === hidden).status = 'disabled'
  const without = reviewHands(edited, 'bench-031', { entirePool: true })
  assert.ok(!without.some(({ hand }) => hand.some(card => card.id === hidden)))
  assert.ok(without.some(({ hand }) => hand.some(card => !card.compatibility)))
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
