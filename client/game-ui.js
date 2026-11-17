import { button, escapeHtml as safe } from './ui.js'
import { icon } from './icons.js'

const phases = { select: 'Choose a response', reveal: 'Responses revealed', vote: 'Cast your vote', results: 'Round results' }

function scores(match, selfId, winners = []) {
  return `<ol class="scores" aria-label="Leaderboard">${match.ranked.map(player => `<li class="${winners.includes(player.id) ? 'winner' : ''}">
    <span>${safe(player.name)}${player.id === selfId ? ' (you)' : ''}</span><strong>${player.points}</strong>
  </li>`).join('')}</ol>`
}

export function gameMarkup(room, disabled) {
  const match = room.match
  if (match.phase === 'finished') return finalResults(room, disabled)
  const winners = match.responses.filter(response => response.winner)
  const roundSummary = match.phase !== 'results' ? '' : winners.length ? `<div class="round-summary" role="status">
    ${icon('trophy')}<div><strong>${winners.length > 1 ? 'Round tie' : safe(winners[0].author)} · ${winners[0].points} ${winners[0].points === 1 ? 'vote' : 'votes'}</strong>
    ${winners.length === 1 ? `<span>${safe(winners[0].text)}</span>` : `<span>${winners.map(winner => safe(winner.author)).join(', ')}</span>`}</div>
  </div>` : '<p>No votes were cast this round.</p>'
  return `<section class="match panel" data-phase="${match.phase}">
    <header><h1>${phases[match.phase]}</h1><strong id="countdown" aria-label="Time remaining"></strong></header>
    <div class="game-meta"><span>${icon('stack')} ${match.remaining} in deck</span><span>${icon('cards')} ${match.submittedCount} submitted</span></div>
    <blockquote class="scenario">${safe(match.scenario.text)}</blockquote>
    ${match.paused ? '<p role="status">Match paused. Waiting for at least three players to reconnect.</p>' : ''}
    ${match.spectator ? '<p role="status">Spectating. You can play in the next match.</p>' : ''}
    ${match.phase === 'select' && !match.canSubmit && !match.paused && !match.spectator ? '<p role="status">Response locked in.</p>' : ''}
    ${match.phase === 'vote' && match.voted ? '<p role="status">Vote locked in.</p>' : ''}
    ${match.phase === 'vote' && !match.canVote && !match.voted && !match.paused && !match.spectator ? '<p role="status">Submit a response next round to vote.</p>' : ''}
    <details class="table-controls" ${document.body.classList.contains('has-scene') ? '' : 'open'}>
    <summary>Card list</summary>
    ${match.responses.length ? `<div class="responses" aria-label="Revealed responses">${match.responses.map(response =>
      `<article class="${response.winner ? 'winner' : ''}">
        <button class="response" type="button" data-action="vote" data-card="${response.id}"
          ${disabled || !match.canVote || response.own ? 'disabled' : ''}>${safe(response.text)}</button>
        ${response.own ? '<small>Your Card</small>' : ''}
        ${match.phase === 'results' ? `<small>${safe(response.author)} · ${response.points} ${response.points === 1 ? 'vote' : 'votes'}</small>` : ''}
      </article>`).join('')}</div>` : ''}

    ${match.phase === 'select' && match.hand.length ? `<div class="hand" aria-label="Your hand">${match.hand.map(card =>
      `<button type="button" data-action="submit" data-card="${card.id}" ${disabled || !match.canSubmit ? 'disabled' : ''}>${safe(card.text)}</button>`).join('')}</div>` : ''}
    </details>
    ${roundSummary}
    <aside class="score-panel"><h2>Scores</h2>${scores(match, room.selfId)}</aside>
    <div class="actions">${button('Settings', 'settings', { glyph: 'gear' })}${button('Leave Room', 'leave', { disabled, glyph: 'signOut' })}</div>
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
