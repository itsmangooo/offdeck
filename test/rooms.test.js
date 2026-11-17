import test from 'node:test'
import assert from 'node:assert/strict'
import { RoomStore } from '../server/rooms.js'
import { ROOM_ID, NICKNAME_LIFETIME } from '../shared/protocol.js'
import { readNickname, saveNickname } from '../client/preferences.js'

test('rooms assign unique seats, validate joins and keep ownership secrets private', () => {
  const store = new RoomStore()
  const { room, player: host } = store.create('Alex', { capacity: 3 }, 'socket-a')
  assert.match(room.id, ROOM_ID)
  assert.equal(room.hostId, host.id)
  assert.equal(host.seat, 0)
  const { player: guest } = store.join(room.id, 'Alex', 'socket-b')
  assert.notEqual(guest.id, host.id)
  assert.equal(guest.seat, 1)
  assert.notEqual(guest.token, host.token)
  assert.equal(store.join(room.id, 'Sam', 'socket-c').player.seat, 2)
  assert.throws(() => store.join(room.id, 'Fourth', 'socket-d'), /FULL/)
  assert.throws(() => store.join('no', 'Sam', 'socket-c'), /BAD_LINK/)
  assert.throws(() => store.resume(room.id, 'Alex', 'socket-d'), /BAD_SESSION/)
  assert.throws(() => store.join('a'.repeat(36), 'Sam', 'socket-c'), /ROOM_GONE/)
  const snapshot = JSON.stringify(store.snapshot(room, guest))
  assert.ok(!snapshot.includes(host.token) && !snapshot.includes(guest.token) && !snapshot.includes('socket-a'))
})

test('host migrates, reconnects into original seat, and offline reservations expire', () => {
  let time = 0
  const store = new RoomStore({ now: () => time, seatGrace: 100, idleLimit: 500 })
  const { room, player: host } = store.create('Alex', {}, 'a')
  const { player: guest } = store.join(room.id, 'Sam', 'b')
  store.disconnect(room, host)
  assert.equal(room.hostId, guest.id)
  assert.equal(store.resume(room.id, host.token, 'replacement').player.seat, 0)
  assert.equal(room.hostId, guest.id)
  store.disconnect(room, host)
  time = 100
  store.sweep(() => {}, () => {})
  assert.throws(() => store.resume(room.id, host.token, 'late'), /BAD_SESSION/)
  assert.equal(store.join(room.id, 'Avery', 'c').player.seat, 0)
  time = 600
  store.sweep(() => {}, () => {})
  assert.throws(() => store.get(room.id), /ROOM_GONE/)
})

test('nickname survives reload for 365 days and rejects expired or invalid values', () => {
  const data = new Map()
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }
  assert.equal(readNickname(storage, 0), null)
  assert.equal(saveNickname(storage, '  Rue  ', 0), 'Rue')
  assert.equal(readNickname(storage, NICKNAME_LIFETIME - 1), 'Rue')
  assert.equal(readNickname(storage, NICKNAME_LIFETIME), null)
  assert.equal(saveNickname(storage, 'x'.repeat(25)), null)
})
