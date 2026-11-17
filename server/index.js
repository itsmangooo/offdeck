import express from 'express'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { RoomStore, RuleError, requireRule } from './rooms.js'
import { nickname } from '../shared/protocol.js'

export async function startServer({
  port = Number(process.env.PORT || 3000),
  host = process.env.HOST || '127.0.0.1',
  dev = false,
  publicOrigin = process.env.PUBLIC_ORIGIN,
  store = new RoomStore()
} = {}) {
  const origin = publicOrigin ? new URL(publicOrigin).origin : null
  const app = express()
  app.disable('x-powered-by')
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
  if (dev) {
    const { createServer: createVite } = await import('vite')
    const vite = await createVite({ server: { middlewareMode: true, hmr: { server: http } }, appType: 'spa' })
    app.use(vite.middlewares)
  } else {
    const dist = fileURLToPath(new URL('../dist/', import.meta.url))
    app.use(express.static(dist, { index: false }))
    app.get(['/', '/sid/{*path}'], (_request, response) => response.sendFile('index.html', { root: dist }))
  }

  function broadcast(room) {
    room.revision++
    for (const viewer of room.players.values()) {
      if (viewer.socketId) io.to(viewer.socketId).emit('room:state', store.snapshot(room, viewer))
    }
  }

  const timer = setInterval(() => store.sweep(broadcast, room => {
    for (const player of room.players.values()) {
      const socket = io.sockets.sockets.get(player.socketId)
      if (!socket) continue
      delete socket.data.membership
      socket.emit('room:closed', 'ROOM_GONE')
    }
  }), 1000)
  timer.unref()
  http.on('close', () => clearInterval(timer))

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
          if (member) requireRule(membership?.player.socketId === socket.id, 'NO_ROOM')
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
      broadcast(room)
      return { id: room.id, token: player.token }
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
      broadcast(room)
    })
    action('player:ready', ({ ready }, { room, player }) => {
      requireRule(typeof ready === 'boolean', 'FORBIDDEN')
      player.ready = ready
      room.touched = store.now()
      broadcast(room)
    })
    action('player:name', ({ name }, { room, player }) => {
      const normalized = nickname(name)
      requireRule(normalized, 'BAD_NAME')
      player.name = normalized
      room.touched = store.now()
      broadcast(room)
    })
    socket.on('disconnect', () => {
      const membership = socket.data.membership
      if (!membership || membership.player.socketId !== socket.id) return
      store.disconnect(membership.room, membership.player)
      broadcast(membership.room)
    })
  })

  await new Promise((resolve, reject) => {
    http.once('error', reject)
    http.listen(port, host, resolve)
  })
  const url = 'http://' + host + ':' + http.address().port
  return { url, store, close: () => new Promise(resolve => io.close(resolve)) }
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  const server = await startServer({ dev: process.argv.includes('--dev') })
  console.log('OFFDECK ' + server.url)
}
