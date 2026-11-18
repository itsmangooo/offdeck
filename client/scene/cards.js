import * as T from 'three'
import { mesh, roundedRectangle, texture, TABLE_Y, SEATS } from './environment.js'
import { CARD_WIDTH as WIDTH, CARD_HEIGHT as HEIGHT, tableCard as onTable, handPose,
  scenarioPose, responsePose } from './card-layout.js'
import { CARD_FACE_WIDTH, CARD_FACE_HEIGHT, paintCardFace } from '../../shared/card-face.js'
import { remoteHandPose } from './avatar-layout.js'
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
const UP = new T.Quaternion()
const FLIPPED = new T.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI)
const BORDER = new T.ShapeGeometry(roundedRectangle(WIDTH + .035, HEIGHT + .035, .047), 8)
const focusMat = new T.MeshBasicMaterial({ color: '#c5d89a', toneMapped: false })
const winnerMat = new T.MeshBasicMaterial({ color: '#efc979', toneMapped: false })
const recordedMat = new T.MeshBasicMaterial({ color:'#749784',toneMapped:false })
const easeOut = t => 1 - (1 - t) ** 3
const easeTravel = t => t*t*(3-2*t)

function pose(position, rotation, scale) {
  return { position: position.clone(), rotation: rotation.clone(), scale }
}

function changed(before, after) {
  return !before || before.position.distanceToSquared(after.position) > .000001 ||
    before.rotation.angleTo(after.rotation) > .002 || before.scale !== after.scale
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

function designFace(data) {
  return texture(CARD_FACE_WIDTH, CARD_FACE_HEIGHT, (ctx,w,h) => paintCardFace(ctx, w, h, data))
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
    this.inspection = null
  }

  get inspecting() {
    return Boolean(this.inspection && !this.inspection.closing)
  }

  inspectionPose(view) {
    const world = this.worldPose(view)
    this.camera.updateWorldMatrix(true,false)
    const inverse = this.camera.getWorldQuaternion(new T.Quaternion()).invert()
    return pose(this.camera.worldToLocal(world.position),inverse.multiply(world.rotation),world.scale)
  }

  inspect(open, immediate) {
    const current = this.inspection
    if (open) {
      if (this.inspecting) return false
      const source = [...this.views.values()].find(view => view.data.kind === 'scenario')
      if (!source) return false
      if (current) this.finishInspection()
      const group = source.group.clone()
      const from = this.inspectionPose(source)
      const target = pose(new T.Vector3(0,.014,-.98),UP,.61)
      group.position.copy(from.position)
      group.quaternion.copy(from.rotation)
      group.scale.setScalar(from.scale)
      source.group.visible = false
      this.camera.add(group)
      this.inspection = { source,group,from,target,at:performance.now(),closing:false }
      return true
    }
    if (!current) return false
    if (immediate || this.still) this.finishInspection()
    else if (!current.closing) {
      current.from = pose(current.group.position,current.group.quaternion,current.group.scale.x)
      current.target = this.inspectionPose(current.source)
      current.closing = true
      current.at = performance.now()
    }
    return true
  }

  finishInspection() {
    const { source,group } = this.inspection
    group.removeFromParent()
    source.group.visible = true
    this.inspection = null
  }

  animateInspection(time) {
    if (!this.inspection) return
    const { group,from,target,at,closing } = this.inspection
    const progress = this.still ? 1 : T.MathUtils.clamp((time-at) / (closing ? 225 : 265),0,1)
    const t = easeOut(progress)
    group.position.lerpVectors(from.position,target.position,t)
    group.quaternion.slerpQuaternions(from.rotation,target.rotation,t)
    group.scale.setScalar(T.MathUtils.lerp(from.scale,target.scale,t))
    if (closing && progress === 1) this.finishInspection()
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

  handData(cards, seat, phase) {
    return cards.map((card,index) => ({
      ...card, key:'hand:' + card.id, kind:'response', parent:this.camera, hand:true, index,
      ...handPose(seat, phase, this.aspect, cards.length,index)
    }))
  }

  data(room) {
    const match = room?.match
    const self = room?.players.find(player => player.id === room.selfId)
    const seat = SEATS[self?.seat ?? 0]
    const yaw = seat.yaw
    const playing = match && match.phase !== 'finished'
    const data = []
    const stacks = playing ? match.seats : room?.players.map(player => ({ id: player.id, handCount: 0 })) ?? []
    for (const member of stacks) {
      const player = room.players.find(player => player.id === member.id)
      if (!player || player.id === room.selfId) continue
      for (let index = 0; index < member.handCount; index++) {
        data.push({
          key:'remote:' + player.id + ':' + index, kind:'back', parent:this.scene,
          memberId:player.id, remote:true, index, seatIndex:player.seat,
          ...remoteHandPose(SEATS[player.seat],member.handCount,index,player.connected)
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
    data.push({
      ...match.scenario, key:'scenario:' + match.roundId, kind:'scenario', parent:this.scene,
      ...scenarioPose(seat,match.responses.length)
    })
    if (match.phase === 'select') {
      for (let index = 0; index < match.submittedCount; index++) {
        const pose = onTable((index - (match.submittedCount - 1)/2) * .24, .12, yaw - .15 + index * .035, .05)
        pose.position.y += index * .013
        data.push({ key: 'submitted:' + index, kind: 'back', parent: this.scene, scale: .64, submitted: true, index, ...pose })
      }
    } else {
      for (const [index,response] of match.responses.entries()) {
        data.push({ ...response, key:'response:' + response.id, kind:'response', parent:this.scene,
          center:true,index,recorded:match.phase === 'vote' && match.voteChoiceId === response.id,
          ...responsePose(seat,match.responses.length,index) })
      }
    }
    data.push(...this.handData(match.hand,seat,match.phase))
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

  move(view,target,start,duration = 285,delay = 0,arc = 0,curve = easeOut) {
    const origin = start ?? view.base ?? target
    view.target = target
    view.base = pose(origin.position,origin.rotation,origin.scale)
    view.motion = { start:origin,duration,at:this.clock+delay,arc,curve }
  }

  incoming(data, yaw, newMatch, collectFlight) {
    if (data.submitted && collectFlight) return [collectFlight,380,0,.245,easeTravel]
    if (data.hand) {
      const from = onTable(.68,-.26,yaw,0)
      from.position.y += .32
      this.camera.updateWorldMatrix(true,false)
      const local = this.camera.worldToLocal(from.position)
      const start = pose(local, data.rotation.clone().multiply(FLIPPED), .28)
      return [start,newMatch ? 560 : 435,data.index*(newMatch ? 29 : 11)+(newMatch ? 190 : 45),.115,easeTravel]
    }
    if (data.remote) {
      const from = onTable(1.05,-.52,yaw,0)
      return [pose(from.position,from.rotation,.25),newMatch ? 490 : 410,
        newMatch ? 175+data.index*28 : data.index*9,.21,easeTravel]
    }
    if (data.kind === 'scenario') {
      const from = onTable(1.34,-.68,yaw,0)
      return [pose(from.position,from.rotation.clone().multiply(FLIPPED),.62),
        650,newMatch ? 225 : 90,.22,easeTravel]
    }
    if (data.center) {
      const from = onTable(0,.09,yaw,0)
      from.position.y += data.index * .014
      return [pose(from.position,from.rotation.clone().multiply(FLIPPED),.60),
        530,165+data.index*53,.265,easeTravel]
    }
    if (newMatch && data.key.startsWith('pack:')) {
      const start = pose(data.position, data.rotation, data.scale)
      const spread = data.index%2 === 0 ? -.28 : .28
      start.position.x += spread*Math.cos(yaw)
      start.position.z -= spread*Math.sin(yaw)
      start.rotation.multiply(new T.Quaternion().setFromAxisAngle(Y_AXIS,spread*.58))
      return [start,330,data.index*22,.075,easeTravel]
    }
    return []
  }

  dispose(view) {
    if (this.inspection?.source === view) this.finishInspection()
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
    this.move(view,target,base,faceDown ? 380 : 410,0,faceDown ? .245 : .14,easeTravel)
    view.lift = 0
    this.retired.push(view)
  }

  sync(room) {
    this.clock = performance.now()
    const prior = this.room?.match
    const current = room?.match
    const catchUp = Boolean(current && (room.seatSnapshot || room.id !== this.room?.id))
    this.room = room
    if (catchUp) {
      for (const view of this.retired) this.dispose(view)
      this.retired.length = 0
    }
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
      if (catchUp) {
        this.dispose(view)
      } else if (faceDown && flights.length < needed) {
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
        if (!catchUp) {
          const [start,duration,delay,arc,curve] = this.incoming(data,yaw,newMatch,data.submitted ? flights.shift() : null)
          this.move(view,target,start,duration,delay,arc,curve)
        }
      } else if (!catchUp && changed(view.target,target)) {
        this.move(view,target)
      }
      if (catchUp) {
        view.target = target
        view.base = pose(target.position,target.rotation,target.scale)
        view.motion = null
        view.lift = 0
      }
      if (data.center && view.data && (view.data.author !== data.author || view.data.recorded !== data.recorded)) {
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
      const eased = motion.curve(progress)
      base.position.lerpVectors(motion.start.position,target.position,eased)
      base.rotation.slerpQuaternions(motion.start.rotation,target.rotation,eased)
      base.scale = T.MathUtils.lerp(motion.start.scale,target.scale,eased)
      arc = motion.arc * Math.sin(progress * Math.PI)
      if (progress === 1) view.motion = null
    }
    group.position.copy(base.position)
    group.position.y += arc
    if (view.data.remote && !this.still && !retired && !motion) {
      group.position.y += Math.sin(time*.00155 + view.data.seatIndex*1.9)*.013
    }
    group.quaternion.copy(base.rotation)
    const selected = !retired && view === this.hovered
    const ease = this.still ? 1 : 1 - Math.exp(-dt * 16)
    view.lift += (Number(selected) - view.lift) * ease
    const scenario = view.data.kind === 'scenario'
    const dense = view.data.center && this.room?.match?.responses.length > 4
    group.position.y += view.lift * (scenario ? .045 : view.data.hand ? .098 : dense ? .080 : .135)
    if (view.data.hand) group.position.z += view.lift * .064
    const pulse = this.still || !view.pressedAt ? 0 : Math.max(0,1 - (time - view.pressedAt) / 260)
    const winner = !retired && view.data.winner
    view.winLift += (Number(Boolean(winner)) - view.winLift) * ease
    group.position.y += view.winLift * .075
    group.scale.setScalar(base.scale * (1 + view.lift * (scenario ? .035 : dense ? .07 : .13) + pulse * .07 + view.winLift * .04))
    const recorded = !retired && view.data.recorded
    const highlight = this.room?.tutorialHighlight
    const teaching = !retired && (highlight === 'hand' && view.data.hand ||
      highlight === 'scenario' && scenario || highlight === 'responses' && view.data.center && !view.data.own)
    view.border.visible = Boolean(winner || recorded || teaching || view.lift > .12 || pulse)
    view.border.material = winner ? winnerMat : recorded ? recordedMat : focusMat
    if (view.shadow) {
      const { x, y, z } = group.position
      view.shadow.position.set(x,TABLE_Y + .008,z)
      view.shadow.scale.setScalar(base.scale * (1 + Math.max(0, y - TABLE_Y) * .26))
    }
    return Boolean(view.motion)
  }

  animate(time,dt) {
    this.animateInspection(time)
    for (const view of this.views.values()) this.advance(view,time,dt)
    this.retired = this.retired.filter(view => {
      if (this.advance(view,time,dt,true)) return true
      this.dispose(view)
      return false
    })
  }

  pick(ray) {
    const match = this.room?.match
    const candidates = [...this.views.values()].filter(view => view.group.visible &&
      ((view.data.hand && match?.phase === 'select') || view.data.center || view.data.kind === 'scenario'))
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
