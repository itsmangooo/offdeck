import assert from 'node:assert/strict'
import { once } from 'node:events'
import { io } from 'socket.io-client'

const origin = new URL(process.argv[2]).origin
const timeout = () => AbortSignal.timeout(5000)
const request = path => fetch(new URL(path, origin), { signal: timeout() })

const health = await request('/healthz')
assert.equal(health.status, 200)
assert.deepEqual(await health.json(), { ok: true })

const config = await request('/api/config')
assert.equal(config.status, 200)
assert.equal((await config.json()).publicOrigin, origin)

const home = await request('/')
assert.equal(home.status, 200)
const html = await home.text()
const entry = html.match(/<script\b[^>]*\bsrc="([^"]+\.js)"/)?.[1]
assert.ok(entry, 'The production page must reference a JavaScript bundle')
assert.equal((await request(entry)).status, 200)
assert.equal((await request('/api/library')).status, 404)

const socket = io(origin, {
  autoConnect: false,
  reconnection: false,
  transports: ['websocket'],
  auth: { adult: true },
  extraHeaders: { Origin: origin }
})

try {
  const connected = once(socket, 'connect', { signal: timeout() })
  socket.connect()
  await connected
  const room = await socket.timeout(5000).emitWithAck('room:create', { name: 'Deployment check' })
  assert.equal(room.ok, true)
  assert.match(room.id, /^[a-f0-9]{36}$/)
  const invite = await request('/sid/' + room.id + '/')
  assert.equal(invite.status, 200)
  assert.equal(await invite.text(), html)
  assert.equal((await socket.timeout(5000).emitWithAck('room:leave', {})).ok, true)
} finally {
  socket.close()
}

console.log('Production health, bundle, room WebSocket and invitation route verified.')
