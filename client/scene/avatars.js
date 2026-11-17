import * as T from 'three'
import { mesh, texture, SEATS, batchStatic } from './environment.js'

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
  const skin = new T.MeshStandardMaterial({ color: skinColors[seat], roughness: .83 })
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

function badge(player, host) {
  const map = texture(512, 144, (ctx,w,h) => {
    ctx.beginPath()
    ctx.roundRect(4, 16, w - 8, h - 32, 14)
    ctx.fillStyle = '#15251ff2'
    ctx.fill()
    ctx.strokeStyle = '#d7bc877d'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = player.connected ? (player.ready ? '#d0dca1' : '#a9b99f') : '#e1aa65'
    ctx.beginPath()
    ctx.arc(39, h / 2, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f6f1e2'
    ctx.font = '650 49px system-ui'
    ctx.textBaseline = 'middle'
    ctx.fillText(player.name, 64, h / 2 + 2, host ? 365 : 405)
    if (host) {
      ctx.fillStyle = '#ecd4a6'
      ctx.font = '700 35px system-ui'
      ctx.fillText('♦', 443, h / 2 + 2)
    }
  })
  return new T.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false })
}

export class Avatars {
  constructor(scene) {
    this.scene = scene
    this.visible = new Map()
    this.models = SEATS.map((_seat, index) => makeHead(index))
  }

  sync(room) {
    const activeSeats = room?.match?.phase !== 'finished' ? room?.match?.seats : undefined
    const others = room?.players.filter(player => player.id !== room.selfId &&
      (!activeSeats || activeSeats.some(seat => seat.id === player.id))) ?? []
    for (const [id, view] of this.visible) {
      if (others.some(player => player.id === id)) continue
      this.remove(id, view)
    }
    for (const player of others) {
      const { x, z, yaw } = SEATS[player.seat]
      const host = player.id === room.hostId
      const key = JSON.stringify([player.name,player.connected,player.ready,host])
      let view = this.visible.get(player.id)
      if (!view) {
        const head = this.models[player.seat]
        head.position.set(x * .98, 1.92, z * .98)
        head.rotation.y = yaw + Math.PI
        const label = new T.Sprite(badge(player,host))
        label.position.set(x * .98, 2.38,z * .98)
        label.scale.set(.99,.278,1)
        this.scene.add(head,label)
        view = { head, label, key, yaw, seat: player.seat }
        this.visible.set(player.id,view)
      } else if (view.key !== key) {
        view.label.material.map.dispose()
        view.label.material.dispose()
        view.label.material = badge(player,host)
        view.key = key
      }
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
      const wave = seconds + view.seat * 3.12
      view.head.position.y = 1.92 + (still ? 0 : Math.sin(wave * 1.2) * .044)
      view.head.rotation.y = Math.PI + view.yaw + (still ? 0 : Math.sin(wave * .64) * .09)
      view.head.rotation.z = still ? 0 : Math.sin(wave * 1.29) * .055
    }
  }
}
