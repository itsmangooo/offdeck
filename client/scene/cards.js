import * as T from 'three'
import { mesh, roundedRectangle, texture, TABLE_Y, SEATS } from './environment.js'

const WIDTH = .64
const HEIGHT = .90
const outline = roundedRectangle(WIDTH, HEIGHT, .032)
const pad = new T.ExtrudeGeometry(outline, {
  depth: .016, bevelEnabled: true, bevelSize: .004, bevelThickness: .003, bevelSegments: 1, curveSegments: 6
})
pad.translate(0,0,-.008)
const face = new T.ShapeGeometry(outline, 6)
const uv = face.getAttribute('uv')
for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / WIDTH + .5, uv.getY(i) / HEIGHT + .5)

const frontMat = (map) => new T.MeshBasicMaterial({ map, toneMapped: false })
const paperEdge = new T.MeshStandardMaterial({ color: '#e1dac5', roughness: .81 })
const darkEdge = new T.MeshStandardMaterial({ color: '#344a3d', roughness: .81 })
const Y_AXIS = new T.Vector3(0,1,0)
const X_AXIS = new T.Vector3(1,0,0)
const UP = new T.Quaternion()
const FLIPPED = new T.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI)
const BORDER = new T.ShapeGeometry(roundedRectangle(WIDTH + .035, HEIGHT + .035, .047), 8)
const focusMat = new T.MeshBasicMaterial({ color: '#c5d89a', toneMapped: false })
const winnerMat = new T.MeshBasicMaterial({ color: '#efc979', toneMapped: false })
const easeOut = t => 1 - (1 - t) ** 3

function pose(position, rotation, scale) {
  return { position: position.clone(), rotation: rotation.clone(), scale }
}

function changed(before, after) {
  return !before || before.position.distanceToSquared(after.position) > .000001 ||
    before.rotation.angleTo(after.rotation) > .002 || before.scale !== after.scale
}

function wrap(ctx, content, width) {
  const result = []
  let line = ''
  for (const word of content.split(/\s+/)) {
    if (line && ctx.measureText(line + ' ' + word).width > width) {
      result.push(line)
      line = word
    } else {
      line += (line ? ' ' : '') + word
    }
  }
  if (line) result.push(line)
  return result
}

function designBack() {
  return texture(400, 560, (ctx,w,h) => {
    ctx.fillStyle = '#193427'
    ctx.fillRect(0,0,w,h)
    ctx.strokeStyle = '#c3ac6c'
    ctx.lineWidth = 3
    ctx.strokeRect(14, 14, w-28,h-28)
    ctx.lineWidth = 1
    ctx.strokeRect(23, 23, w-46,h-46)
    ctx.save()
    ctx.translate(w / 2, h / 2 - 18)
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 12)
      ctx.strokeRect(-58,-58,116,116)
    }
    ctx.restore()
    ctx.fillStyle = '#ead8a9'
    ctx.font = '800 32px system-ui'
    ctx.textAlign = 'center'
    ctx.letterSpacing = '5px'
    ctx.fillText('OFFDECK', w / 2, h - 68)
    ctx.font = '600 24px system-ui'
    ctx.letterSpacing = '0px'
    ctx.fillText('♦', w / 2, 66)
  })
}

function designFace({ text: content, kind: type, own, author, points, winner }) {
  const scenario = type === 'scenario'
  return texture(512,720,(ctx,w,h) => {
    ctx.fillStyle = scenario ? '#161d1a' : '#fbf6e8'
    ctx.fillRect(0,0,w,h)
    ctx.strokeStyle = scenario ? '#728e69' : '#cfc1a9'
    ctx.lineWidth = 3
    ctx.strokeRect(15,15,w - 30,h - 30)
    ctx.textAlign = 'left'
    ctx.fillStyle = scenario ? '#a9be9a' : '#3e624b'
    ctx.font = '800 26px system-ui'
    ctx.letterSpacing = '4px'
    ctx.fillText(scenario ? 'SCENARIO' : 'RESPONSE', 39, 76)
    ctx.letterSpacing = '0px'
    ctx.fillStyle = scenario ? '#fff6e4' : '#17251e'
    let font = content.length < 40 ? 58 : 53
    const reserved = author === undefined ? 222 : 270
    let lines
    do {
      ctx.font = '700 ' + font + 'px system-ui'
      lines = wrap(ctx, content, w - 78)
      if (lines.length * font * 1.20 < h - reserved || font === 36) break
      font--
    } while (font >= 36)
    for (let index = 0; index < lines.length; index++) ctx.fillText(lines[index], 38, 159 + index * font * 1.20, w - 76)
    ctx.fillStyle = scenario ? '#a9be9a' : '#3e624b'
    ctx.font = '800 19px system-ui'
    ctx.letterSpacing = '4px'
    if (author !== undefined) {
      ctx.fillStyle = winner ? '#553a16' : '#3e624b'
      ctx.letterSpacing = '0px'
      ctx.font = '700 32px system-ui'
      ctx.fillText(author,39,h - 88,w - 78)
      ctx.font = '650 26px system-ui'
      ctx.fillText(points + (points === 1 ? ' vote' : ' votes'),39,h - 47)
    } else {
      ctx.fillText(own ? 'YOUR CARD' : 'OFFDECK', 39, h - 45)
    }
    ctx.textAlign = 'right'
    ctx.fillText('♦', w - 37, h - 45)
  })
}

function onTable(x, depth, yaw, tilt = .12) {
  return {
    position: new T.Vector3(x * Math.cos(yaw) + depth * Math.sin(yaw), TABLE_Y + .075,
      -x * Math.sin(yaw) + depth * Math.cos(yaw)),
    rotation: new T.Quaternion().setFromAxisAngle(Y_AXIS, yaw).multiply(
      new T.Quaternion().setFromAxisAngle(X_AXIS, -Math.PI / 2 + tilt)
    )
  }
}

export class Cards {
  constructor(scene, camera) {
    this.scene = scene
    this.camera = camera
    this.views = new Map()
    this.back = frontMat(designBack())
    this.shadowGeometry = new T.PlaneGeometry(.83,.76)
    const shadowMap = texture(96,96,(ctx,w,h) => {
      const shade = ctx.createRadialGradient(w/2,h/2,1,w/2,h/2,w/2)
      shade.addColorStop(0,'#00000094')
      shade.addColorStop(.45,'#00000046')
      shade.addColorStop(1,'#00000000')
      ctx.fillStyle = shade
      ctx.fillRect(0,0,w,h)
    })
    this.shadow = new T.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, opacity: .64 })
    this.aspect = camera.aspect
    this.retired = []
    this.clock = performance.now()
    this.hovered = null
    this.still = false
  }

  build(data) {
    const group = new T.Group()
    group.name = data.kind + ' card'
    const edge = data.kind === 'scenario' || !data.text ? darkEdge : paperEdge
    mesh(group, pad, edge).receiveShadow = true
    const front = data.text ? frontMat(designFace(data)) : this.back
    const surface = mesh(group, face, front, 0,0,.012)
    const rear = mesh(group, face, this.back, 0,0,-.012)
    rear.rotation.y = Math.PI
    const border = mesh(group, BORDER, focusMat, 0,0,-.015)
    border.visible = false
    let shadow = null
    if (data.center || data.kind === 'scenario') {
      shadow = mesh(this.scene,this.shadowGeometry,this.shadow)
      shadow.rotation.x = -Math.PI / 2
    }
    return { group, front, surface, border, shadow, lift: 0, winLift: 0 }
  }

  handData(cards, lowered) {
    const spacing = Math.min(.237, .155 * this.aspect)
    return cards.map((card, index) => {
      const delta = index - (cards.length - 1) / 2
      const angle = -delta * .049
      return {
        ...card, key: 'hand:' + card.id, kind: 'response', parent: this.camera, hand: true, index,
        position: new T.Vector3(delta * spacing, -.566 - delta * delta * .006 - (lowered ? .24 : 0), -1.82 - Math.abs(delta) * .013 + index * .011),
        rotation: new T.Quaternion().setFromEuler(new T.Euler(-.115, delta * -.035, angle)),
        scale: .40
      }
    })
  }

  data(room) {
    const match = room?.match
    const self = room?.players.find(player => player.id === room.selfId)
    const yaw = self ? SEATS[self.seat].yaw : 0
    const playing = match && match.phase !== 'finished'
    const data = []
    const stacks = playing ? match.seats : room?.players.map(player => ({ id: player.id, handCount: 0 })) ?? []
    for (const member of stacks) {
      const player = room.players.find(player => player.id === member.id)
      if (!player || player.id === room.selfId || !player.connected) continue
      const seat = SEATS[player.seat]
      for (let index = 0; index < member.handCount; index++) {
        const offset = (index - (member.handCount - 1) / 2) * .089
        const length = Math.hypot(seat.x,seat.z)
        data.push({
          key: 'remote:' + player.id + ':' + index, kind: 'back', parent: this.scene, scale: .39,
          memberId: player.id, remote: true, index,
          position: new T.Vector3(seat.x * (1 - .83 / length) + offset * Math.cos(seat.yaw),
            TABLE_Y + .028 + index * .002, seat.z * (1 - .83 / length) - offset * Math.sin(seat.yaw)),
          rotation: onTable(0, 0, seat.yaw + (index - 3) * .06).rotation
        })
      }
    }

    if (!playing) {
      for (let index = 0; index < 7; index++) {
        const pose = onTable(.45 + index * .004, 0, .22 + index * .008, 0)
        pose.position.y = TABLE_Y + .025 + index * .018
        data.push({ key: 'stack:' + index, kind: 'back', parent: this.scene, scale: .76, ...pose })
      }
      return data
    }

    for (let index = 0; index < Math.min(6, match.remaining); index++) {
      const pack = onTable(1.34,-.68,yaw + .08,0)
      pack.position.y = TABLE_Y + .02 + index * .015
      data.push({ key: 'pack:' + index, kind: 'back', parent: this.scene, scale: .60, index, ...pack })
    }
    const showResponses = match.phase !== 'select' && match.responses.length > 0
    const crowded = match.responses.length > 4
    const scenarioOffset = crowded ? -1.68 : -1.36
    const scenarioPose = onTable(showResponses ? scenarioOffset : 0, -.64, yaw,.85)
    scenarioPose.position.y += .251
    data.push({
      ...match.scenario, key: 'scenario:' + match.roundId, kind: 'scenario', parent: this.scene,
      scale: crowded ? .65 : showResponses ? .76 : .92, ...scenarioPose
    })
    if (match.phase === 'select') {
      for (let index = 0; index < match.submittedCount; index++) {
        const pose = onTable((index - (match.submittedCount - 1)/2) * .24, .12, yaw - .15 + index * .035, .05)
        pose.position.y += index * .013
        data.push({ key: 'submitted:' + index, kind: 'back', parent: this.scene, scale: .64, submitted: true, index, ...pose })
      }
    } else {
      const cols = Math.min(4, match.responses.length)
      for (const [index,response] of match.responses.entries()) {
        const itemsInRow = index >= 4 ? match.responses.length - 4 : cols
        const col = index % 4
        const twoRows = match.responses.length > 4
        const frontRow = index >= 4
        const depth = twoRows ? (frontRow ? .92 : -.12) : .23
        const pose = onTable((col - (itemsInRow - 1)/2) * .60, depth, yaw,.76)
        pose.position.y += twoRows ? (frontRow ? .178 : .50) : .21
        data.push({ ...response, key: 'response:' + response.id, kind: 'response', parent: this.scene,
          center: true, scale: twoRows ? .72 : .82, index, ...pose })
      }
    }
    data.push(...this.handData(match.hand, match.phase !== 'select'))
    return data
  }

  worldPose(view) {
    view.group.updateWorldMatrix(true, false)
    return {
      position: view.group.getWorldPosition(new T.Vector3()),
      rotation: view.group.getWorldQuaternion(new T.Quaternion()),
      scale: view.group.scale.x
    }
  }

  move(view, target, start, duration = 360, delay = 0, arc = 0) {
    const origin = start ?? view.base ?? target
    view.target = target
    view.base = pose(origin.position,origin.rotation,origin.scale)
    view.motion = { start: origin, duration, at: this.clock + delay, arc }
  }

  incoming(data, yaw, newMatch, collectFlight) {
    if (data.submitted && collectFlight) return [collectFlight, 425, 0, .30]
    if (data.hand) {
      const from = onTable(.68,-.26,yaw,0)
      from.position.y += .32
      this.camera.updateWorldMatrix(true,false)
      const local = this.camera.worldToLocal(from.position)
      const start = pose(local, data.rotation.clone().multiply(FLIPPED), .28)
      return [start, 590, data.index * 45 + (newMatch ? 220 : 70), .09]
    }
    if (data.remote) {
      const from = onTable(.55,0,yaw,0)
      return [pose(from.position,from.rotation,.30), 480, data.index * 37, .18]
    }
    if (data.kind === 'scenario') {
      const from = onTable(1.34,-.68,yaw,0)
      return [pose(from.position,from.rotation.clone().multiply(FLIPPED),.62), 740, newMatch ? 240 : 110, .25]
    }
    if (data.center) {
      const from = onTable(0,.09,yaw,0)
      from.position.y += data.index * .014
      return [pose(from.position,from.rotation.clone().multiply(FLIPPED),.60), 630, 210 + data.index * 65, .30]
    }
    if (newMatch && data.key.startsWith('pack:')) {
      const start = pose(data.position, data.rotation, data.scale)
      start.position.x += data.index % 2 === 0 ? -.34 : .32
      start.rotation.multiply(new T.Quaternion().setFromAxisAngle(Y_AXIS, data.index * .07))
      return [start, 410, data.index * 33, .12]
    }
    return []
  }

  dispose(view) {
    view.group.removeFromParent()
    view.shadow?.removeFromParent()
    if (view.front === this.back) return
    view.front.map.dispose()
    view.front.dispose()
  }

  retire(view, yaw, faceDown) {
    if (this.still) return this.dispose(view)
    const base = this.worldPose(view)
    this.scene.add(view.group)
    if (faceDown) view.surface.material = this.back
    const destination = faceDown ? onTable(0,.12,yaw,0) : onTable(-1.44,-.53,yaw,0)
    const target = pose(destination.position, destination.rotation, faceDown ? .60 : .38)
    this.move(view,target,base,faceDown ? 420 : 380,0,faceDown ? .33 : .14)
    view.lift = 0
    this.retired.push(view)
  }

  sync(room) {
    this.clock = performance.now()
    const prior = this.room?.match
    const current = room?.match
    this.room = room
    const self = room?.players.find(player => player.id === room.selfId)
    const yaw = self ? SEATS[self.seat].yaw : 0
    const sameRound = prior && current?.roundId === prior.roundId
    const newMatch = !prior || prior.phase === 'finished'
    const submittedNow = new Set(sameRound ? current.seats.filter(member => member.submitted &&
      !prior.seats.find(old => old.id === member.id)?.submitted).map(member => member.id) : [])
    const items = this.data(room)
    const keys = new Set(items.map(data => data.key))
    const flights = []
    const needed = items.filter(data => data.submitted && !this.views.has(data.key)).length
    for (const [key,view] of this.views) {
      if (keys.has(key)) continue
      this.views.delete(key)
      if (this.hovered === view) this.hovered = null
      const { data } = view
      const faceDown = (data.hand && submittedNow.has(self?.id)) || (data.remote && submittedNow.has(data.memberId))
      if (faceDown && flights.length < needed) {
        flights.push(this.worldPose(view))
        this.dispose(view)
      } else if (faceDown || (prior?.roundId !== current?.roundId && (data.center || data.kind === 'scenario'))) {
        this.retire(view,yaw,faceDown)
      } else {
        this.dispose(view)
      }
    }
    for (const data of items) {
      let view = this.views.get(data.key)
      const target = pose(data.position,data.rotation ?? UP,data.scale)
      if (!view) {
        view = this.build(data)
        this.views.set(data.key,view)
        data.parent.add(view.group)
        const [start,duration,delay,arc] = this.incoming(data,yaw,newMatch,data.submitted ? flights.shift() : null)
        this.move(view,target,start,duration,delay,arc)
      } else if (changed(view.target,target)) {
        this.move(view,target)
      }
      if (data.center && view.data && view.data.author !== data.author && data.author !== undefined) {
        view.front.map.dispose()
        view.front.map = designFace(data)
        view.front.needsUpdate = true
      }
      view.data = data
    }
    this.animate(this.clock,0)
  }

  advance(view, time, dt, retired = false) {
    const { motion, target, group, base } = view
    let arc = 0
    if (motion) {
      const progress = this.still ? 1 : T.MathUtils.clamp((time - motion.at) / motion.duration,0,1)
      const eased = easeOut(progress)
      base.position.lerpVectors(motion.start.position,target.position,eased)
      base.rotation.slerpQuaternions(motion.start.rotation,target.rotation,eased)
      base.scale = T.MathUtils.lerp(motion.start.scale,target.scale,eased)
      arc = motion.arc * Math.sin(progress * Math.PI)
      if (progress === 1) view.motion = null
    }
    group.position.copy(base.position)
    group.position.y += arc
    group.quaternion.copy(base.rotation)
    const selected = !retired && view === this.hovered
    const ease = this.still ? 1 : 1 - Math.exp(-dt * 16)
    view.lift += (Number(selected) - view.lift) * ease
    group.position.y += view.lift * (view.data.hand ? .136 : .19)
    if (view.data.hand) group.position.z += view.lift * .058
    const pulse = this.still || !view.pressedAt ? 0 : Math.max(0,1 - (time - view.pressedAt) / 260)
    const winner = !retired && view.data.winner
    view.winLift += (Number(Boolean(winner)) - view.winLift) * ease
    group.position.y += view.winLift * .075
    group.scale.setScalar(base.scale * (1 + view.lift * .13 + pulse * .07 + view.winLift * .04))
    view.border.visible = Boolean(winner || view.lift > .12 || pulse)
    view.border.material = winner ? winnerMat : focusMat
    if (view.shadow) {
      const { x, y, z } = group.position
      view.shadow.position.set(x,TABLE_Y + .008,z)
      view.shadow.scale.setScalar(base.scale * (1 + Math.max(0, y - TABLE_Y) * .26))
    }
    return Boolean(view.motion)
  }

  animate(time,dt) {
    for (const view of this.views.values()) this.advance(view,time,dt)
    this.retired = this.retired.filter(view => {
      if (this.advance(view,time,dt,true)) return true
      this.dispose(view)
      return false
    })
  }

  pick(ray) {
    const match = this.room?.match
    const candidates = [...this.views.values()].filter(view =>
      (view.data.hand && match?.phase === 'select') || view.data.center || view.data.kind === 'scenario')
    const meshes = candidates.map(view => {
      view.group.updateWorldMatrix(true,true)
      return view.group.children[0]
    })
    const hit = ray.intersectObjects(meshes,false)[0]
    return hit ? candidates.find(view => view.group === hit.object.parent) : null
  }

  action(view) {
    const match = this.room?.match
    if (view?.data.hand && match?.canSubmit) return 'submit'
    if (view?.data.center && !view.data.own && match?.canVote) return 'vote'
    return null
  }

  resize(aspect) {
    if (this.aspect === aspect) return
    this.aspect = aspect
    this.sync(this.room)
  }
}
