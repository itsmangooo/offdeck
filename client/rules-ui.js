import { DEFAULT_MATCH_SCENARIOS, HAND_SIZE } from '../shared/protocol.js'

const rules = [
  ['Players', 'Play with 3–8 people. The host starts the match when at least three players are connected.'],
  ['Your cards', `You start with ${HAND_SIZE} response cards. Only you can see your hand.`],
  ['The scenario', 'One scenario appears in the center of the table each round. Click it for a closer look.'],
  ['Pick a response', 'Choose the funniest card for the scenario. You can submit one response per round, and your choice locks in.'],
  ['Anonymous reveal', 'The table shuffles and reveals the submitted cards without names when everyone connected submits or time runs out.'],
  ['Vote once', 'If you submitted a response, vote for another player’s funniest card. Voting opens when at least two cards were submitted.'],
  ['Score points', 'Every vote your card receives earns you one point. The cards with the most votes share the round win if tied.'],
  ['Draw and repeat', `Played cards go to the discard pile. A replacement brings your hand back to ${HAND_SIZE}, and the next scenario appears automatically.`],
  ['Match length', `A standard match plays ${DEFAULT_MATCH_SCENARIOS} randomly selected scenarios. Rounds advance on their own.`],
  ['Win the match', 'The highest total score after the last scenario wins. Players tied for first share the win.'],
]

export function rulesMarkup() {
  return `<p class="rules-intro">Pick a card, vote for a favorite, and see who makes the table laugh most.</p>
    <ol class="rules-list">${rules.map(([title, text]) => `<li><h3>${title}</h3><p>${text}</p></li>`).join('')}</ol>
    <details class="rules-extra"><summary>Timers, disconnects, and rematches</summary>
      <dl>
        <div><dt>Timers and late submissions</dt><dd>The host chooses the response and voting time limits when creating a room. Once a phase ends, late choices don’t count. If you miss the response deadline, you can watch that round but can’t vote.</dd></div>
        <div><dt>Disconnects and late arrivals</dt><dd>Your seat is held for two minutes if you disconnect. If fewer than three players remain connected, the match pauses. It resumes when enough players return or ends if too few seats remain. New arrivals can watch until the next match.</dd></div>
        <div><dt>Rematches</dt><dd>After the final leaderboard, the host can start a fresh match with the connected players or return to the lobby.</dd></div>
      </dl>
    </details>
    <p class="help-note">Open <strong>Card list</strong> at the table to read, submit, and vote with the keyboard.</p>`
}
