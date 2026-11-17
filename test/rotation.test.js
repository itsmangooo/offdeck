import test from 'node:test'
import assert from 'node:assert/strict'
import { HAND_SIZE } from '../shared/protocol.js'
import { starterDecks, CARD_CATEGORIES } from '../server/decks.js'
import { Match } from '../server/match.js'
import { RoomStore } from '../server/rooms.js'
import { newScenarioPile, SCENARIO_HISTORY_MATCHES, RESPONSE_HISTORY_LIMIT } from '../server/rotation.js'

function table() {
  const store = new RoomStore()
  const { room, player } = store.create('Host', {}, 'host')
  const players = [player]
  for (let i = 1; i < 8; i++) players.push(store.join(room.id, 'Guest ' + i, 'socket-' + i).player)
  return { room, players }
}

function play(match, room, players) {
  const scenarios = []
  const rounds = []
  let clock = 0
  while (match.active) {
    assert.equal(match.phase, 'select')
    scenarios.push(match.scenario)
    const hands = players.map(player => match.view(room, player).hand)
    const ids = hands.flat().map(card => card.id)
    rounds.push(ids)
    assert.deepEqual(hands.map(hand => hand.length), Array(8).fill(HAND_SIZE))
    assert.equal(new Set(ids).size, 8 * HAND_SIZE)
    const physical = [...ids, ...match.responses.map(card => card.id), ...match.responseDiscard.map(card => card.id)]
    assert.equal(new Set(physical).size, physical.length)
    for (const [index, player] of players.entries()) {
      match.submit(room, player, { roundId: match.roundId, cardId: hands[index][0].id })
    }
    assert.equal(match.update(room, clock), true)
    assert.equal(match.update(room, ++clock), true)
    for (const [index, player] of players.entries()) {
      const author = players[(index + 1) % players.length]
      const response = match.view(room, author).responses.find(card => card.own)
      match.vote(room, player, { roundId: match.roundId, responseId: response.id })
    }
    assert.equal(match.update(room, clock), true)
    assert.equal(match.update(room, ++clock), true)
  }
  assert.equal(match.outcome, 'complete')
  assert.equal(new Set(scenarios.map(card => card.id)).size, scenarios.length)
  assert.deepEqual(match.view(room, players[0]).ranked.map(player => player.points), Array(8).fill(rounds.length))
  return { scenarios, rounds }
}

const timing = { reveal: 1, results: 1 }

test('eight players finish six consecutive matches with fresh deals and balanced scenarios', () => {
  const { room, players } = table()
  const history = []
  let previousResponses = new Set()
  for (let game = 0; game < 6; game++) {
    const { scenarios, rounds } = play(new Match(room, starterDecks, 0, { timing }), room, players)
    assert.equal(scenarios.length, 20)
    const previousScenarios = new Set(history.slice(-SCENARIO_HISTORY_MATCHES).flat())
    assert.ok(scenarios.every(card => !previousScenarios.has(card.id)))
    history.push(scenarios.map(card => card.id))
    const categories = CARD_CATEGORIES.map(category => scenarios.filter(card => card.category === category).length)
    assert.ok(categories.every(count => count === 3 || count === 4))
    assert.ok(scenarios.every((card, index) => index === 0 || card.category !== scenarios[index - 1].category))
    const responses = new Set(rounds.flat())
    assert.ok([...responses].every(id => !previousResponses.has(id)))
    assert.equal(responses.size, 8 * (HAND_SIZE + rounds.length - 1))
    previousResponses = responses
  }
  assert.equal(room.cardHistory.scenarios.length, SCENARIO_HISTORY_MATCHES)
  assert.equal(room.cardHistory.responses.size, RESPONSE_HISTORY_LIMIT)
})

test('a constrained scenario pool fills from older matches before the previous match', () => {
  const cards = starterDecks.scenarios.slice(0, 6)
  const older = new Set([cards[0].id, cards[1].id])
  const latest = new Set([cards[2].id, cards[3].id, cards[4].id])
  const order = newScenarioPile(cards, 4, [older, latest]).reverse().map(card => card.id)
  assert.equal(order[0], cards[5].id)
  assert.deepEqual(new Set(order.slice(1, 3)), older)
  assert.ok(latest.has(order[3]))
})

test('eight hands consume the unused response pile before recycling discards', () => {
  const { room, players } = table()
  const decks = { ...starterDecks, responses: starterDecks.responses.slice(0, 8 * HAND_SIZE + 3) }
  const match = new Match(room, decks, 0, { timing, scenarioCount: 6 })
  const unusedAtStart = match.responses.map(card => card.id)
  const { rounds } = play(match, room, players)
  assert.equal(rounds.length, 6)
  assert.equal(unusedAtStart.length, 3)
  assert.ok(unusedAtStart.every(id => rounds[1].includes(id)))
  assert.equal(rounds[1].filter(id => !rounds[0].includes(id)).length, 3)
  assert.equal(new Set(rounds.flat()).size, decks.responses.length)
})
