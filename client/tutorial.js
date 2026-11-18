import { DEFAULT_MATCH_SCENARIOS } from '../shared/protocol.js'

const players = [
  { id: 'you', name: 'You', seat: 0, connected: true },
  { id: 'maya', name: 'Maya', seat: 2, connected: true },
  { id: 'jules', name: 'Jules', seat: 6, connected: true },
]
const scenario = { id: 'practice-scenario', text: 'The office printer is out of paper. It accepts ____ instead.' }
const hand = [
  { id: 'raccoon', text: 'A raccoon with a clipboard' },
  { id: 'receipt', text: 'A seven-foot receipt' },
  { id: 'excuse', text: 'An extremely convincing excuse' },
  { id: 'spoon', text: 'One very small spoon' },
  { id: 'cheese', text: 'Cheese with a name tag' },
]
const otherResponses = [
  { id: 'ducks', text: 'Three ducks in a trench coat' },
  { id: 'coupon', text: 'A coupon for one free nap' },
]

export const tutorialSteps = [
  ['Welcome to OFFDECK', 'Welcome to OFFDECK. Play ridiculous cards, make your friends laugh, and collect votes.'],
  ['Your hand', 'These are your cards. Choose the funniest response for each scenario.'],
  ['The scenario card', 'Every round starts with a new scenario. Read it carefully.'],
  ['Submit a response', 'Pick one card and submit it before time runs out.'],
  ['Vote anonymously', 'Vote for the funniest answer. You can’t vote for yourself.'],
  ['Score points', 'Every vote you receive earns you one point.'],
  ['Keep playing', `New scenarios appear automatically. After ${DEFAULT_MATCH_SCENARIOS} scenarios, the player with the most points wins.`],
]

export class Tutorial {
  step = 0
  submitted = null
  vote = null
  table = { id: 'tutorial', selfId: 'you', players, match: null }

  move(offset) {
    const next = this.step + offset
    if (next < 0 || next >= tutorialSteps.length) return false
    this.step = next
    if (next < 3) this.submitted = null
    if (next < 4) this.vote = null
    this.updateTable()
    return true
  }

  choose(action, id) {
    if (this.step === 3 && action === 'submit' && !this.submitted && hand.some(card => card.id === id)) {
      this.submitted = id
    } else if (this.step === 4 && action === 'vote' && !this.vote && otherResponses.some(card => card.id === id)) {
      this.vote = id
    } else return false
    this.updateTable()
    return true
  }

  updateTable() {
    const phase = this.step < 4 ? 'select' : this.step === 4 ? 'vote' : 'results'
    const submitted = hand.find(card => card.id === this.submitted)
    const responses = [otherResponses[0], { ...(submitted ?? hand[0]), own: true }, otherResponses[1]]
    this.table = {
      id: 'tutorial', selfId: 'you', players,
      tutorialHighlight: [null, 'hand', 'scenario', 'hand', 'responses'][this.step],
      match: this.step === 0 ? null : {
        roundId: 'tutorial-round',
        phase, scenario, remaining: DEFAULT_MATCH_SCENARIOS - 1,
        hand: submitted ? hand.filter(card => card !== submitted) : hand,
        seats: players.map(({ id }) => ({ id, handCount: hand.length, submitted: id === 'you' && Boolean(submitted) })),
        submittedCount: Number(Boolean(submitted)),
        responses: phase === 'select' ? [] : responses.map((card, index) => phase === 'results'
          ? { ...card, author: players[[1, 0, 2][index]].name, points: card.own ? 1 : 0, winner: Boolean(card.own) }
          : card),
        canSubmit: this.step === 3 && !submitted,
        canVote: this.step === 4 && !this.vote,
        voteChoiceId: this.vote,
      },
    }
  }
}
