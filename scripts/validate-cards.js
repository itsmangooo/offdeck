import { pathToFileURL } from 'node:url'
import { CARD_CATEGORIES, CardLibraryError, readCardLibrary, validateLibrary } from '../server/card-library.js'
import { cardProfile, cardSimilarity } from '../shared/card-similarity.js'

const releaseCounts = { scenario: 250, response: 750 }

export function similarPairs(library) {
  const entries = Object.values(library).flat().map(card => ({ id: card.id, profile: cardProfile(card.text) }))
  const pairs = []
  for (const [index, card] of entries.entries()) {
    for (let j = 0; j < index; j++) {
      const prior = entries[j]
      if (cardSimilarity(card.profile, prior.profile)) pairs.push([prior.id, card.id])
    }
  }
  return pairs
}

export function validateRelease(library) {
  validateLibrary(library)
  return Object.fromEntries(Object.entries(releaseCounts).map(([type, expected]) => {
    const approved = library[type].filter(card => card.status === 'approved')
    if (approved.length !== expected) {
      throw new CardLibraryError('Expected ' + expected + ' approved ' + type + ' cards, found ' + approved.length)
    }
    const counts = Object.fromEntries(CARD_CATEGORIES.map(category =>
      [category, approved.filter(card => card.category === category).length]))
    if (Object.values(counts).some(count => count === 0)) throw new CardLibraryError('Missing approved ' + type + ' category')
    return [type, counts]
  }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const library = readCardLibrary()
    const distribution = validateRelease(library)
    console.table(distribution)
    const near = similarPairs(library)
    if (near.length) {
      for (const [first, second] of near) console.error('Review similar text in ' + first + ' and ' + second)
      process.exitCode = 1
    } else console.log('Validated 250 approved scenarios and 750 approved responses. No likely duplicate wording.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
