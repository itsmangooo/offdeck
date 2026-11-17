import express from 'express'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { RoomStore, RuleError, requireRule } from './rooms.js'
import { nickname } from '../shared/protocol.js'
import { Match } from './match.js'
import { starterDecks } from './decks.js'

export async function startServer({
  port = Number(process.env.PORT || 3000),
  host = process.env.HOST || '127.0.0.1',
  dev = false,
  publicOrigin = process.env.PUBLIC_ORIGIN,
  store = new RoomStore(),
  decks = starterDecks,
  timing,
  tickMs = 150
} = {}) {
  const address = publicOrigin ? new URL(publicOrigin) : null
  if (address && !['http:', 'https:'].includes(address.protocol)) {
    throw new Error('PUBLIC_ORIGIN must use http or https')
  }
  const origin = address?.origin ?? null
  const app = express()
  app.disable('x-powered-by')
  app.use((_request, response, next) => {
    response.set('Referrer-Policy', 'same-origin')
    response.set('X-Content-Type-Options', 'nosniff')
    next()
  })
  const http = createServer(app)
  const io = new Server(http, {
    maxHttpBufferSize: 4096,
    transports: ['websocket'],
    allowRequest(request, done) {
      const source = request.headers.origin
      // Native clients may omit Origin. Browsers must originate from this site.
      done(null, !source || source === origin || ['http', 'https'].some(scheme =>
        source === scheme + '://' + request.headers.host))
    }
  })
  app.get('/healthz', (_request, response) => response.json({ ok: true }))
  app.get('/api/config', (_request, response) => response.json({ publicOrigin: origin }))
  let vite
  if (dev) {
    const { createServer: createVite } = await import('vite')
    vite = await createVite({ server: { middlewareMode: true, hmr: { server: http } }, appType: 'spa' })
    app.use(vite.middlewares)
  } else {
    const dist = fileURLToPath(new URL('../dist/', import.meta.url))
    app.use(express.static(dist, { index: false }))
    app.get(['/', '/sid/{*path}'], (_request, response) => response.sendFile('index.html', { root: dist }))
  }

  function step(room) {
    const now = store.now()
    if (!room.match?.update(room, now)) return false
    room.touched = now
    return true
  }

  function broadcast(room) {
    room.revision++
    for (const viewer of room.players.values()) {
      if (!viewer.socketId) continue
      io.to(viewer.socketId).emit('room:state', {
        ...store.snapshot(room, viewer),
        match: room.match?.view(room, viewer) ?? null
      })
    }
  }

  function publish(room) {
    step(room)
    broadcast(room)
  }

  const gameTimer = setInterval(() => {
    for (const room of store.rooms.values()) if (step(room)) broadcast(room)
  }, tickMs)
  const cleanupTimer = setInterval(() => store.sweep(publish, room => {
    for (const player of room.players.values()) {
      const socket = io.sockets.sockets.get(player.socketId)
      if (!socket) continue
      delete socket.data.membership
      socket.emit('room:closed', 'ROOM_GONE')
    }
  }), 1000)
  gameTimer.unref()
  cleanupTimer.unref()
  http.on('close', () => {
    clearInterval(gameTimer)
    clearInterval(cleanupTimer)
  })

  io.on('connection', socket => {
    let credit = 20
    let last = Date.now()

    function action(event, handler, { member = true, cost = 1 } = {}) {
      socket.on(event, (payload, ack) => {
        if (typeof ack !== 'function') return
        try {
          const now = Date.now()
          credit = Math.min(20, credit + (now - last) / 300)
          last = now
          requireRule(credit >= cost, 'SLOW_DOWN')
          credit -= cost
          const membership = socket.data.membership
          if (member) {
            requireRule(membership?.player.socketId === socket.id, 'NO_ROOM')
            if (step(membership.room)) broadcast(membership.room)
          }
          const value = handler(payload ?? {}, membership)
          ack({ ok: true, ...value })
        } catch (error) {
          if (!(error instanceof RuleError)) console.error('Room action failed', event, error)
          ack({ ok: false, code: error instanceof RuleError ? error.message : 'UNAVAILABLE' })
        }
      })
    }

    function attach({ room, player, previousSocket }) {
      const previous = io.sockets.sockets.get(previousSocket)
      if (previous && previous !== socket) {
        delete previous.data.membership
        previous.emit('room:closed', 'REPLACED')
      }
      socket.data.membership = { room, player }
      const seat = { id: room.id, token: player.token }
      socket.emit('room:seat', seat)
      publish(room)
      return seat
    }

    const guests = { member: false, cost: 4 }
    action('room:create', ({ name, config }, membership) => {
      requireRule(!membership, 'IN_ROOM')
      return attach(store.create(name, config, socket.id))
    }, guests)
    action('room:join', ({ id, name }, membership) => {
      requireRule(!membership, 'IN_ROOM')
      return attach(store.join(id, name, socket.id))
    }, guests)
    action('room:resume', ({ id, token }, membership) => {
      requireRule(!membership || (membership.room.id === id && membership.player.token === token), 'IN_ROOM')
      return attach(store.resume(id, token, socket.id))
    }, guests)
    action('room:leave', (_payload, { room, player }) => {
      delete socket.data.membership
      store.remove(room, player)
      room.touched = store.now()
      publish(room)
    })
    action('player:ready', ({ ready }, { room, player }) => {
      requireRule(!room.match, 'BAD_PHASE')
      requireRule(typeof ready === 'boolean', 'FORBIDDEN')
      player.ready = ready
      room.touched = store.now()
      broadcast(room)
    })
    action('player:name', ({ name }, { room, player }) => {
      const normalized = nickname(name)
      requireRule(normalized, 'BAD_NAME')
      player.name = normalized
      if (room.match?.roster.has(player.id)) room.match.roster.get(player.id).name = normalized
      room.touched = store.now()
      broadcast(room)
    })
    action('match:start', (_payload, { room, player }) => {
      requireRule(room.hostId === player.id, 'FORBIDDEN')
      requireRule(!room.match?.active, 'BAD_PHASE')
      room.match = new Match(room, decks, store.now(), timing)
      room.touched = store.now()
      broadcast(room)
    })
    action('match:lobby', (_payload, { room, player }) => {
      requireRule(room.hostId === player.id, 'FORBIDDEN')
      requireRule(room.match?.phase === 'finished', 'BAD_PHASE')
      room.match = null
      for (const member of room.players.values()) member.ready = false
      room.touched = store.now()
      broadcast(room)
    })
    action('match:submit', (payload, { room, player }) => {
      requireRule(room.match, 'BAD_PHASE')
      room.match.submit(room, player, payload)
      room.touched = store.now()
      publish(room)
    })
    action('match:vote', (payload, { room, player }) => {
      requireRule(room.match, 'BAD_PHASE')
      room.match.vote(room, player, payload)
      room.touched = store.now()
      publish(room)
    })
    socket.on('disconnect', () => {
      const membership = socket.data.membership
      if (!membership || membership.player.socketId !== socket.id) return
      store.disconnect(membership.room, membership.player)
      membership.room.touched = store.now()
      publish(membership.room)
    })
  })

  await new Promise((resolve, reject) => {
    http.once('error', reject)
    http.listen(port, host, resolve)
  })
  const url = 'http://' + host + ':' + http.address().port
  let closing
  return {
    url, store,
    close() {
      closing ??= Promise.all([new Promise(resolve => io.close(resolve)), vite?.close()])
      return closing
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  const server = await startServer({ dev: process.argv.includes('--dev') })
  console.log('OFFDECK ' + server.url)
}
