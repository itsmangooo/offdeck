import { icon } from './icons.js'
import { tutorialSteps } from './tutorial.js'
import { button, escapeHtml } from './ui.js'

function cardChoices(cards, action, complete) {
  return `<div class="tutorial-choices">${cards.map(card => `<button type="button" data-action="${action}"
    data-card="${card.id}" ${(card.own || complete) ? 'disabled' : ''}>${escapeHtml(card.text)}${card.own ? ' <small>Your card</small>' : ''}</button>`).join('')}</div>`
}

function practice(tutorial) {
  const { step, table, submitted, vote } = tutorial
  if (step === 1) return `<p class="tutorial-instruction">Hover over a card to lift it, or preview one here.</p>
    ${button('Preview a card', 'tutorial-preview', { glyph: 'cards' })}
    <p id="tutorial-card-preview" class="tutorial-card-preview" aria-live="polite" hidden></p>`
  if (step === 2) return `<blockquote>${escapeHtml(table.match.scenario.text)}</blockquote>
    ${button('Inspect scenario', 'tutorial-inspect', { glyph: 'cards' })}`
  if (step === 3) return submitted
    ? '<p class="tutorial-success" role="status">Response locked in. Your card is face down on the table.</p>'
    : cardChoices(table.match.hand, 'tutorial-submit', false)
  if (step === 4) return `${cardChoices(table.match.responses, 'tutorial-vote', vote)}
    ${vote ? '<p class="tutorial-success" role="status">Vote locked in.</p>' : ''}`
  if (step === 5) return `<p class="tutorial-instruction">A player voted for your response.</p>
    <dl class="tutorial-score"><div><dt>You</dt><dd data-tutorial-score>1 <span>+1</span></dd></div>
    <div><dt>Maya</dt><dd>0</dd></div><div><dt>Jules</dt><dd>0</dd></div></dl>`
  return ''
}

export function tutorialMarkup(tutorial) {
  const { step } = tutorial
  const [title, description] = tutorialSteps[step]
  const last = step === tutorialSteps.length - 1
  return `<section class="panel tutorial-panel" role="dialog" aria-modal="true" aria-label="How to Play">
    <header><p class="tutorial-progress">${icon('cards')} Practice table <span aria-label="Step ${step + 1} of ${tutorialSteps.length}">${step + 1} / ${tutorialSteps.length}</span></p></header>
    <progress class="tutorial-track" value="${step + 1}" max="${tutorialSteps.length}" aria-label="Tutorial progress"></progress>
    <h2 data-tutorial-title tabindex="-1">${title}</h2>
    <p class="tutorial-description">${description}</p>
    ${practice(tutorial)}
    <div class="tutorial-actions">
      ${button('Back', 'tutorial-back', { disabled: step === 0 })}
      ${button(last ? 'Play' : 'Next', last ? 'tutorial-play' : 'tutorial-next', { primary: true })}
    </div>
    ${button('Skip Tutorial', 'tutorial-skip', { className: 'quiet tutorial-skip' })}
  </section>`
}
