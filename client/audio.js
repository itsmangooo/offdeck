const settingsDefault = Object.freeze({ master: 75, effects: 70, muted: false })

export class TableAudio {
  constructor() {
    this.settings = settingsDefault
    this.lastHover = 0
  }

  configure(settings) {
    this.settings = settings
    if (!this.context) return
    const volume = settings.muted ? 0 : settings.master * settings.effects / 10_000
    this.output.gain.setTargetAtTime(volume, this.context.currentTime, .025)
  }

  unlock() {
    if (!window.AudioContext && !window.webkitAudioContext) return
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext
      try {
        this.context = new Audio()
      } catch {
        return
      }
      const { context } = this
      this.output = context.createGain()
      this.output.gain.value = 0
      this.output.connect(context.destination)
      this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * .36), context.sampleRate)
      const samples = this.noise.getChannelData(0)
      for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1
      this.configure(this.settings)
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {})
  }

  paper(at, duration, center, gain, drift = 0) {
    const source = this.context.createBufferSource()
    const band = this.context.createBiquadFilter()
    const envelope = this.context.createGain()
    source.buffer = this.noise
    band.type = 'bandpass'
    band.Q.value = .76
    band.frequency.setValueAtTime(center, at)
    band.frequency.linearRampToValueAtTime(Math.max(300, center + drift), at + duration)
    envelope.gain.setValueAtTime(.0001, at)
    envelope.gain.exponentialRampToValueAtTime(gain, at + .008)
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration)
    source.connect(band).connect(envelope).connect(this.output)
    source.start(at)
    source.stop(at + duration + .01)
  }

  note(at, hz, length, level) {
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = hz
    envelope.gain.setValueAtTime(.0001, at)
    envelope.gain.exponentialRampToValueAtTime(level, at + .014)
    envelope.gain.exponentialRampToValueAtTime(.0001, at + length)
    oscillator.connect(envelope).connect(this.output)
    oscillator.start(at)
    oscillator.stop(at + length + .01)
  }

  play(cue) {
    if (this.context?.state !== 'running' || this.settings.muted || !this.settings.master || !this.settings.effects) return
    const now = this.context.currentTime
    switch (cue) {
      case 'hover':
        if (now - this.lastHover < .085) return
        this.lastHover = now
        this.paper(now,.045,2200,.055,-550)
        break
      case 'select':
        this.paper(now,.07,1730,.13,-400)
        break
      case 'submit':
        this.paper(now,.14,2460,.31,-1300)
        this.note(now + .08,130.81,.10,.095)
        break
      case 'deal':
        for (let i = 0; i < 6; i++) this.paper(now + i * .064,.085,1920 + i * 120,.22,-640)
        break
      case 'flip':
        for (let i = 0; i < 4; i++) this.paper(now + i * .084,.105,2850 - i * 150,.21,-880)
        break
      case 'vote':
        this.paper(now,.075,1450,.18,-480)
        this.note(now + .052,392,.16,.095)
        break
      case 'results':
        this.note(now,261.63,.25,.14)
        this.note(now + .10,392,.32,.10)
        break
      case 'finished':
        for (const [i,hz] of [261.63,329.63,392,523.25].entries()) this.note(now + i * .105,hz,.41,.14 - i * .017)
        break
    }
  }
}
