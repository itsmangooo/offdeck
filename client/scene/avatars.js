import * as T from 'three'
import { mesh, texture, SEATS, batchStatic } from './environment.js'
import { HEAD_HEIGHT } from './avatar-layout.js'

const sphere = new T.SphereGeometry(1, 24, 18)
const iris = new T.MeshStandardMaterial({ color: '#171a21', roughness: .48 })
const ivory = new T.MeshStandardMaterial({ color: '#fbf1d6', roughness: .47 })
const skinColors = ['#b97956','#ad6947','#d99868','#8b543c','#c87957','#713f31','#e2ac88','#a25940']
const hairColors = ['#382a25','#27252c','#a74329','#201d25','#6b472c','#1e332e','#48332e','#341d29']

function sculpt(parent, material, x,y,z, width,height,depth) {
  const part = mesh(parent,sphere,material,x,y,z)
  part.scale.set(width,height,depth)
  return part
}

function makeHead(seat) {
  const head = new T.Group()
  const skin = new T.MeshStandardMaterial({
    color:skinColors[seat], roughness:.77, emissive:skinColors[seat], emissiveIntensity:.065
  })
  const hair = new T.MeshStandardMaterial({ color: hairColors[seat], roughness: .74 })
  sculpt(head, skin, 0,0,0, .271,.319,.238)
  sculpt(head, skin, 0,-.116,.055, .230,.191,.195)
  for (const direction of [-1,1]) {
    const x = .260 * direction
    sculpt(head,skin,x,-.004,0,.049,.075,.049).rotation.z = -.17 * direction
    sculpt(head,ivory,.106 * direction,.028,.218,.067,.055,.026).rotation.y = .20 * direction
    sculpt(head,iris,.101 * direction,.026,.244,.027,.037,.009)
    sculpt(head,ivory,.092 * direction,.039,.252,.008,.008,.004)
    sculpt(head,hair,.108 * direction,.109,.218,.063,.014,.016).rotation.z = -.10 * direction
  }
  sculpt(head,skin,0,-.033,.237,.048,.055,.053)
  sculpt(head,hair,.012,-.114,.242,.066,.010,.008).rotation.z = -.08

  if ([1,4,7].includes(seat)) {
    sculpt(head,hair,0,.185,-.052,.274,.184,.229)
    for (let index = 0; index < 10; index++) {
      const position = index / 9 * Math.PI
      sculpt(head,hair,Math.cos(position)*.243,.197 + Math.sin(position) * .11,.082 + .031 * Math.sin(index * 5),.088,.099,.117)
    }
  } else {
    sculpt(head,hair,0,.177,-.052,.263,.168,.225)
    for (let index = 0; index < 5; index++) {
      const tuft = sculpt(head,hair,-.167 + index * .075,.251 + Math.sin(index * .62)*.056,.073,.099,.114,.171)
      tuft.rotation.z = -.41
    }
  }

  if ([2,5].includes(seat)) {
    const frames = new T.MeshStandardMaterial({ color: '#415d56', roughness: .56 })
    const ring = new T.TorusGeometry(.071,.009,8,24)
    for (const side of [-1,1]) {
      const lens = mesh(head,ring,frames,side * .104,.026,.260)
      lens.rotation.y = .17 * side
    }
    sculpt(head,frames,0,.034,.267,.044,.009,.01)
  }
  batchStatic(head)
  return head
}

const STATE_COLORS = {
  seated:'#a9b99f', choosing:'#e1c987', submitted:'#a4cc98',
  voted:'#a8ccce', offline:'#d38e65', winner:'#edc777'
}

function badge(player, host, status) {
  const width = Math.min(512,Math.max(200,104 + [...player.name].length * 27 + (host ? 37 : 0)))
  const map = texture(width,96,(ctx,w,h) => {
    ctx.beginPath()
    ctx.roundRect(3,9,w-6,h-18,17)
    ctx.fillStyle = '#17221df3'
    ctx.fill()
    ctx.strokeStyle = status === 'winner' ? '#edc777' : '#b5c2a66b'
    ctx.lineWidth = status === 'winner' ? 4 : 2
    ctx.stroke()
    ctx.fillStyle = STATE_COLORS[status]
    ctx.beginPath()
    ctx.arc(30,h/2,9,0,Math.PI*2)
    ctx.fill()
    ctx.font = '650 54px system-ui'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = player.connected ? '#fbf6e8' : '#c5c6b7'
    ctx.fillText(player.name,54,h/2+2,w-(host ? 100 : 71))
    if (host) {
      ctx.fillStyle = '#ecd4a6'
      ctx.font = '700 36px system-ui'
      ctx.fillText('♦',w-38,h/2+1)
    }
  })
  return new T.SpriteMaterial({map,transparent:true,depthWrite:false,toneMapped:false})
}

function sizeBadge(label) {
  label.scale.set(label.material.map.image.width * .00175,.168,1)
}

export class Avatars {
  constructor(scene) {
    this.scene = scene
    this.visible = new Map()
    this.models = SEATS.map((_seat, index) => makeHead(index))
  }

  sync(room) {
    const match = room?.match
    const activeSeats = match?.phase !== 'finished' ? match?.seats : undefined
    const winners = new Set(match?.responses.filter(card => card.winner).map(card => card.authorId) ?? [])
    const others = room?.players.filter(player => player.id !== room.selfId &&
      (!activeSeats || activeSeats.some(seat => seat.id === player.id))) ?? []
    for (const [id, view] of this.visible) {
      if (others.some(player => player.id === id)) continue
      this.remove(id, view)
    }
    for (const player of others) {
      const { x, z, yaw } = SEATS[player.seat]
      const host = player.id === room.hostId
      const member = activeSeats?.find(seat => seat.id === player.id)
      const status = !player.connected ? 'offline' : winners.has(player.id) ? 'winner' :
        member?.voted ? 'voted' : member?.submitted || player.ready ? 'submitted' :
        match?.phase === 'select' && member ? 'choosing' : 'seated'
      const key = JSON.stringify([player.name,host,status])
      let view = this.visible.get(player.id)
      if (!view) {
        const head = this.models[player.seat]
        head.position.set(x*.99,HEAD_HEIGHT,z*.99)
        head.rotation.y = yaw+Math.PI
        const label = new T.Sprite(badge(player,host,status))
        label.position.set(x*.99,HEAD_HEIGHT+.46,z*.99)
        sizeBadge(label)
        this.scene.add(head,label)
        view = {head,label,key,yaw,seat:player.seat,status,reactAt:0,reaction:null}
        this.visible.set(player.id,view)
      } else if (view.key !== key) {
        view.label.material.map.dispose()
        view.label.material.dispose()
        view.label.material = badge(player,host,status)
        sizeBadge(view.label)
        if (status !== view.status && !room.seatSnapshot) {
          view.reaction = view.status === 'offline' ? 'reconnected' : status
          view.reactAt = performance.now()
        }
        view.status = status
        view.key = key
      }
      if (room.seatSnapshot) view.reaction = null
    }
  }

  remove(id,view) {
    this.scene.remove(view.head,view.label)
    view.label.material.map.dispose()
    view.label.material.dispose()
    this.visible.delete(id)
  }

  animate(seconds, still) {
    for (const view of this.visible.values()) {
      const {head,label,status,reaction,reactAt} = view
      const wave = seconds*1.55 + view.seat*1.9
      const t = still ? 1 : T.MathUtils.clamp((seconds*1000-reactAt)/650,0,1)
      const accent = Math.sin(t*Math.PI)**2
      const bounce = reaction === 'winner' || reaction === 'reconnected' ? accent*.065 : 0
      const nod = reaction === 'submitted' || reaction === 'voted' || reaction === 'winner' ? accent*.13 : 0
      const down = status === 'offline' ? .083 : 0
      const y = HEAD_HEIGHT-down + (still ? 0 : Math.sin(wave)*.023+bounce)
      head.position.y = y
      label.position.y = y+.453
      head.rotation.x = nod + (status === 'choosing' ? .075 : down)
      head.rotation.y = Math.PI+view.yaw + (still ? 0 : Math.sin(wave*.62)*.055)
      head.rotation.z = still ? 0 : Math.sin(wave*.86)*.033
    }
  }
}
