import { startServer } from '../server/index.js'
import { starterDecks } from '../server/decks.js'

await startServer({
  port: 3097,
  dev: process.env.OFFDECK_BROWSER_PROD !== '1',
  decks: { ...starterDecks, scenarios: starterDecks.scenarios.slice(0, 3) },
  timing: { reveal: 1450, results: 3750 }
})
