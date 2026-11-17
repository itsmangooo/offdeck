import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { CARD_CATEGORIES, readCardLibrary } from '../server/card-library.js'

function pick(cards, salt) {
  const hash = card => createHash('sha256').update(salt + ':' + card.id).digest('hex')
  return cards.reduce((best, card) => !best || hash(card) < hash(best) ? card : best, null)
}

export function reviewHands(library, seed, { entirePool = false } = {}) {
  const scenarios = library.scenario.filter(card => card.status === 'approved' && card.compatibility)
  const responses = library.response.filter(card => card.status === 'approved' && (entirePool || card.compatibility))
  return scenarios.map((scenario, index) => {
    const otherCategories = CARD_CATEGORIES.filter(category => category !== scenario.category)
    // One from the prompt's category, four from other categories. Rotate the omitted category.
    const categories = [scenario.category, ...otherCategories.filter((_, i) => i !== index % otherCategories.length)]
    const hand = categories.map(category => pick(
      responses.filter(card => card.category === category), seed + ':' + scenario.id
    )).filter(Boolean)
    return { scenario, hand }
  })
}

function printReview(samples) {
  for (const { scenario, hand } of samples) {
    console.log('\n' + scenario.id + ' [' + scenario.category + '] ' + scenario.text)
    console.log('  Suggested forms: ' + scenario.compatibility.accepts.join(', '))
    for (const response of hand) {
      const form = response.compatibility?.form
      const note = !form ? 'unannotated' : scenario.compatibility.accepts.includes(form) ? form : form + ', read in context'
      console.log('  ' + response.id + ' [' + response.category + ', ' + note + '] ' + response.text)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seed = process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? 'unfiltered-031'
  printReview(reviewHands(readCardLibrary(), seed, { entirePool: process.argv.includes('--all-responses') }))
}
