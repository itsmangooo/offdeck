import express from 'express'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  approvedDecks, CARD_CATEGORIES, CARD_DIRECTORY, CARD_FILES, CARD_STATUSES, CARD_TEXT_LIMIT,
  CardLibraryError, parseLibrary, RESPONSE_FORMS, validateLibrary
} from '../server/card-library.js'

const root = new URL('../', import.meta.url)
const assets = {
  '/': 'scripts/editor/index.html',
  '/editor.css': 'scripts/editor/editor.css',
  '/editor.js': 'scripts/editor/editor.js',
  '/card-face.js': 'shared/card-face.js',
  '/card-text.js': 'shared/card-text.js',
  '/card-similarity.js': 'shared/card-similarity.js',
  '/geist.woff2': 'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'
}
const settings = {
  categories: CARD_CATEGORIES, statuses: CARD_STATUSES, forms: RESPONSE_FORMS,
  textLimit: CARD_TEXT_LIMIT, types: Object.keys(CARD_FILES)
}

class EditError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function readSnapshot(directory) {
  const entries = await Promise.all(Object.entries(CARD_FILES).map(async ([type, file]) =>
    [type, await readFile(join(directory, file), 'utf8')]))
  const library = parseLibrary(Object.fromEntries(entries))
  const revision = createHash('sha256').update(JSON.stringify(entries)).digest('hex')
  return { library, revision }
}

function changeCard(library, payload) {
  const { action, card, id, confirmation } = payload
  if (action === 'delete') {
    const type = settings.types.find(type => library[type].some(card => card.id === id))
    if (!type) throw new EditError(404, 'That card no longer exists.')
    if (confirmation !== id) throw new EditError(400, 'Confirm the card ID before deleting.')
    library[type] = library[type].filter(card => card.id !== id)
    return { type, id }
  }

  if (action !== 'save' || !card || typeof card !== 'object' || Array.isArray(card) ||
      !settings.types.includes(card.type)) throw new EditError(400, 'Provide a valid card type and edit action.')

  const { type } = card
  if (card.id === null) {
    do { card.id = type + '-' + randomBytes(6).toString('hex') }
    while (library[type].some(prior => prior.id === card.id))
    library[type].push(card)
  } else {
    const index = library[type].findIndex(prior => prior.id === card.id)
    if (index === -1) throw new EditError(404, 'That card no longer exists, or its type was changed.')
    library[type][index] = card
  }
  return { type, id: card.id }
}

async function writeCollection(directory, type, cards, revision) {
  const path = join(directory, CARD_FILES[type])
  const temporary = path + '.' + randomUUID() + '.tmp'
  const text = '[\n' + cards.map(card => '  ' + JSON.stringify(card)).join(',\n') + '\n]\n'
  try {
    await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' })
    if ((await readSnapshot(directory)).revision !== revision) {
      throw new EditError(409, 'The source files changed. Reload the library and try again.')
    }
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

// This server is started explicitly by the editor command. The game server never mounts these routes.
export async function startCardEditor({ directory = CARD_DIRECTORY, port = 3417 } = {}) {
  const app = express()
  app.disable('x-powered-by')
  let authority
  let writeQueue = Promise.resolve()

  app.use((request, response, next) => {
    response.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    })
    if (request.headers.host !== authority) {
      response.status(403).json({ error: 'Open the loopback address printed by the editor.' })
    } else next()
  })

  for (const [route, path] of Object.entries(assets)) {
    app.get(route, (_request, response) => response.sendFile(fileURLToPath(new URL(path, root))))
  }
  app.get('/api/library', async (_request, response) => {
    response.json({ ...await readSnapshot(directory), settings })
  })
  app.post('/api/cards', (request, response, next) => {
    if (request.get('origin') !== 'http://' + authority) {
      return response.status(403).json({ error: 'Edits must come from the local editor page.' })
    }
    if (!request.is('application/json')) {
      return response.status(415).json({ error: 'Expected a JSON edit.' })
    }
    next()
  }, express.json({ limit: '8kb' }), async (request, response) => {
    const task = writeQueue.then(async () => {
      const { library, revision } = await readSnapshot(directory)
      if (request.body?.revision !== revision) {
        throw new EditError(409, 'The source files changed. Reload the library and try again.')
      }
      const { type, id } = changeCard(library, request.body)
      approvedDecks(validateLibrary(library))
      await writeCollection(directory, type, library[type], revision)
      return { ...await readSnapshot(directory), settings, id }
    })
    writeQueue = task.catch(() => {})
    response.json(await task)
  })

  app.use((error, _request, response, _next) => {
    if (error instanceof EditError) return response.status(error.status).json({ error: error.message })
    if (error instanceof CardLibraryError) return response.status(422).json({ error: error.message })
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Invalid JSON edit.' })
    if (error.type === 'entity.too.large') return response.status(413).json({ error: 'The edit is too large.' })
    console.error(error)
    response.status(500).json({ error: 'The source library could not be read or saved.' })
  })

  const server = app.listen(port, '127.0.0.1')
  await once(server, 'listening')
  authority = '127.0.0.1:' + server.address().port
  return {
    url: 'http://' + authority,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const editor = await startCardEditor()
  console.log('OFFDECK card editor ' + editor.url)
}
