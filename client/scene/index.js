import * as T from 'three'
import { buildRoom, SEATS } from './environment.js'
import { Avatars } from './avatars.js'
import { Cards } from './cards.js'

const PLAY_FOV = 50
const MENU_FOV = 49

export class TableScene {
  constructor(container) {
    this.container = container
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = T.SRGBColorSpace
    this.renderer.toneMapping = T.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.19
    this.renderer.shadowMap.enabled = true
    this.container.replaceChildren(this.renderer.domElement)
    this.scene = new T.Scene()
    this.camera = new T.PerspectiveCamera(MENU_FOV, 1, .09, 45)
    this.scene.add(this.camera)
    this.key = buildRoom(this.scene)
    this.avatars = new Avatars(this.scene)
    this.cards = new Cards(this.scene,this.camera)
    this.target = new T.Vector3(-1.35,1.1,-.1)
    this.pointer = new T.Vector2()
    this.camera.position.set(6.15,4.85,5.62)
    this.camera.lookAt(this.target)
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches
    this.renderFrame = this.renderFrame.bind(this)
    this.lastTime = performance.now()
    this.dirty = true
    this.canvas = this.renderer.domElement
    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault()
      this.container.dispatchEvent(new Event('sceneunavailable'))
    })
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.key.shadow.needsUpdate = true
      this.dirty = true
      this.container.dispatchEvent(new Event('scenerestored'))
    })
    window.addEventListener('resize', () => this.resize())
    this.canvas.addEventListener('pointermove', event => {
      this.pointer.set(event.clientX / this.canvas.clientWidth * 2 - 1, 1 - event.clientY / this.canvas.clientHeight * 2)
    })
    this.canvas.addEventListener('pointerleave', () => this.pointer.set(0,0))
    this.resize()
    this.cards.sync(null)
    this.renderFrame(performance.now())
    this.renderer.setAnimationLoop(this.renderFrame)
  }

  resize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35))
    this.renderer.setSize(width,height)
    this.camera.aspect = width / Math.max(1,height)
    this.camera.updateProjectionMatrix()
    this.cards.resize(this.camera.aspect)
    this.dirty = true
  }

  sync(room) {
    if (room === this.room) return
    const self = room?.players.find(player => player.id === room.selfId)
    this.room = room
    this.seat = self ? SEATS[self.seat] : null
    this.avatars.sync(room)
    this.cards.sync(room)
    this.dirty = true
  }

  renderFrame(time) {
    if (document.hidden || (this.still && !this.dirty)) {
      this.lastTime = time
      return
    }
    const dt = Math.min(.05,Math.max(0,(time - this.lastTime) / 1000))
    this.lastTime = time
    const seconds = time / 1000
    const mix = this.still ? 1 : 1 - Math.exp(-dt * 4)
    const position = this.desiredPosition ??= new T.Vector3()
    const aim = this.desiredAim ??= new T.Vector3()

    if (this.seat) {
      const { x,z,yaw } = this.seat
      const drift = this.still ? 0 : this.pointer.x * 1.07
      const emphasis = this.room.match?.phase === 'results' ? .06 : 0
      position.set(x + Math.sin(yaw) * .46, 2.79, z + Math.cos(yaw) * .46)
      aim.set(Math.cos(yaw) * drift, 1.47 + (this.still ? 0 : this.pointer.y * .18),
        -Math.sin(yaw) * drift)
      aim.x -= Math.sin(yaw) * emphasis
      aim.z -= Math.cos(yaw) * emphasis
    } else {
      const angle = this.still ? 0 : Math.sin(seconds * .15) * .036
      position.set(6.2 + angle * 4, 4.72, 5.86 - angle * 5)
      aim.set(-1.21, .89, .7)
    }
    this.camera.position.lerp(position,mix)
    this.target.lerp(aim,mix)
    this.camera.lookAt(this.target)
    const fov = this.seat ? PLAY_FOV : MENU_FOV
    if (this.camera.fov !== fov) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    this.avatars.animate(seconds,this.still)
    this.renderer.render(this.scene,this.camera)
    this.dirty = false
  }
}
