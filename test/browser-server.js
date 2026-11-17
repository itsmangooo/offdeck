import { startServer } from '../server/index.js'
import { starterDecks } from '../server/decks.js'

await startServer({
  port: 3097,
  dev: process.env.OFFDECK_BROWSER_PROD !== '1',
  decks: {
    ...starterDecks,
    scenarios: ['hookups', 'dark', 'unhinged'].flatMap(category =>
      starterDecks.scenarios.filter(card => card.category === category).slice(0, 2))
  },
  scenarioCount: 3,
  timing: { reveal: 1450, results: 3750 }
})
