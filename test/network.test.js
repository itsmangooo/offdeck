import test from 'node:test'
import assert from 'node:assert/strict'
import { once, on } from 'node:events'
import { io } from 'socket.io-client'
import { startServer } from '../server/index.js'
import { starterDecks } from '../server/decks.js'
import { DEFAULT_MATCH_SCENARIOS, HAND_SIZE } from '../shared/protocol.js'

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

async function matchWhen(client, predicate) {
  const current = client.state?.match
  if (current && predicate(current)) return current
  for await (const [state] of on(client.socket, 'room:state', { signal: AbortSignal.timeout(5000) })) {
    if (state.match && predicate(state.match)) return state.match
  }
}

test('eight live clients complete the default 20-scenario match with approved content', { timeout: 35_000 }, async t => {
  const server = await startServer({ port: 0, tickMs: 30, timing: { reveal: 300, results: 420 } })
  t.after(() => server.close())
  const table = await Promise.all(Array.from({ length: 8 }, () => player(server.url,t)))
  const host = table[0]
  const { id } = await host.send('room:create', { name: 'Host' })
  await Promise.all(table.slice(1).map(async (client, index) =>
    assert.equal((await client.send('room:join', { id, name: 'Guest ' + (index + 1) })).ok, true)))
  assert.deepEqual(await host.send('match:start'), { ok: true })
  const scenarios = new Map(starterDecks.scenarios.map(card => [card.id, card]))
  const responses = new Map(starterDecks.responses.map(card => [card.id, card]))
  const seen = new Set()

  for (let round = 0; round < DEFAULT_MATCH_SCENARIOS; round++) {
    const snapshots = await Promise.all(table.map(client =>
      matchWhen(client, match => match.phase === 'select' && match.scenariosPlayed === round)))
    const { roundId, scenario } = snapshots[0]
    assert.deepEqual(scenario, scenarios.get(scenario.id))
    assert.ok(!seen.has(scenario.id))
    seen.add(scenario.id)
    for (const match of snapshots) {
      assert.equal(match.roundId, roundId)
      assert.deepEqual(match.scenario, scenario)
      assert.equal(match.hand.length, HAND_SIZE)
      assert.equal(match.remaining, DEFAULT_MATCH_SCENARIOS - round - 1)
      assert.deepEqual(match.responses, [])
      for (const card of match.hand) assert.deepEqual(card, responses.get(card.id))
    }
    const dealt = snapshots.flatMap(match => match.hand.map(card => card.id))
    assert.equal(new Set(dealt).size, table.length * HAND_SIZE)
    await Promise.all(table.map(async (client, index) => assert.deepEqual(
      await client.send('match:submit', { roundId, cardId: snapshots[index].hand[0].id }), { ok: true }
    )))

    const voting = await Promise.all(table.map(client =>
      matchWhen(client, match => match.roundId === roundId && match.phase === 'vote')))
    const own = voting.map((match, index) => {
      assert.equal(match.responses.length, table.length)
      const response = match.responses.find(response => response.own)
      assert.equal(response.text, snapshots[index].hand[0].text)
      assert.ok(match.responses.every(response => !('author' in response) && !('points' in response)))
      return response.id
    })
    await Promise.all(table.map(async (client, index) => assert.deepEqual(
      await client.send('match:vote', { roundId, responseId: own[(index + 1) % table.length] }), { ok: true }
    )))
    const results = await Promise.all(table.map(client =>
      matchWhen(client, match => match.roundId === roundId && match.phase === 'results')))
    for (const match of results) {
      assert.ok(match.responses.every(response => response.winner && response.author && response.points === 1))
      assert.deepEqual(match.ranked.map(player => player.points), Array(table.length).fill(round + 1))
    }
  }

  const complete = await Promise.all(table.map(client => matchWhen(client, match => match.phase === 'finished')))
  assert.ok(complete.every(match => match.outcome === 'complete' && match.scenariosPlayed === DEFAULT_MATCH_SCENARIOS))
  assert.equal(seen.size, DEFAULT_MATCH_SCENARIOS)
})
