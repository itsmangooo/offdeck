import { io } from 'socket.io-client'
import { DEFAULT_CONFIG, ROOM_ID, errors, nickname } from '../shared/protocol.js'
import { readNickname, saveNickname } from './preferences.js'
import { button, escapeHtml } from './ui.js'
import { gameMarkup } from './game-ui.js'
import './style.css'

const app = document.querySelector('#app')
const notice = document.querySelector('#notice')
const view = document.querySelector('#view')
const modal = document.querySelector('#modal')
let viewMarkup
let modalMarkup
const socket = io({ transports: ['websocket'] })
const storage = window.localStorage
let name = readNickname(storage)
let room = null
let receivedAt = 0
let panel = null
let pending = false
let messageTimer
let invite = readInvite()
let publicOrigin = location.origin
let scene
const canvasArea = document.querySelector('#scene')
document.body.classList.add('loading-scene')

import('./scene/index.js').then(({ TableScene }) => {
  scene = new TableScene(canvasArea)
  scene.sync(room)
  canvasArea.addEventListener('cardaction', event => {
    if (!panel) playCard(event.detail.action, event.detail.id)
  })
  canvasArea.addEventListener('owncard', () => feedback('OWN_CARD'))
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
  if (pending) return
  if (!socket.connected) {
    feedback('UNAVAILABLE')
    return
  }
  pending = true
  render()
  try {
    const result = await socket.timeout(5000).emitWithAck(event, payload)
    if (result.ok) complete?.(result)
    else feedback(result.code)
    return result
  } catch {
    feedback('UNAVAILABLE')
  } finally {
    pending = false
    render()
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
    if (resume?.ok || !resume || resume.code !== 'BAD_SESSION') return
    remember(id, null)
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
  if (invite) enter()
})
socket.on('connect_error', () => { feedback('UNAVAILABLE'); render() })
socket.on('disconnect', () => render())
socket.on('room:state', state => {
  room = state
  receivedAt = performance.now()
  render()
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
    <h1>OFFDECK<span>.</span></h1>
    <p>Read the room. Play your best card.</p>
    <nav aria-label="Main menu">
      ${button('Play', 'play', { primary: true })}
      ${button('Create Room', 'create')}
      ${button('Join Room', 'join')}
      ${button('How to Play', 'help')}
      ${button('Settings', 'settings')}
    </nav>
  </section>`
}

function lobby() {
  const self = room.players.find(player => player.id === room.selfId)
  const connected = room.players.filter(player => player.connected).length
  const link = publicOrigin + '/sid/' + room.id + '/'
  return `<section class="lobby panel">
    <header><h1>Room lobby</h1><span>${room.players.filter(player => player.connected).length}/${room.config.capacity} connected</span></header>
    <ul aria-label="Players">${room.players.map(player => `<li>
      <span>${escapeHtml(player.name)}${player.id === room.selfId ? ' (you)' : ''}</span>
      <small>${player.id === room.hostId ? 'Host · ' : ''}${player.connected ? (player.ready ? 'Ready' : 'Seated') : 'Reconnecting'}</small>
    </li>`).join('')}</ul>
    <label>Invitation link<input id="invitation" readonly value="${escapeHtml(link)}"></label>
    <div class="actions">
      ${room.hostId === room.selfId ? button('Start Game', 'start', { primary: true, disabled: pending || !socket.connected || connected < 3 }) : ''}
      ${button('Copy Link', 'copy')}
      ${button(self?.ready ? 'Unready' : 'Ready', 'ready', { primary: true, disabled: pending || !socket.connected })}
      ${button('Settings', 'settings')}
      ${button('Leave Room', 'leave', { disabled: pending })}
    </div>
  </section>`
}

function dialog(title, content, close = true) {
  return `<div class="shade"><section class="panel dialog" role="dialog" aria-modal="true" aria-label="${title}">
    <header><h2>${title}</h2>${close ? button('Close', 'close') : ''}</header>${content}
  </section></div>`
}

function overlay() {
  const submit = (label, disabled = pending) => `<button class="primary" ${disabled ? 'disabled' : ''}>${label}</button>`
  if (!name) return dialog('Welcome to OFFDECK', `<p>Choose your nickname.</p><form data-form="nickname">${nameField()}${submit('Continue', false)}</form>`, false)
  if (panel === 'settings') return dialog('Settings', `<form data-form="nickname">${nameField()}${submit('Save Settings')}</form>`)
  if (panel === 'help') return dialog('How to Play', '<p>Invite 3–8 players. Play one response to each scenario, then vote for another player’s anonymous card. Each vote received earns one point. Play continues until the scenario deck is empty.</p>')
  if (panel === 'play') return dialog('Play', `<div class="actions">${button('Create Room', 'create', { primary: true })}${button('Join Room', 'join')}</div>`)
  if (panel === 'create') return dialog('Create Room', `<form data-form="create">
    <label>Seats<input name="capacity" type="number" min="3" max="8" value="${DEFAULT_CONFIG.capacity}" required></label>
    <label>Response time in seconds<input name="selectSeconds" type="number" min="15" max="120" value="${DEFAULT_CONFIG.selectSeconds}" required></label>
    <label>Voting time in seconds<input name="voteSeconds" type="number" min="10" max="90" value="${DEFAULT_CONFIG.voteSeconds}" required></label>
    ${submit('Create Room', pending || !socket.connected)}
  </form>`)
  if (panel === 'join' || (!room && invite)) return dialog('Join Room', `<form data-form="join">
    <label>Invitation link<input name="invitation" placeholder="Paste your invitation link" value="${ROOM_ID.test(invite ?? '') ? escapeHtml(location.href) : ''}" required></label>
    ${submit('Join Room', pending || !socket.connected)}
  </form>`)
  return ''
}

function render() {
  scene?.sync(room)
  const focused = document.activeElement
  const field = focused?.name
  // Leave an open form in place across unrelated room updates.
  const base = room?.match ? gameMarkup(room, pending || !socket.connected) : room ? lobby() : menu()
  const loading = document.body.classList.contains('loading-scene') ? '<div class="render-loading" role="status">Opening the card room…</div>' : ''
  const html = `${base}${loading}${!socket.connected ? '<div class="connection" role="status">Connecting to OFFDECK…</div>' : ''}`
  if (viewMarkup !== html) {
    const listExpanded = view.querySelector('.table-controls')?.open
    view.innerHTML = html
    viewMarkup = html
    const list = view.querySelector('.table-controls')
    if (listExpanded && list) list.open = true
  }
  const dialogHtml = overlay()
  if (modalMarkup === dialogHtml) {
    clock()
    return
  }
  const openForm = modal.querySelector('.dialog form')
  const prior = openForm && !pending ? [...new FormData(openForm)] : []
  const formType = openForm?.dataset.form
  modal.innerHTML = dialogHtml
  modalMarkup = dialogHtml
  const newForm = modal.querySelector('.dialog form')
  if (newForm?.dataset.form === formType) {
    for (const [key, value] of prior) {
      const input = newForm?.elements.namedItem(key)
      if (input) input.value = value
    }
  }
  if (field && focused !== document.body) {
    const replacement = [...modal.querySelectorAll('input')].find(input => input.name === field)
    replacement?.focus()
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
  if (action === 'submit') return request('match:submit', { cardId: id, roundId })
  if (action === 'vote') return request('match:vote', { responseId: id, roundId })
}

app.addEventListener('click', async event => {
  const control = event.target.closest('[data-action]')
  const action = control?.dataset.action
  if (!action) return
  if (['play', 'create', 'join', 'help', 'settings'].includes(action)) panel = action
  if (action === 'close') {
    if (!room && invite) leave()
    panel = null
  }
  if (action === 'leave') leave()
  if (action === 'start') request('match:start')
  if (action === 'lobby') request('match:lobby')
  if (action === 'submit' || action === 'vote') playCard(action, control.dataset.card)
  if (action === 'ready') {
    const self = room.players.find(player => player.id === room.selfId)
    request('player:ready', { ready: !self.ready })
  }
  if (action === 'copy') {
    const field = document.querySelector('#invitation')
    try {
      await navigator.clipboard.writeText(field.value)
      feedback('Invitation copied.')
    } catch {
      field.focus()
      field.select()
      feedback('Press Ctrl+C or Command+C to copy the invitation.')
    }
  }
  render()
})

app.addEventListener('submit', async event => {
  event.preventDefault()
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

render()
