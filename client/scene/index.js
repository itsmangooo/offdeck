import * as T from 'three'
import { buildRoom, SEATS } from './environment.js'
import { Avatars } from './avatars.js'
import { Cards } from './cards.js'
import { SeatCamera } from './camera.js'

export class TableScene {
  constructor(container,settings) {
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
    this.camera = new T.PerspectiveCamera(49, 1, .08, 45)
    this.rig = new SeatCamera(this.camera)
    this.scene.add(this.camera)
    this.key = buildRoom(this.scene)
    this.avatars = new Avatars(this.scene)
    this.cards = new Cards(this.scene,this.camera)
    this.pointer = new T.Vector2()
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
      if (this.cards.inspecting) {
        this.inspectScenario(false)
        return
      }
      const view = this.point(event)
      if (view?.data.kind === 'scenario') {
        this.inspectScenario(true)
        return
      }
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
    this.configure(settings)
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
    if (!this.renderer.shadowMap.enabled || this.key.shadow.mapSize.x !== resolution) {
      this.key.shadow.map?.dispose()
      this.key.shadow.map = null
      this.key.shadow.mapSize.set(resolution,resolution)
    }
    this.key.shadow.needsUpdate = true
    this.resize()
  }

  inspectScenario(open = !this.cards.inspecting, immediate = false) {
    if (!this.cards.inspect(open,immediate)) return false
    this.hover(null)
    this.dirty = true
    this.container.dispatchEvent(new CustomEvent('scenarioinspection', { detail: open }))
    return true
  }

  point(event) {
    if (this.cards.inspecting) return null
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
    if (this.cards.inspecting) this.canvas.style.cursor = 'zoom-out'
    else if (view?.data.kind === 'scenario') this.canvas.style.cursor = 'zoom-in'
    else this.canvas.style.cursor = this.cards.action(view) ? 'pointer' : view ? 'default' : ''
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
    if (room?.match?.phase !== this.room?.match?.phase || room?.match?.roundId !== this.room?.match?.roundId) {
      this.inspectScenario(false,true)
      this.hover(null)
    }
    const self = room?.players.find(player => player.id === room.selfId)
    const arrivedInMatch = room?.id !== this.room?.id && room?.match
    this.room = room
    this.seat = self ? SEATS[self.seat] : null
    if (arrivedInMatch) this.rig.update({
      seat:this.seat,phase:room.match.phase,still:true,seconds:0,dt:0
    })
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
    this.rig.update({
      seat: this.seat, phase: this.room?.match?.phase, pointer: this.pointer,
      sensitivity: this.sensitivity, locked: this.cards.inspecting || Boolean(this.cards.hovered),
      still: this.still, seconds, dt
    })
    this.avatars.animate(seconds,this.still)
    this.cards.animate(time,dt)
    this.renderer.render(this.scene,this.camera)
    this.dirty = false
  }
}
