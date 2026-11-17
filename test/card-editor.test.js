import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readdir, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startCardEditor } from '../scripts/card-editor.js'
import { startServer } from '../server/index.js'
import { CARD_DIRECTORY, CARD_FILES, readCardLibrary } from '../server/card-library.js'

test('the editor isolates writes, rejects stale edits and keeps valid source files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'offdeck-editor-'))
  let editor
  try {
    for (const file of Object.values(CARD_FILES)) await copyFile(join(CARD_DIRECTORY, file), join(directory, file))
    editor = await startCardEditor({ directory, port: 0 })
    const { library, revision } = await fetch(editor.url + '/api/library').then(response => response.json())
    const attackOrigin = await fetch(editor.url + '/api/cards', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.org' },
      body: JSON.stringify({ action: 'delete', id: library.response[0].id, revision })
    })
    assert.equal(attackOrigin.status, 403)
    const wrongHostUrl = editor.url.replace('127.0.0.1', 'localhost')
    // Connect to the same interface, but present an authority other than the bound URL.
    const { request } = await import('node:http')
    const wrongHostStatus = await new Promise((resolve, reject) => {
      request(editor.url + '/api/library', { headers: { Host: new URL(wrongHostUrl).host } }, response => {
        response.resume()
        resolve(response.statusCode)
      }).on('error', reject).end()
    })
    assert.equal(wrongHostStatus, 403)
    const send = payload => fetch(editor.url + '/api/cards', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: editor.url },
      body: JSON.stringify({ revision, ...payload })
    })
    assert.equal((await send({ action: 'delete', id: library.response[0].id })).status, 400)
    const card = { id: null, type: 'response', category: 'social', text: 'A toast to the person who changed the locks.', status: 'draft' }
    const writes = await Promise.all([send({ action: 'save', card }), send({ action: 'save', card })])
    assert.deepEqual(writes.map(response => response.status).sort(), [200, 409])
    const saved = await writes.find(response => response.ok).json()
    assert.equal(readCardLibrary(directory).response.find(card => card.id === saved.id).status, 'draft')
    assert.deepEqual((await readdir(directory)).sort(), Object.values(CARD_FILES).sort())
    assert.equal((await send({ action: 'delete', id: saved.id, confirmation: saved.id })).status, 409)
    const invalid = await send({ action: 'save', revision: saved.revision, card: { ...card, status: 'private' } })
    assert.equal(invalid.status, 422)
    assert.match((await invalid.json()).error, /unknown status/)
  } finally {
    await editor?.close()
    for (const file of Object.values(CARD_FILES)) await rm(join(directory, file), { force: true })
    await rmdir(directory)
  }
})

test('the production server does not expose the editor or its API', async () => {
  const server = await startServer({ port: 0 })
  try {
    const checks = await Promise.all([
      fetch(server.url + '/editor.js'),
      fetch(server.url + '/api/library'),
      fetch(server.url + '/api/cards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      })
    ])
    assert.deepEqual(checks.map(response => response.status), [404, 404, 404])
  } finally {
    await server.close()
  }
})
