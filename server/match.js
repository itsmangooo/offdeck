import { randomUUID } from 'node:crypto'
import { requireRule } from './rooms.js'
import { shuffled } from './decks.js'
import { beginScenarioHistory, newResponsePile, newScenarioPile, rememberResponse } from './rotation.js'
import { DEFAULT_MATCH_SCENARIOS, HAND_SIZE } from '../shared/protocol.js'

const DEFAULT_TIMING = { reveal: 2600, results: 5000 }
const ACTIVE = new Set(['select', 'reveal', 'vote', 'results'])

export class Match {
  constructor(room, decks, now, { timing, shuffle = shuffled, scenarioCount = DEFAULT_MATCH_SCENARIOS } = {}) {
    if (!Number.isSafeInteger(scenarioCount) || scenarioCount < 1 || !decks.scenarios.length) {
      throw new RangeError('A match needs a positive scenario count and a scenario pool')
    }
    const seated = [...room.players.values()].filter(player => player.socketId)
    requireRule(seated.length >= 3, 'NEED_PLAYERS')
    this.roster = new Map(seated.map(({ id, name }) => [id, { id, name, points: 0, hand: [] }]))
    this.shuffle = shuffle
    this.durations = {
      select: room.config.selectSeconds * 1000,
      vote: room.config.voteSeconds * 1000,
      ...DEFAULT_TIMING, ...timing
    }
    const history = room.cardHistory
    this.scenarios = newScenarioPile(shuffle(decks.scenarios), scenarioCount, history.scenarios)
    this.responses = newResponsePile(shuffle(decks.responses), history.responses)
    this.playedScenarios = beginScenarioHistory(history.scenarios)
    this.scenarioDiscard = []
    this.responseDiscard = []
    this.pauseRemaining = null
    this.mostVoted = null
    this.outcome = null
    this.nextRound(room, now)
  }

  get active() {
    return ACTIVE.has(this.phase)
  }

  connected(room) {
    return [...this.roster.keys()].filter(id => room.players.get(id)?.socketId)
  }

  voters(room) {
    if (this.revealed.length < 2) return []
    return this.connected(room).filter(id => this.submissions.has(id))
  }

  transition(phase, now) {
    this.phase = phase
    this.deadline = this.durations[phase] ? now + this.durations[phase] : null
  }

  replenish(room) {
    const seated = [...this.roster.values()].filter(player => room.players.has(player.id))
    // Deal in passes so a shortage is shared around the table.
    for (let size = 0; size < HAND_SIZE; size++) {
      for (const player of seated) {
        if (player.hand.length > size) continue
        if (!this.responses.length && this.responseDiscard.length) {
          this.responses = this.shuffle(this.responseDiscard.splice(0))
        }
        const card = this.responses.pop()
        if (!card) continue
        player.hand.push(card)
        rememberResponse(room.cardHistory.responses, card.id)
      }
    }
  }

  nextRound(room, now) {
    this.scenario = this.scenarios.pop()
    this.playedScenarios.add(this.scenario.id)
    this.submissions = new Map()
    this.votes = new Map()
    this.revealed = []
    this.roundId = randomUUID()
    this.replenish(room)
    this.transition('select', now)
  }

  submit(room, player, { roundId, cardId }) {
    requireRule(this.phase === 'select' && this.roundId === roundId && this.pauseRemaining === null, 'BAD_PHASE')
    const participant = this.roster.get(player.id)
    requireRule(participant && room.players.get(player.id)?.socketId, 'NOT_ELIGIBLE')
    requireRule(!this.submissions.has(player.id), 'ALREADY_SUBMITTED')
    const index = participant.hand.findIndex(card => card.id === cardId)
    requireRule(index !== -1, 'BAD_CARD')
    const [card] = participant.hand.splice(index, 1)
    this.submissions.set(player.id, { id: randomUUID(), card, authorId: player.id })
  }

  vote(room, player, { roundId, responseId }) {
    requireRule(this.phase === 'vote' && this.roundId === roundId && this.pauseRemaining === null, 'BAD_PHASE')
    requireRule(this.voters(room).includes(player.id), 'NOT_ELIGIBLE')
    requireRule(!this.votes.has(player.id), 'ALREADY_VOTED')
    const response = this.revealed.find(card => card.id === responseId)
    requireRule(response, 'BAD_CARD')
    requireRule(response.authorId !== player.id, 'OWN_CARD')
    this.votes.set(player.id, response.id)
  }

  collectDeparted(room) {
    for (const player of this.roster.values()) {
      const membership = room.players.get(player.id)
      if (membership) player.name = membership.name
      else if (player.hand.length) this.responseDiscard.push(...player.hand.splice(0))
    }
  }

  update(room, now) {
    if (!this.active) return false
    this.collectDeparted(room)
    const remaining = [...this.roster.keys()].filter(id => room.players.has(id)).length
    if (remaining < 3) {
      this.finish('abandoned', now)
      return true
    }
    const online = this.connected(room)
    if (online.length < 3) {
      if (this.pauseRemaining !== null) return false
      this.pauseRemaining = Math.max(0, this.deadline - now)
      this.deadline = null
      return true
    }
    let changed = false
    if (this.pauseRemaining !== null) {
      this.deadline = now + this.pauseRemaining
      this.pauseRemaining = null
      changed = true
    }

    const ended = now >= this.deadline
    if (this.phase === 'select' && (ended || online.every(id => this.submissions.has(id)))) {
      this.revealed = this.shuffle([...this.submissions.values()])
      this.transition('reveal', now)
      return true
    }
    if (this.phase === 'reveal' && ended) {
      if (this.revealed.length < 2) this.score(now)
      else this.transition('vote', now)
      return true
    }
    if (this.phase === 'vote' && (ended || this.voters(room).every(id => this.votes.has(id)))) {
      this.score(now)
      return true
    }
    if (this.phase === 'results' && ended) {
      this.scenarioDiscard.push(this.scenario)
      this.responseDiscard.push(...this.revealed.map(response => response.card))
      if (this.scenarios.length) this.nextRound(room, now)
      else this.finish('complete', now)
      return true
    }
    return changed
  }

  score(now) {
    const counts = new Map()
    for (const id of this.votes.values()) counts.set(id, (counts.get(id) ?? 0) + 1)
    for (const entry of this.revealed) {
      entry.points = counts.get(entry.id) ?? 0
      const author = this.roster.get(entry.authorId)
      author.points += entry.points
      if (entry.points > (this.mostVoted?.points ?? 0)) {
        this.mostVoted = { text: entry.card.text, author: author.name, points: entry.points }
      }
    }
    this.transition('results', now)
  }

  finish(reason, now) {
    this.outcome = reason
    this.pauseRemaining = null
    this.transition('finished', now)
  }

  view(room, viewer) {
    const ranked = [...this.roster.values()].map(({ id, name, points }) => ({ id, name, points }))
      .sort((a, b) => b.points - a.points)
    const phase = this.phase
    const hidden = phase === 'select'
    const results = phase === 'results'
    const top = results ? Math.max(0, ...this.revealed.map(card => card.points)) : 0
    return {
      phase,
      roundId: this.roundId,
      paused: this.pauseRemaining !== null,
      deadline: this.deadline,
      outcome: this.outcome,
      remaining: this.scenarios.length,
      scenariosPlayed: this.scenarioDiscard.length,
      scenario: this.scenario,
      ranked,
      mostVoted: phase === 'finished' ? this.mostVoted : null,
      hand: this.active ? this.roster.get(viewer.id)?.hand.slice() ?? [] : [],
      canSubmit: phase === 'select' && this.pauseRemaining === null &&
        this.roster.has(viewer.id) && !this.submissions.has(viewer.id),
      canVote: phase === 'vote' && this.pauseRemaining === null &&
        this.voters(room).includes(viewer.id) && !this.votes.has(viewer.id),
      voted: this.votes.has(viewer.id),
      voteChoiceId: phase === 'vote' ? this.votes.get(viewer.id) ?? null : null,
      spectator: !this.roster.has(viewer.id),
      seats: this.active ? [...this.roster].map(([id, player]) => ({
        id, handCount: player.hand.length, submitted: this.submissions.has(id), voted: this.votes.has(id)
      })) : [],
      submittedCount: this.submissions.size,
      responses: hidden || phase === 'finished' ? [] : this.revealed.map(entry => ({
        id: entry.id,
        text: entry.card.text,
        own: entry.authorId === viewer.id,
        ...(results && {
          author: this.roster.get(entry.authorId).name,
          authorId: entry.authorId,
          points: entry.points,
          winner: top > 0 && entry.points === top
        })
      }))
    }
  }
}
