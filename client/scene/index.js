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
    const gl = this.renderer.getContext()
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    const driver = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : ''
    this.software = /swiftshader|llvmpipe|software/i.test(driver)
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
    this.cards.still = this.still
    this.sensitivity = .65
    this.quality = 'Medium'
    this.ray = new T.Raycaster()
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
    this.canvas.addEventListener('pointermove', event => this.point(event))
    this.canvas.addEventListener('pointerleave', () => {
      this.pointer.set(0,0)
      this.hover(null)
    })
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return
      this.down = { x: event.clientX, y: event.clientY }
    })
    this.canvas.addEventListener('pointerup', event => {
      const down = this.down
      this.down = null
      if (!down || event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return
      const view = this.point(event)
      const action = this.cards.action(view)
      if (action) {
        view.pressedAt = performance.now()
        this.dirty = true
        this.container.dispatchEvent(new CustomEvent('cardaction', { detail: { action, id: view.data.id } }))
      } else if (view?.data.own && this.room?.match?.phase === 'vote') {
        this.container.dispatchEvent(new Event('owncard'))
      }
    })
    this.canvas.addEventListener('pointercancel', () => { this.down = null })
    this.resize()
    this.cards.sync(null)
    this.renderFrame(performance.now())
    this.renderer.setAnimationLoop(this.renderFrame)
  }

  configure(settings) {
    this.still = settings.reduced
    this.cards.still = this.still
    this.sensitivity = settings.sensitivity / 100
    this.quality = settings.quality
    const resolution = settings.quality === 'High' ? 2048 : 1024
    this.renderer.shadowMap.enabled = settings.quality !== 'Low'
    if (this.key.shadow.mapSize.x !== resolution) {
      this.key.shadow.map?.dispose()
      this.key.shadow.map = null
      this.key.shadow.mapSize.set(resolution,resolution)
    }
    this.key.shadow.needsUpdate = true
    this.resize()
  }

  point(event) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2)
    this.camera.updateWorldMatrix(true,false)
    this.ray.setFromCamera(this.pointer,this.camera)
    const view = this.cards.pick(this.ray)
    this.hover(view)
    return view
  }

  hover(view) {
    if (view !== this.cards.hovered) {
      this.dirty = true
      this.cards.hovered = view
      this.container.dispatchEvent(new CustomEvent('cardhover', { detail: view?.data ?? null }))
    }
    this.canvas.style.cursor = this.cards.action(view) ? 'pointer' : view ? 'default' : ''
  }

  resize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    const ratio = { Low: .72, Medium: 1, High: Math.min(1.8, Math.max(1.25,devicePixelRatio)) }[this.quality]
    this.renderer.setPixelRatio(ratio)
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
    const hovered = this.cards.hovered
    this.cards.sync(room)
    if (hovered && !this.cards.hovered) this.container.dispatchEvent(new CustomEvent('cardhover', { detail: null }))
    this.hover(this.cards.hovered)
    this.dirty = true
  }

  renderFrame(time) {
    if (document.hidden || (this.still && !this.dirty)) {
      this.lastTime = time
      return
    }
    if (!this.dirty && this.software && time - this.lastTime < 33) return
    const dt = Math.min(.08,Math.max(0,(time - this.lastTime) / 1000))
    this.lastTime = time
    const seconds = time / 1000
    const mix = this.still ? 1 : 1 - Math.exp(-dt * 4)
    const position = this.desiredPosition ??= new T.Vector3()
    const aim = this.desiredAim ??= new T.Vector3()

    if (this.seat) {
      const { x,z,yaw } = this.seat
      const focused = Boolean(this.cards.hovered)
      const strength = this.sensitivity * 1.54
      const drift = this.still ? 0 : this.pointer.x * strength * (focused ? .32 : 1.07)
      const emphasis = this.room.match?.phase === 'results' ? .06 : 0
      position.set(x + Math.sin(yaw) * .46, 2.79, z + Math.cos(yaw) * .46)
      aim.set(Math.cos(yaw) * drift, 1.47 + (this.still ? 0 : this.pointer.y * .18 * strength),
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
    this.cards.animate(time,dt)
    this.renderer.render(this.scene,this.camera)
    this.dirty = false
  }
}
