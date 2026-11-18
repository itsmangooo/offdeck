import { io } from 'socket.io-client'
import { DEFAULT_CONFIG, ROOM_ID, errors, nickname } from '../shared/protocol.js'
import { readNickname, saveNickname, readSettings, saveSettings, readAgeConfirmation, saveAgeConfirmation } from './preferences.js'
import { button, escapeHtml } from './ui.js'
import { gameMarkup } from './game-ui.js'
import { TableAudio } from './audio.js'
import { settingsMarkup } from './settings-ui.js'
import { rulesMarkup } from './rules-ui.js'
import { Tutorial } from './tutorial.js'
import { tutorialMarkup } from './tutorial-ui.js'
import { icon } from './icons.js'
import '@fontsource-variable/geist'
import './style.css'

const app = document.querySelector('#app')
const notice = document.querySelector('#notice')
const view = document.querySelector('#view')
const modal = document.querySelector('#modal')
let viewMarkup
let modalMarkup
const socket = io({ transports: ['websocket'], autoConnect: false })
let storage
try { storage = window.localStorage } catch {}
let age = readAgeConfirmation(storage) ? 'confirmed' : 'pending'
let name = readNickname(storage)
let settings = readSettings(storage, matchMedia('(prefers-reduced-motion: reduce)').matches)
const audio = new TableAudio()
audio.configure(settings)
for (const event of ['pointerdown','keydown']) {
  document.addEventListener(event, input => { if (age === 'confirmed' && input.isTrusted) audio.unlock() }, { capture: true })
}
let room = null
let receivedAt = 0
let panel = null
let tutorial
let opener = null
let pending = false
let resumeQueued = false
let seatSnapshot = false
let messageTimer
let copiedRoom
let copyTimer
let viewKind
let invite = readInvite()
let publicOrigin = location.origin
let scene
const canvasArea = document.querySelector('#scene')
document.body.classList.toggle('reduced-motion',settings.reduced)

function connectToGame() {
  document.body.classList.add('loading-scene')

  import('./scene/index.js').then(({ TableScene }) => {
    scene = new TableScene(canvasArea,settings)
    scene.sync(tutorial?.table ?? room)
    canvasArea.addEventListener('cardhover', event => {
      if (tutorial?.step === 1 && event.detail?.hand) previewTutorialCard(event.detail)
      if (event.detail && !panel) audio.play('hover')
    })
    canvasArea.addEventListener('cardaction', event => {
      if (tutorial) practiceCard(event.detail.action, event.detail.id)
      else if (!panel) playCard(event.detail.action, event.detail.id)
    })
    canvasArea.addEventListener('owncard', () => {
      if (!tutorial) feedback('OWN_CARD')
    })
    canvasArea.addEventListener('scenarioinspection', event => {
      const close = document.querySelector('#close-inspection')
      if (event.detail) {
        close.hidden = false
        if (view.contains(document.activeElement)) close.focus({ preventScroll: true })
      } else {
        const restoreFocus = document.activeElement === close
        close.hidden = true
        if (restoreFocus) view.querySelector('[data-action="inspect"]')?.focus({ preventScroll: true })
      }
    })
    document.body.classList.add('has-scene')
    canvasArea.addEventListener('sceneunavailable', () => {
      document.body.classList.remove('has-scene')
      feedback('The 3D view was interrupted. You can continue with the card list.')
      render()
    })
    canvasArea.addEventListener('scenerestored', () => {
      document.body.classList.add('has-scene')
      render()
    })
  }).catch(error => {
    console.error('Could not initialize the 3D view', error)
    feedback('The 3D view could not load. Card controls are available.')
  }).finally(() => {
    document.body.classList.remove('loading-scene')
    render()
  })

  fetch('/api/config').then(response => response.json()).then(config => {
    if (config.publicOrigin) publicOrigin = config.publicOrigin
    render()
  }).catch(() => {})

  socket.auth = { adult: true }
  socket.connect()
}

document.querySelector('#close-inspection').addEventListener('click', () => scene?.inspectScenario(false))
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && scene?.cards.inspecting) scene.inspectScenario(false)
})

function readInvite() {
  const match = /^\/sid\/([^/]+)\/?$/.exec(location.pathname)
  return match?.[1] ?? (location.pathname.startsWith('/sid/') ? 'invalid' : null)
}

function remember(id, token) {
  try {
    const key = 'offdeck.seat.' + id
    if (token) storage.setItem(key, token)
    else storage.removeItem(key)
  } catch {}
}

function savedSeat(id) {
  try {
    return storage.getItem('offdeck.seat.' + id)
  } catch {
    return null
  }
}

function navigate(id = null) {
  invite = id
  const path = id ? '/sid/' + id + '/' : '/'
  if (location.pathname !== path) history.replaceState(null, '', path)
}

function feedback(code) {
  notice.textContent = errors[code] ?? code
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => { notice.textContent = '' }, 6000)
}

async function request(event, payload = {}, complete) {
  if (tutorial || pending) return
  if (!socket.connected) {
    feedback('UNAVAILABLE')
    return
  }
  pending = true
  render()
  try {
    const result = await socket.timeout(5000).emitWithAck(event, payload)
    if (result.ok) {
      if (event === 'match:submit') audio.play('submit')
      if (event === 'match:vote') audio.play('vote')
      complete?.(result)
    } else feedback(result.code)
    return result
  } catch {
    feedback('UNAVAILABLE')
  } finally {
    pending = false
    render()
    if (resumeQueued) {
      resumeQueued = false
      queueMicrotask(() => enter())
    }
  }
}

async function enter(id = invite) {
  if (!id || !name || !socket.connected || pending) return
  if (!ROOM_ID.test(id)) {
    feedback('BAD_LINK')
    return
  }
  const token = savedSeat(id)
  if (token) {
    const resume = await request('room:resume', { id, token }, joined)
    if (resume?.ok) {
      const self = room?.players.find(player => player.id === room.selfId)
      if (self && self.name !== name) await request('player:name', { name })
      return
    }
    if (!resume || !['BAD_SESSION','ROOM_GONE'].includes(resume.code)) return
    remember(id, null)
    room = null
    render()
    if (resume.code === 'ROOM_GONE') return
  }
  await request('room:join', { id, name }, joined)
}

function joined({ id, token }) {
  navigate(id)
  remember(id, token)
  panel = null
  notice.textContent = ''
}

function leave() {
  if (room) {
    request('room:leave', {}, () => {
      remember(room.id, null)
      room = null
      panel = null
      navigate()
    })
  } else {
    navigate()
    panel = null
    notice.textContent = ''
    render()
  }
}

socket.on('connect', () => {
  render()
  if (invite && pending) resumeQueued = true
  else if (invite) enter()
})
socket.on('room:seat', seat => {
  seatSnapshot = true
  joined(seat)
})
socket.on('connect_error', () => { feedback('UNAVAILABLE'); render() })
socket.on('disconnect', () => render())
socket.on('room:state', state => {
  const previous = room?.match
  const incoming = state.match
  const catchUp = seatSnapshot
  seatSnapshot = false
  if (!catchUp && incoming && (incoming.phase !== previous?.phase || incoming.roundId !== previous?.roundId)) {
    const cue = { select: previous?.phase === 'results' ? 'draw' : 'deal', reveal: 'flip', results: 'results', finished: 'finished' }[incoming.phase]
    if (cue) audio.play(cue)
  }
  room = catchUp ? { ...state,seatSnapshot:true } : state
  receivedAt = performance.now()
  render()
  if (!catchUp && !settings.reduced && previous && incoming?.phase !== previous.phase) {
    if (incoming?.phase === 'results') {
      for (const total of view.querySelectorAll('.score-delta,.round-summary')) {
        total.animate([{opacity:.2,translate:'0 5px'},{opacity:1,translate:'0 0'}],
          {duration:270,easing:'ease-out'})
      }
    }
    if (incoming?.phase === 'finished' && incoming.outcome === 'complete') {
      view.querySelector('.result-mark')?.animate(
        [{transform:'scale(.88)',opacity:.55},{transform:'scale(1.09)',opacity:1},{transform:'scale(1)'}],
        {duration:420,easing:'ease-out'})
    }
  }
  clock()
})
socket.on('room:closed', code => {
  if (code !== 'REPLACED' && invite) remember(invite, null)
  room = null
  navigate()
  panel = null
  feedback(code)
  render()
})

function nameField() {
  return `<label>Nickname<input name="name" value="${escapeHtml(name)}" required maxlength="48" autocomplete="nickname"></label>`
}

function menu() {
  return `<section class="menu panel">
    <div class="menu-mark" aria-hidden="true">♦</div>
    <h1>OFFDECK<span>.</span></h1>
    <p>An 18+ party card game for 3–8 players.</p>
    <nav aria-label="Main menu">
      ${button('Play', 'play', { primary: true, glyph: 'play', className: 'menu-play' })}
      <div class="menu-rooms">
        ${button('Create Room', 'create', { glyph: 'cards' })}
        ${button('Join Room', 'join', { glyph: 'door' })}
      </div>
      <div class="menu-links">
        ${button('Game Rules', 'rules', { glyph: 'question' })}
        ${button('How to Play', 'tutorial', { glyph: 'cards' })}
        ${button('Settings', 'settings', { glyph: 'gear' })}
      </div>
    </nav>
  </section>`
}

function lobby() {
  const self = room.players.find(player => player.id === room.selfId)
  const connected = room.players.filter(player => player.connected).length
  const link = publicOrigin + '/sid/' + room.id + '/'
  return `<section class="lobby panel">
    <header><h1>Room lobby</h1><span class="capacity">${icon('users')} ${connected}/${room.config.capacity} connected</span></header>
    <ul aria-label="Players">${room.players.map(player => `<li>
      <span class="lobby-player"><i class="player-dot ${player.connected ? 'online' : ''}" aria-hidden="true"></i><span class="player-name">${escapeHtml(player.name)}${player.id === room.selfId ? ' (you)' : ''}</span></span>
      <span class="seat-labels">
        ${player.id === room.hostId ? '<small class="host-label">Host</small>' : ''}
        <small class="${player.connected ? (player.ready ? 'ready' : '') : 'offline'}">${player.connected ? (player.ready ? 'Ready' : 'Seated') : 'Reconnecting'}</small>
      </span>
    </li>`).join('')}</ul>
    <div class="invitation">
      <label for="invitation">Invitation link</label>
      ${button(copiedRoom === room.id ? 'Copied' : 'Copy Link','copy',{glyph:copiedRoom === room.id ? 'check' : 'copy'})}
      <input id="invitation" readonly value="${escapeHtml(link)}" title="${escapeHtml(link)}">
      <span class="sr-only" role="status">${copiedRoom === room.id ? 'Invitation copied.' : ''}</span>
    </div>
    ${room.hostId === room.selfId && connected < 3 ? '<p class="lobby-status">Three connected players are needed to start.</p>' : ''}
    ${room.hostId === room.selfId ? button('Start Game','start',{primary:true,glyph:'play',className:'start-game',disabled:pending || !socket.connected || connected < 3}) : ''}
    <div class="actions">
      ${button(self?.ready ? 'Unready' : 'Ready','ready',{glyph:'check',primary:room.hostId !== room.selfId,disabled:pending || !socket.connected})}
      ${button('Game Rules','rules',{glyph:'question'})}
      ${button('Settings','settings',{glyph:'gear'})}
      ${button('Leave Room','leave',{glyph:'signOut',disabled:pending})}
    </div>
  </section>`
}

function dialog(title, content, close = true, className = '') {
  return `<div class="shade"><section class="panel dialog ${className}" role="dialog" aria-modal="true" aria-label="${title}">
    <header><h2>${title}</h2>${close ? button('Close', 'close', { glyph: 'close', className: 'quiet' }) : ''}</header>${content}
  </section></div>`
}

function overlay() {
  const submit = (label, disabled = pending) => `<button class="primary" ${disabled ? 'disabled' : ''}>${label}</button>`
  if (age === 'pending') return dialog('OFFDECK — 18+', `<p>This game contains explicit language, sexual humor, dark comedy, and mature themes.</p>
    <div class="actions">${button('I am 18 or older', 'age-confirm', { primary: true })}${button('Leave', 'age-leave')}</div>`, false)
  if (age === 'declined') return ''
  if (!name) return dialog('Welcome to OFFDECK', `<p>Choose your nickname.</p><form data-form="nickname">${nameField()}${submit('Continue', false)}</form>`, false)
  if (tutorial) return tutorialMarkup(tutorial)
  if (panel === 'settings') return dialog('Settings', settingsMarkup(settings, nameField(), pending))
  if (panel === 'leave') return dialog('Leave match?', `<p>Leaving frees your seat and may end the match for the remaining players.</p><div class="actions">${button('Stay at Table','close',{primary:true})}${button('Leave Room','leave-confirm',{glyph:'signOut',disabled:pending})}</div>`)
  if (panel === 'rules') return dialog('Game Rules', rulesMarkup(), true, 'rules-dialog')
  if (panel === 'play') return dialog('Play', `<div class="actions">${button('Create Room', 'create', { primary: true })}${button('Join Room', 'join')}</div>`)
  if (panel === 'create') return dialog('Create Room', `<form data-form="create">
    <label>Seats<input name="capacity" type="number" min="3" max="8" value="${DEFAULT_CONFIG.capacity}" required></label>
    <label>Response time in seconds<input name="selectSeconds" type="number" min="15" max="120" value="${DEFAULT_CONFIG.selectSeconds}" required></label>
    <label>Voting time in seconds<input name="voteSeconds" type="number" min="10" max="90" value="${DEFAULT_CONFIG.voteSeconds}" required></label>
    ${submit(pending ? 'Creating…' : 'Create Room', pending || !socket.connected)}
  </form>`)
  if (panel === 'join' || (!room && invite)) return dialog('Join Room', `<form data-form="join">
    <label>Invitation link<input name="invitation" placeholder="Paste your invitation link" spellcheck="false" value="${ROOM_ID.test(invite ?? '') ? escapeHtml(location.href) : ''}" required></label>
    ${submit(pending ? 'Joining…' : 'Join Room', pending || !socket.connected)}
  </form>`)
  return ''
}

function render() {
  scene?.sync(tutorial?.table ?? room)
  const focused = document.activeElement
  const field = focused?.name
  // Leave an open form in place across unrelated room updates.
  const kind = room?.match ? room.match.phase === 'finished' ? 'final' : 'match' : room ? 'lobby' : 'menu'
  const base = room?.match ? gameMarkup(room,pending || !socket.connected) : room ? lobby() : menu()
  const loading = document.body.classList.contains('loading-scene') ? '<div class="render-loading" role="status">Opening the card room…</div>' : ''
  const gameHtml = `${base}${loading}${!socket.connected ? `<div class="connection" role="status">${room ? 'Reconnecting to the room…' : 'Connecting to OFFDECK…'}</div>` : ''}`
  const html = tutorial ? '' : age === 'confirmed' ? gameHtml : age === 'declined' ?
    `<section class="panel age-exit"><h1>You left OFFDECK.</h1>
      <p>OFFDECK is for players aged 18 and older.</p>${button('Back to age confirmation', 'age-return')}</section>` : ''
  if (viewMarkup !== html) {
    const listExpanded = view.querySelector('.table-controls')?.open
    const inView = view.contains(focused)
    view.innerHTML = html
    viewMarkup = html
    const list = view.querySelector('.table-controls')
    if (listExpanded && list) list.open = true
    if (inView && !view.inert) {
      const next = focused.tagName === 'SUMMARY' ? list?.querySelector('summary')
        : [...view.querySelectorAll('[data-action],input')].find(control =>
          (focused.id && control.id === focused.id) ||
          (focused.dataset.action && control.dataset.action === focused.dataset.action &&
            control.dataset.card === focused.dataset.card))
      next?.focus({preventScroll:true})
    }
    if (viewKind && kind !== viewKind && !settings.reduced && (kind === 'lobby' || kind === 'menu')) {
      view.firstElementChild?.animate([{opacity:.72,translate:'0 7px'},{opacity:1,translate:'0 0'}],
        {duration:210,easing:'ease-out'})
    }
    viewKind = kind
  }
  const dialogHtml = overlay()
  if (modalMarkup === dialogHtml) {
    clock()
    return
  }
  const openForm = modal.querySelector('.dialog form')
  const prior = openForm ? [...openForm.elements].filter(control => control.name)
    .map(control => ({ key: control.name, value: control.value, checked: control.checked })) : []
  const formType = openForm?.dataset.form
  const oldTitle = modal.querySelector('[role="dialog"]')?.getAttribute('aria-label')
  const closing = modalMarkup && !dialogHtml
  modal.innerHTML = dialogHtml
  modalMarkup = dialogHtml
  const newTitle = modal.querySelector('[role="dialog"]')?.getAttribute('aria-label')
  const opening = newTitle && oldTitle !== newTitle
  view.inert = Boolean(dialogHtml)
  const newForm = modal.querySelector('.dialog form')
  if (newForm?.dataset.form === formType) {
    for (const { key, value, checked } of prior) {
      const input = newForm?.elements.namedItem(key)
      if (!input) continue
      if (input.type === 'checkbox') input.checked = checked
      else input.value = value
      if (input.type === 'range') {
        const output = input.previousElementSibling.querySelector('output')
        if (output) output.value = value + input.dataset.unit
      }
    }
  }
  if (tutorial) {
    modal.querySelector('[data-tutorial-title]')?.focus({ preventScroll: true })
  } else if (opening) {
    (modal.querySelector('input, select') || modal.querySelector('button'))?.focus()
  } else if (field && focused !== document.body) {
    const replacement = [...modal.querySelectorAll('input,select')].find(input => input.name === field)
    replacement?.focus()
  }
  if (closing && opener) {
    view.querySelector('[data-action="' + opener + '"]')?.focus()
    opener = null
  }
  clock()
}

function clock() {
  const display = document.querySelector('#countdown')
  if (!display) return
  const match = room?.match
  const serverTime = room.serverNow + performance.now() - receivedAt
  const seconds = match?.deadline ? Math.max(0, Math.ceil((match.deadline - serverTime) / 1000)) : null
  const text = seconds === null ? 'Paused' : seconds + 's'
  if (display.textContent !== text) display.textContent = text
}

setInterval(clock, 150)

function playCard(action, id) {
  if (!room?.match) return
  const roundId = room.match.roundId
  if (action === 'submit') {
    if (!pending && socket.connected) audio.play('select')
    return request('match:submit', { cardId: id, roundId })
  }
  if (action === 'vote') return request('match:vote', { responseId: id, roundId })
}

function previewTutorialCard(card) {
  const preview = document.querySelector('#tutorial-card-preview')
  if (preview && card && preview.textContent !== card.text) {
    preview.textContent = card.text
    preview.hidden = false
  }
}

function practiceCard(action, id) {
  if (tutorial?.choose(action, id)) render()
}

function moveTutorial(offset) {
  if (!tutorial?.move(offset)) return
  scene?.inspectScenario(false, true)
  render()
  if (!settings.reduced) {
    const transition = [{ opacity: .65, translate: '0 5px' }, { opacity: 1, translate: '0 0' }]
    modal.querySelector('[data-tutorial-title]')?.animate(transition, { duration: 180, easing: 'ease-out' })
    const score = modal.querySelector('[data-tutorial-score]')
    if (score) {
      score.firstChild.textContent = '0 '
      score.animate(transition, { duration: 340, easing: 'ease-out' }).onfinish = () => {
        score.firstChild.textContent = '1 '
      }
    }
  }
}

function finishTutorial(play) {
  scene?.inspectScenario(false, true)
  tutorial = null
  panel = play ? 'play' : null
}

app.addEventListener('click', async event => {
  const control = event.target.closest('[data-action]')
  const action = control?.dataset.action
  if (!action) return
  if (age !== 'confirmed') {
    if (action === 'age-confirm' && age === 'pending') {
      age = 'confirmed'
      saveAgeConfirmation(storage)
      connectToGame()
    } else if (action === 'age-leave') age = 'declined'
    else if (action === 'age-return') age = 'pending'
    render()
    if (age === 'declined') view.querySelector('[data-action="age-return"]')?.focus()
    else if (age === 'confirmed' && name && !invite) view.querySelector('[data-action="play"]')?.focus()
    return
  }
  if (['play', 'create', 'join', 'rules', 'settings'].includes(action)) {
    if (view.contains(control)) opener = action
    panel = action
  }
  if (action === 'tutorial' && !room && !pending) {
    if (view.contains(control)) opener = action
    panel = 'tutorial'
    tutorial = new Tutorial()
  }
  if (action === 'tutorial-next' || action === 'tutorial-back') moveTutorial(action === 'tutorial-next' ? 1 : -1)
  if (action === 'tutorial-preview') {
    const card = tutorial?.table.match?.hand[0]
    previewTutorialCard(card)
    if (card) scene?.hover(scene.cards.views.get('hand:' + card.id))
  }
  if (action === 'tutorial-inspect') scene?.inspectScenario()
  if (action === 'tutorial-submit' || action === 'tutorial-vote') practiceCard(action.slice(9), control.dataset.card)
  if (tutorial && (action === 'tutorial-skip' || action === 'tutorial-play')) finishTutorial(action === 'tutorial-play')
  if (action === 'close') {
    if (!room && invite) leave()
    panel = null
  }
  if (action === 'inspect') scene?.inspectScenario()
  if (action === 'leave') {
    if (room?.match && room.match.phase !== 'finished' && !room.match.spectator) {
      opener = action
      panel = 'leave'
    } else leave()
  }
  if (action === 'leave-confirm') leave()
  if (action === 'start') request('match:start')
  if (action === 'lobby') request('match:lobby')
  if (action === 'submit' || action === 'vote') playCard(action, control.dataset.card)
  if (action === 'ready') {
    const self = room.players.find(player => player.id === room.selfId)
    await request('player:ready',{ready:!self.ready})
    if (!event.detail) view.querySelector('[data-action="ready"]')?.focus({preventScroll:true})
  }
  if (action === 'copy') {
    const field = document.querySelector('#invitation')
    if (!field || !room) return
    const id = room.id
    try {
      await navigator.clipboard.writeText(field.value)
      if (room?.id === id) {
        copiedRoom = id
        clearTimeout(copyTimer)
        copyTimer = setTimeout(() => {
          copiedRoom = null
          render()
        },2100)
      }
    } catch {
      field.focus()
      field.select()
      feedback('Press Ctrl+C or Command+C to copy the invitation.')
    }
  }
  render()
})

modal.addEventListener('keydown', event => {
  if (event.key === 'Escape' && name) {
    if (tutorial && !scene?.cards.inspecting) modal.querySelector('[data-action="tutorial-skip"]')?.click()
    else modal.querySelector('[data-action="close"]')?.click()
  }
  if (event.key !== 'Tab') return
  const controls = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary')]
  const edge = event.shiftKey ? controls[0] : controls.at(-1)
  if (document.activeElement === edge || (event.shiftKey && document.activeElement?.hasAttribute('data-tutorial-title'))) {
    event.preventDefault()
    const next = event.shiftKey ? controls.at(-1) : controls[0]
    next?.focus()
  }
})

modal.addEventListener('input', event => {
  const input = event.target
  if (input.type !== 'range') return
  const output = input.previousElementSibling?.querySelector('output')
  if (output) output.value = input.value + input.dataset.unit
})

app.addEventListener('submit', async event => {
  event.preventDefault()
  if (age !== 'confirmed') return
  const fields = Object.fromEntries(new FormData(event.target))
  if (event.target.dataset.form === 'nickname') {
    const updated = nickname(fields.name)
    if (!updated) return feedback('BAD_NAME')
    const persist = () => {
      name = saveNickname(storage, updated)
      panel = null
      render()
    }
    if (room) await request('player:name', { name: updated }, persist)
    else {
      persist()
      if (invite) enter()
    }
  }
  if (event.target.dataset.form === 'settings') {
    const updated = nickname(fields.name)
    if (!updated) return feedback('BAD_NAME')
    const next = {
      master: Number(fields.master), effects: Number(fields.effects), muted: fields.muted === 'on',
      quality: fields.quality, reduced: fields.reduced === 'on', sensitivity: Number(fields.sensitivity)
    }
    const apply = () => {
      if (updated !== name) name = saveNickname(storage,updated)
      settings = next
      saveSettings(storage,settings)
      audio.configure(settings)
      document.body.classList.toggle('reduced-motion',settings.reduced)
      scene?.configure(settings)
      panel = null
      render()
    }
    if (room && updated !== name) await request('player:name', { name: updated }, apply)
    else apply()
  }
  if (event.target.dataset.form === 'create') {
    const config = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, Number(value)]))
    request('room:create', { name, config }, joined)
  }
  if (event.target.dataset.form === 'join') {
    const input = fields.invitation.trim()
    let id = input
    if (!ROOM_ID.test(id)) {
      try { id = /^\/sid\/([^/]+)\/?$/.exec(new URL(input, location.origin).pathname)?.[1] } catch {}
    }
    if (!ROOM_ID.test(id ?? '')) return feedback('BAD_LINK')
    await enter(id)
  }
})

if (age === 'confirmed') connectToGame()
render()
