import { startServer } from '../server/index.js'
import { starterDecks } from '../server/decks.js'

await startServer({
  port: 3097,
  dev: true,
  decks: { ...starterDecks, scenarios: starterDecks.scenarios.slice(0, 3) },
  timing: { reveal: 1000, results: 2100 }
})
