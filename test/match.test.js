import test from 'node:test'
import assert from 'node:assert/strict'
import { RoomStore } from '../server/rooms.js'
import { Match } from '../server/match.js'
import { makeDeck, starterDecks } from '../server/decks.js'
import { HAND_SIZE } from '../shared/protocol.js'

function fixture({ seats = 3, scenarios = 3, responses = 3 * HAND_SIZE } = {}) {
  let now = 100
  const store = new RoomStore({ now: () => now })
  const { room, player } = store.create('Host', {}, 'host')
  const players = [player]
  for (let i = 1; i < seats; i++) players.push(store.join(room.id, 'Guest ' + i, 'socket-' + i).player)
  const deck = {
    scenarios: makeDeck(Array.from({ length: scenarios }, (_, i) => 'Scenario ' + i), 'scenario'),
    responses: makeDeck(Array.from({ length: responses }, (_, i) => 'Response ' + i), 'response')
  }
  const match = new Match(room, deck, now, { select: 45, reveal: 2, vote: 30, results: 5 }, cards => [...cards].reverse())
  return {
    match, players, room, store,
    update: (time = 0) => match.update(room, now += time),
    submit: (member, cardId = match.view(room, member).hand[0]?.id, roundId = match.roundId) =>
      match.submit(room, member, { cardId, roundId }),
    cast: (member, entry = match.view(room, member).responses.find(card => !card.own)) =>
      match.vote(room, member, { responseId: entry.id, roundId: match.roundId })
  }
}

test('the Unfiltered deck supports an eight-seat deal', () => {
  assert.ok(starterDecks.scenarios.length > 0)
  assert.ok(starterDecks.responses.length >= 8 * HAND_SIZE)
  const { room, players } = fixture({ seats: 8 })
  const match = new Match(room, starterDecks, 0)
  const dealt = players.flatMap(player => {
    const hand = match.view(room, player).hand
    assert.equal(hand.length, HAND_SIZE)
    return hand.map(card => card.id)
  })
  assert.equal(new Set(dealt).size, 8 * HAND_SIZE)
})

test('deal and submissions remain private, reveal IDs are anonymous, votes lock, ties score correctly', () => {
  const { match, players: [a, b, c], room, update, submit, cast } = fixture()
  const aHand = match.view(room, a).hand
  const bHand = match.view(room, b).hand
  const privateCard = bHand[0]
  assert.equal(aHand.length, HAND_SIZE)
  assert.ok(aHand.every(card => !bHand.includes(card)))
  assert.throws(() => submit(a, privateCard.id), /BAD_CARD/)
  submit(b)
  assert.throws(() => submit(b), /ALREADY_SUBMITTED/)
  const before = JSON.stringify(match.view(room, a))
  assert.ok(!before.includes(JSON.stringify(privateCard.id)) && !before.includes(JSON.stringify(privateCard.text)))
  submit(a)
  submit(c)
  update()
  assert.equal(match.phase, 'reveal')
  const aView = match.view(room, a)
  assert.equal(aView.responses.length, 3)
  assert.equal(aView.responses.filter(card => card.own).length, 1)
  assert.ok(aView.responses.every(card => !('author' in card) && !('authorId' in card) && !('points' in card) && card.id !== privateCard.id))
  assert.equal(aView.canVote, false)
  update(2)
  assert.throws(() => cast(a, match.view(room, a).responses.find(card => card.own)), /OWN_CARD/)
  assert.throws(() => cast(a, { id: 'bad' }), /BAD_CARD/)
  for (const [voter, author] of [[a, b], [b, c], [c, a]]) {
    const choice = match.view(room,author).responses.find(card => card.own)
    cast(voter,choice)
    assert.equal(match.view(room,voter).voteChoiceId,choice.id)
    assert.notEqual(match.view(room,author).voteChoiceId,choice.id)
    assert.throws(() => cast(voter), /ALREADY_VOTED/)
  }
  assert.equal(match.view(room, b).responses.some(card => 'points' in card), false)
  assert.ok(match.view(room,b).seats.every(seat => seat.voted && !('responseId' in seat)))
  update()
  assert.equal(match.phase, 'results')
  assert.ok(match.view(room, b).responses.every(card => card.winner && card.points === 1 && card.author))
  assert.deepEqual(match.view(room, a).ranked.map(player => player.points), [1, 1, 1])
})

test('deadlines exclude non-submitters and count only votes received; stale round fails', () => {
  const { match, players: [a, b, c], room, update, submit, cast } = fixture()
  const first = match.roundId
  submit(a)
  submit(b)
  update(45)
  update(2)
  assert.throws(() => cast(c), /NOT_ELIGIBLE/)
  cast(a)
  update(30)
  assert.equal(match.phase, 'results')
  assert.equal(match.view(room, a).ranked[0].id, b.id)
  assert.equal(match.view(room, a).ranked[0].points, 1)
  update(5)
  assert.notEqual(match.roundId, first)
  assert.throws(() => submit(a, undefined, first), /BAD_PHASE/)
  update(45)
  update(2)
  assert.equal(match.phase, 'results')
  assert.equal(match.view(room, c).ranked.reduce((sum, player) => sum + player.points, 0), 1)
})

test('scenario exhaustion ends the match and a small response pile recycles without duplicating hands', () => {
  const { match, players, room, update, submit } = fixture()
  const used = new Set()
  for (let round = 0; round < 3; round++) {
    const view = match.view(room, players[0])
    assert.equal(view.remaining, 2 - round)
    assert.ok(!used.has(view.scenario.id))
    used.add(view.scenario.id)
    const held = players.flatMap(player => {
      const hand = match.view(room, player).hand
      assert.equal(hand.length, HAND_SIZE)
      submit(player)
      return hand.map(card => card.id)
    })
    assert.equal(new Set(held).size, 3 * HAND_SIZE)
    update()
    update(2)
    update(30)
    assert.equal(match.phase, 'results')
    update(5)
  }
  assert.equal(match.phase, 'finished')
  assert.equal(match.outcome, 'complete')
  assert.equal(match.view(room, players[0]).scenariosPlayed, 3)
})

test('eight players reach the end only after the entire starter scenario deck is discarded', () => {
  const count = starterDecks.scenarios.length
  const { room, players } = fixture({ seats: 8 })
  const match = new Match(room, starterDecks, 0, { select: 15, reveal: 2, vote: 10, results: 5 })
  const scenarios = new Set()
  let time = 0
  while (match.active) {
    const active = match.view(room,players[0])
    assert.equal(active.phase,'select')
    assert.ok(!scenarios.has(active.scenario.id))
    scenarios.add(active.scenario.id)
    const hands = players.flatMap(player => {
      const hand = match.view(room,player).hand
      assert.equal(hand.length,HAND_SIZE)
      match.submit(room,player,{ roundId: active.roundId, cardId: hand[0].id })
      return hand.map(card => card.id)
    })
    assert.equal(new Set(hands).size,8*HAND_SIZE)
    match.update(room,time)
    match.update(room,time += 2)
    for (const [index,voter] of players.entries()) {
      const other = players[(index + 1) % players.length]
      const entry = match.view(room,other).responses.find(card => card.own)
      match.vote(room,voter,{ roundId: active.roundId, responseId: entry.id })
    }
    match.update(room,time)
    match.update(room,time += 5)
    if (scenarios.size < count) assert.equal(match.active,true)
  }
  assert.equal(scenarios.size,count)
  assert.equal(match.outcome,'complete')
  assert.deepEqual(match.view(room,players[0]).ranked.map(player => player.points), Array(8).fill(count))
})

test('short response decks are shared and can still progress', () => {
  const { players, match, room, update, submit } = fixture({ responses: 5 })
  assert.deepEqual(players.map(player => match.view(room, player).hand.length), [2, 2, 1])
  for (const player of players) submit(player)
  update()
  update(2)
  update(30)
  update(5)
  assert.equal(players.flatMap(player => match.view(room, player).hand).length, 5)
})

test('loss of quorum pauses deadlines, spectators cannot act, and an unrecoverable roster ends gracefully', () => {
  const { players: [a, b, c], match, room, store, update, submit } = fixture()
  submit(a)
  store.disconnect(room, c)
  update(15)
  assert.equal(match.view(room, a).paused, true)
  assert.equal(match.deadline, null)
  const spectator = store.join(room.id, 'Observer', 'spectator').player
  update(1000)
  assert.equal(match.view(room, spectator).spectator, true)
  assert.equal(match.phase, 'select')
  store.resume(room.id, c.token, 'new-socket')
  update()
  assert.equal(match.view(room, a).paused, false)
  assert.equal(match.view(room, a).hand.length, HAND_SIZE - 1)
  assert.throws(() => submit(spectator), /NOT_ELIGIBLE/)
  update(29)
  assert.equal(match.phase, 'select')
  update(1)
  assert.equal(match.phase, 'reveal')
  store.remove(room, b)
  update()
  assert.equal(match.outcome, 'abandoned')
})
