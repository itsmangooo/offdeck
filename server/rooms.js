import { randomBytes, randomUUID } from 'node:crypto'
import { DEFAULT_CONFIG, ROOM_ID, nickname } from '../shared/protocol.js'

export class RuleError extends Error {}

export function requireRule(condition, code) {
  if (!condition) throw new RuleError(code)
}

function validateConfig(input = {}) {
  const config = { ...DEFAULT_CONFIG }
  for (const [key, min, max] of [['capacity', 3, 8], ['selectSeconds', 15, 120], ['voteSeconds', 10, 90]]) {
    if (input?.[key] === undefined) continue
    const value = input[key]
    requireRule(Number.isInteger(value) && value >= min && value <= max, 'BAD_CONFIG')
    config[key] = value
  }
  return config
}

export class RoomStore {
  constructor({ now = Date.now, seatGrace = 120_000, idleLimit = 1_800_000, maxRooms = 500 } = {}) {
    Object.assign(this, { now, seatGrace, idleLimit, maxRooms })
    this.rooms = new Map()
  }

  create(name, config, socketId) {
    requireRule(this.rooms.size < this.maxRooms, 'ROOM_LIMIT')
    const room = {
      id: randomBytes(18).toString('hex'),
      config: validateConfig(config),
      players: new Map(),
      hostId: null,
      touched: this.now(),
      revision: 0,
      cardHistory: { scenarios: [], responses: new Set() }
    }
    const player = this.add(room, name, socketId)
    this.rooms.set(room.id, room)
    return { room, player }
  }

  get(id) {
    requireRule(typeof id === 'string' && ROOM_ID.test(id), 'BAD_LINK')
    const room = this.rooms.get(id)
    requireRule(room, 'ROOM_GONE')
    return room
  }

  join(id, name, socketId) {
    const room = this.get(id)
    return { room, player: this.add(room, name, socketId) }
  }

  add(room, name, socketId) {
    const normalized = nickname(name)
    requireRule(normalized, 'BAD_NAME')
    requireRule(room.players.size < room.config.capacity, 'FULL')
    const occupied = new Set([...room.players.values()].map(player => player.seat))
    const seat = Array.from({ length: 8 }, (_, index) => index).find(index => !occupied.has(index))
    const player = {
      id: randomUUID(), token: randomBytes(32).toString('hex'),
      name: normalized, seat, socketId, ready: false, disconnectedAt: null
    }
    room.players.set(player.id, player)
    room.hostId ??= player.id
    room.touched = this.now()
    return player
  }

  resume(id, token, socketId) {
    const room = this.get(id)
    requireRule(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 'BAD_SESSION')
    const player = [...room.players.values()].find(member => member.token === token)
    requireRule(player && (player.disconnectedAt === null || this.now() - player.disconnectedAt < this.seatGrace), 'BAD_SESSION')
    const previousSocket = player.socketId
    player.socketId = socketId
    player.disconnectedAt = null
    this.updateHost(room)
    room.touched = this.now()
    return { room, player, previousSocket }
  }

  disconnect(room, player) {
    player.socketId = null
    player.disconnectedAt = this.now()
    this.updateHost(room)
  }

  remove(room, player) {
    room.players.delete(player.id)
    this.updateHost(room)
    // Empty rooms are invalid immediately. Offline rooms retain reconnectable seats.
    if (!room.players.size) this.rooms.delete(room.id)
  }

  updateHost(room) {
    if (!room.players.get(room.hostId)?.socketId) {
      room.hostId = [...room.players.values()].find(player => player.socketId)?.id ?? null
    }
  }

  sweep(onChange, onExpire) {
    const now = this.now()
    for (const room of this.rooms.values()) {
      if (now - room.touched >= this.idleLimit) {
        onExpire(room)
        this.rooms.delete(room.id)
        continue
      }
      let changed = false
      for (const player of room.players.values()) {
        if (player.disconnectedAt !== null && now - player.disconnectedAt >= this.seatGrace) {
          this.remove(room, player)
          changed = true
        }
      }
      if (changed && this.rooms.has(room.id)) onChange(room)
    }
  }

  snapshot(room, viewer) {
    return {
      id: room.id, revision: room.revision, serverNow: this.now(),
      hostId: room.hostId, selfId: viewer.id, config: room.config,
      players: [...room.players.values()].map(({ id, name, seat, socketId, ready }) => ({
        id, name, seat, connected: Boolean(socketId), ready
      }))
    }
  }
}
