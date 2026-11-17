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

function designFace(content, type) {
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
    let lines
    do {
      ctx.font = '700 ' + font + 'px system-ui'
      lines = wrap(ctx, content, w - 78)
      if (lines.length * font * 1.20 < h - 222 || font === 36) break
      font--
    } while (font >= 36)
    for (let index = 0; index < lines.length; index++) ctx.fillText(lines[index], 38, 159 + index * font * 1.20, w - 76)
    ctx.fillStyle = scenario ? '#a9be9a' : '#3e624b'
    ctx.font = '800 19px system-ui'
    ctx.letterSpacing = '4px'
    ctx.fillText('OFFDECK', 39, h - 45)
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
    this.prestack = null
    this.aspect = camera.aspect
  }

  build(data) {
    const group = new T.Group()
    group.name = data.kind + ' card'
    const edge = data.kind === 'scenario' || !data.text ? darkEdge : paperEdge
    mesh(group, pad, edge).receiveShadow = true
    const front = data.text ? frontMat(designFace(data.text, data.kind)) : this.back
    mesh(group, face, front, 0,0,.012)
    const rear = mesh(group, face, this.back, 0,0,-.012)
    rear.rotation.y = Math.PI
    return { group, front }
  }

  handData(cards) {
    const spacing = Math.min(.237, .155 * this.aspect)
    return cards.map((card, index) => {
      const delta = index - (cards.length - 1) / 2
      const angle = -delta * .049
      return {
        ...card, key: 'hand:' + card.id, kind: 'response', parent: this.camera, hand: true,
        position: new T.Vector3(delta * spacing, -.566 - delta * delta * .006, -1.82 - Math.abs(delta) * .013 + index * .011),
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

    const scenarioPose = onTable(0,-.64,yaw,.85)
    scenarioPose.position.y += .22
    data.push({
      ...match.scenario, key: 'scenario:' + match.roundId, kind: 'scenario', parent: this.scene,
      scale: .92, ...scenarioPose
    })
    if (match.phase === 'select') {
      for (let index = 0; index < match.submittedCount; index++) {
        const pose = onTable((index - (match.submittedCount - 1)/2) * .24, .12, yaw - .15 + index * .035, .05)
        pose.position.y += index * .013
        data.push({ key: 'submitted:' + index, kind: 'back', parent: this.scene, scale: .64, ...pose })
      }
    } else {
      const cols = Math.min(4, match.responses.length)
      for (const [index,response] of match.responses.entries()) {
        const itemsInRow = index >= 4 ? match.responses.length - 4 : cols
        const col = index % 4
        const pose = onTable((col - (itemsInRow - 1)/2) * .58, index < 4 ? .18 : .85, yaw,.76)
        pose.position.y += index < 4 ? .22 : .16
        data.push({ ...response, key: 'response:' + response.id, kind: 'response', parent: this.scene, scale: .84, ...pose })
      }
    }
    data.push(...this.handData(match.hand))
    return data
  }

  sync(room) {
    this.room = room
    const next = new Set()
    for (const data of this.data(room)) {
      next.add(data.key)
      let view = this.views.get(data.key)
      if (!view) {
        view = this.build(data)
        this.views.set(data.key,view)
        data.parent.add(view.group)
      }
      view.data = data
      view.group.position.copy(data.position)
      view.group.quaternion.copy(data.rotation ?? UP)
      view.group.scale.setScalar(data.scale)
    }
    for (const [key, view] of this.views) {
      if (next.has(key)) continue
      view.group.removeFromParent()
      if (view.front !== this.back) {
        view.front.map.dispose()
        view.front.dispose()
      }
      this.views.delete(key)
    }
  }

  resize(aspect) {
    if (this.aspect === aspect) return
    this.aspect = aspect
    this.sync(this.room)
  }
}
