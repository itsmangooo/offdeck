import { button, escapeHtml as safe } from './ui.js'
import { icon } from './icons.js'

const phases = { select:'Choose a response', reveal:'Responses revealed', vote:'Cast your vote', results:'Round results' }

function scores(match,selfId,winners = []) {
  return `<ol class="scores" aria-label="Leaderboard">${match.ranked.map(player => `<li class="${winners.includes(player.id) ? 'winner' : ''}">
    <span title="${safe(player.name)}">${safe(player.name)}${player.id === selfId ? ' (you)' : ''}</span><strong>${player.points}</strong>
  </li>`).join('')}</ol>`
}

function status(match) {
  if (match.paused) return 'Match paused. Waiting for at least three players to reconnect.'
  if (match.spectator) return 'Spectating. You can play in the next match.'
  if (match.phase === 'select') return match.canSubmit ? '' : 'Response locked in.'
  if (match.phase === 'vote') {
    if (match.voted) return 'Vote locked in.'
    return match.canVote ? 'Choose another player’s card.' : 'Submit a response next round to vote.'
  }
  return ''
}

function cardList(match,disabled) {
  const hasScene = document.body.classList.contains('has-scene')
  return `<details class="table-controls" ${hasScene ? '' : 'open'}>
    <summary>Card list</summary>
    <div class="card-list-content">
      <blockquote class="scenario">${safe(match.scenario.text)}</blockquote>
      ${hasScene ? button('Inspect Scenario','inspect',{ glyph:'cards' }) : ''}
      ${match.responses.length ? `<div class="responses" aria-label="Revealed responses">${match.responses.map(response =>
        `<article class="${response.winner ? 'winner' : ''}">
          <button class="response" type="button" data-action="vote" data-card="${response.id}"
            ${disabled || !match.canVote || response.own ? 'disabled' : ''}>${safe(response.text)}</button>
          ${response.own ? '<small>Your Card</small>' : ''}
          ${match.phase === 'results' ? `<small>${safe(response.author)} · ${response.points} ${response.points === 1 ? 'vote' : 'votes'}</small>` : ''}
        </article>`).join('')}</div>` : ''}
      ${match.phase === 'select' && match.hand.length ? `<div class="hand" aria-label="Your hand">${match.hand.map(card =>
        `<button type="button" data-action="submit" data-card="${card.id}" ${disabled || !match.canSubmit ? 'disabled' : ''}>${safe(card.text)}</button>`).join('')}</div>` : ''}
    </div>
  </details>`
}

function roundResults(match) {
  if (match.phase !== 'results') return ''
  const winners = match.responses.filter(response => response.winner)
  if (!winners.length) return `<div class="round-summary" role="status">${icon('trophy')} No votes were cast this round.</div>`
  const [leader] = winners
  const votes = leader.points + (leader.points === 1 ? ' vote' : ' votes')
  const tie = winners.length > 1
  return `<div class="round-summary" role="status">
    ${icon('trophy')}<div><strong>${tie ? 'Round tie' : safe(leader.author)} · ${votes}</strong>
    <span>${tie ? winners.map(card => safe(card.author)).join(', ') : safe(leader.text)}</span></div>
  </div>`
}

export function gameMarkup(room,disabled) {
  const {match} = room
  if (match.phase === 'finished') return finalResults(room,disabled)
  const message = status(match)
  const count = room.players.filter(player => player.connected).length
  const activity = match.phase === 'select' ? match.submittedCount + ' submitted' :
    match.responses.length + (match.responses.length === 1 ? ' response' : ' responses')
  return `<section class="match panel" data-phase="${match.phase}">
    <section class="phase-panel" aria-label="Match status">
      <header><h1>${phases[match.phase]}</h1><strong id="countdown" aria-label="Time remaining"></strong></header>
      <div class="game-meta">
        <span>${icon('stack')} ${match.remaining} in deck</span>
        ${match.phase !== 'results' ? `<span>${icon('cards')} ${activity}</span>` : ''}
      </div>
      ${message ? `<p class="phase-message" role="status">${message}</p>` : ''}
      ${cardList(match,disabled)}
    </section>
    <aside class="score-panel" aria-label="Scores"><h2>Scores</h2>${scores(match,room.selfId)}</aside>
    ${roundResults(match)}
    <aside class="room-tools" aria-label="Room controls">
      <div class="room-count">${icon('users')} <span>${count}/${room.config.capacity} connected</span></div>
      <div class="actions">
        ${button('Settings','settings',{glyph:'gear'})}
        ${button('Leave Room','leave',{disabled,glyph:'signOut'})}
      </div>
    </aside>
  </section>`
}

function finalResults(room, disabled) {
  const { match, players, selfId, hostId } = room
  const abandoned = match.outcome === 'abandoned'
  const winners = abandoned ? [] : match.ranked.filter(player => player.points === match.ranked[0].points)
  const names = winners.map(player => safe(player.name)).join(', ')
  const host = selfId === hostId
  const canReplay = host && players.filter(player => player.connected).length >= 3
  return `<section class="panel final-results">
    <div class="result-mark" aria-hidden="true">${icon('trophy')}</div>
    <h1>Final leaderboard</h1>
    <p class="winner-line">${abandoned ? 'Match ended because too few players could return.' : (winners.length > 1 ? 'Tied winners' : 'Winner') + ' · ' + names}</p>
    ${scores(match, selfId, winners.map(player => player.id))}
    <p class="match-stats">${match.scenariosPlayed} scenarios played · ${match.ranked.reduce((sum, player) => sum + player.points, 0)} votes received</p>
    ${match.mostVoted ? `<blockquote><strong>Most-voted response</strong>${safe(match.mostVoted.text)}<footer>${safe(match.mostVoted.author)} · ${match.mostVoted.points} ${match.mostVoted.points === 1 ? 'vote' : 'votes'}</footer></blockquote>` : ''}
    <div class="actions">
      ${host ? button('Play Again', 'start', { primary: true, disabled: disabled || !canReplay, glyph: 'play' }) : ''}
      ${host ? button('Return to Lobby', 'lobby', { disabled, glyph: 'door' }) : ''}
      ${button('Leave Room', 'leave', { disabled, glyph: 'signOut' })}
    </div>
    ${host ? '' : '<p>Waiting for the host.</p>'}
  </section>`
}
