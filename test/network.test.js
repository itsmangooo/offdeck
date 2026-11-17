import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { io } from 'socket.io-client'
import { startServer } from '../server/index.js'

async function player(url, cleanup) {
  const socket = io(url, { transports: ['websocket'], reconnection: false, timeout: 3000, auth: { adult: true } })
  cleanup.after(() => socket.close())
  const client = { send: (event, data = {}) => socket.timeout(3000).emitWithAck(event,data), socket }
  socket.on('room:state', state => { client.state = state })
  await once(socket,'connect')
  return client
}

test('the game socket requires an adult self-declaration', async t => {
  const server = await startServer({ port: 0 })
  t.after(() => server.close())
  for (const auth of [{}, { adult: false }, { adult: 'true' }]) {
    const socket = io(server.url, { transports: ['websocket'], auth, reconnection: false })
    const [error] = await once(socket, 'connect_error')
    assert.equal(error.message, 'AGE_CONFIRMATION_REQUIRED')
    assert.equal(socket.connected, false)
    socket.close()
  }
})

test('real WebSockets authorize host and seat ownership, keep tokens private, and reject stale or unauthorized actions', async t => {
  const server = await startServer({ port: 0, publicOrigin: 'https://offdeckgames.com' })
  t.after(() => server.close())
  const [a,b,c,s] = await Promise.all(Array.from({ length: 4 }, () => player(server.url,t)))
  const config = await fetch(server.url + '/api/config').then(response => response.json())
  assert.equal(config.publicOrigin,'https://offdeckgames.com')

  const aPrivate = once(a.socket,'room:seat')
  const seat = await a.send('room:create',{ name: 'Alex' })
  assert.deepEqual((await aPrivate)[0],{ id: seat.id, token: seat.token })
  assert.deepEqual(await a.send('match:start'),{ ok: false, code: 'NEED_PLAYERS' })

  const bSeat = await b.send('room:join', { id: seat.id, name: 'Alex' })
  await c.send('room:join', { id: seat.id, name: 'Chris' })
  assert.notEqual(a.state.selfId,b.state.selfId)
  assert.notEqual(seat.token,bSeat.token)
  assert.ok(!JSON.stringify(b.state).includes(seat.token) && !JSON.stringify(b.state).includes(bSeat.token))
  assert.deepEqual(await b.send('match:start'),{ ok: false, code: 'FORBIDDEN' })

  assert.deepEqual(await a.send('match:start'),{ ok: true })
  const bMatching = b.state?.match ? b.state : (await once(b.socket,'room:state'))[0]
  const ab = a.state.match.hand[0]
  const bb = bMatching.match.hand[0]
  assert.ok(!a.state.match.hand.some(card => card.id === bb.id))
  assert.ok(!JSON.stringify(bMatching).includes(JSON.stringify(ab.text)))
  const { roundId } = a.state.match
  assert.deepEqual(await a.send('match:submit',{ roundId: 'previous-round', cardId: ab.id }),{ ok: false, code: 'BAD_PHASE' })
  assert.deepEqual(await a.send('match:submit',{ roundId, cardId: bb.id }),{ ok: false, code: 'BAD_CARD' })
  assert.deepEqual(await a.send('match:submit',{ roundId, cardId: ab.id }),{ ok: true })
  assert.deepEqual(await a.send('match:submit',{ roundId, cardId: ab.id }),{ ok: false, code: 'ALREADY_SUBMITTED' })
  await s.send('room:join',{ id: seat.id, name: 'Spectator' })
  assert.equal(s.state.match.spectator,true)
  assert.deepEqual(s.state.match.hand,[])
  assert.deepEqual(await s.send('room:resume',{ id: seat.id, token: bSeat.token }),{ ok: false, code: 'IN_ROOM' })

  const replacement = await player(server.url,t)
  assert.deepEqual(await replacement.send('room:resume',{ id: seat.id, token: '0'.repeat(64) }),{ ok: false, code: 'BAD_SESSION' })
  const closed = once(b.socket,'room:closed')
  assert.equal((await replacement.send('room:resume',{ id: seat.id, token: bSeat.token })).ok,true)
  assert.equal((await closed)[0],'REPLACED')
  assert.equal(replacement.state.selfId,bMatching.selfId)
  assert.deepEqual(replacement.state.match.hand,bMatching.match.hand)
  assert.deepEqual(await b.send('player:name',{ name: 'No' }),{ ok: false, code: 'NO_ROOM' })
})
