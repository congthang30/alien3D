/**
 * SciFiAudio
 * Advanced procedural Web Audio API sound generator for the Spaceship experience.
 * Features:
 * - Multi-layer engine synthesis (Sub-bass rumble, Ion turbine harmonics, Jet exhaust airflow)
 * - Real-time 3D spatial audio & stereo panning (tracks spaceship X/Y/Z)
 * - Atmospheric distance attenuation & high-frequency air absorption
 * - Dynamic Doppler frequency modulation (pitch shifts based on approach/recede velocity)
 * - Authentic procedural SFX: Reactor Ignition, Takeoff Blast, and Hollywood Flyby Whoosh
 */
export class SciFiAudio {
  constructor() {
    this.ctx = null
    this.masterGain = null

    // Spatial and environmental nodes
    this.panner = null
    this.distanceFilter = null
    this.distanceGain = null

    // Multi-layer engine synthesis nodes
    this.subOsc = null
    this.subGain = null
    this.turbineOsc1 = null
    this.turbineOsc2 = null
    this.turbineFilter = null
    this.turbineGain = null
    this.jetSource = null
    this.jetFilter = null
    this.jetGain = null

    // Background cosmic ambient
    this.ambientGain = null

    // State tracking
    this.isMuted = false
    this.isEnabled = false
    this.lastDistance = 4.0
    this.lastTime = 0
    this.lastFlybyTime = 0

    // Shared noise buffer for synthesizers
    this.noiseBuffer = null
  }

  init() {
    if (this.ctx) return
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    this.ctx = new AudioContext()

    // Master Output Gain
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.setValueAtTime(0.55, this.ctx.currentTime)
    this.masterGain.connect(this.ctx.destination)

    // Pre-create shared noise buffer (2 seconds loopable pink/turbulent noise)
    this._createNoiseBuffer()

    // Initialize 3D Spatial Processing Bus
    this._initSpatialBus()

    // Start engine and ambient layers
    this.startEngineSound()
    this.startCosmicAmbient()

    this.isEnabled = true
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  _createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = this.noiseBuffer.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0

    // Generate warm pink-brown noise
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
      b6 = white * 0.115926
    }
  }

  _initSpatialBus() {
    // Air Absorption Filter (simulates atmosphere absorbing high frequencies over distance)
    this.distanceFilter = this.ctx.createBiquadFilter()
    this.distanceFilter.type = 'lowpass'
    this.distanceFilter.frequency.setValueAtTime(14000, this.ctx.currentTime)
    this.distanceFilter.Q.setValueAtTime(0.7, this.ctx.currentTime)

    // Distance Attenuation Gain
    this.distanceGain = this.ctx.createGain()
    this.distanceGain.gain.setValueAtTime(0.85, this.ctx.currentTime)

    // Stereo Panner (smoothly moves left/right matching the ship on screen)
    if (this.ctx.createStereoPanner) {
      this.panner = this.ctx.createStereoPanner()
      this.panner.pan.setValueAtTime(0, this.ctx.currentTime)

      this.distanceFilter.connect(this.distanceGain)
      this.distanceGain.connect(this.panner)
      this.panner.connect(this.masterGain)
    } else {
      this.distanceFilter.connect(this.distanceGain)
      this.distanceGain.connect(this.masterGain)
    }
  }

  /**
   * Continuous multi-layer spaceship engine sound
   */
  startEngineSound() {
    if (!this.ctx) return
    const now = this.ctx.currentTime

    // 1. SUB-BASS RUMBLE (Deep, chest-thumping mechanical drone)
    this.subOsc = this.ctx.createOscillator()
    this.subOsc.type = 'sine'
    this.subOsc.frequency.setValueAtTime(46, now)

    this.subGain = this.ctx.createGain()
    this.subGain.gain.setValueAtTime(0.12, now)

    this.subOsc.connect(this.subGain)
    this.subGain.connect(this.distanceFilter)
    this.subOsc.start()

    // 2. ION TURBINE HARMONICS (Detuned dual oscillators with resonant sweep)
    this.turbineOsc1 = this.ctx.createOscillator()
    this.turbineOsc1.type = 'sawtooth'
    this.turbineOsc1.frequency.setValueAtTime(78, now)

    this.turbineOsc2 = this.ctx.createOscillator()
    this.turbineOsc2.type = 'triangle'
    this.turbineOsc2.frequency.setValueAtTime(80.5, now)

    this.turbineFilter = this.ctx.createBiquadFilter()
    this.turbineFilter.type = 'lowpass'
    this.turbineFilter.frequency.setValueAtTime(260, now)
    this.turbineFilter.Q.setValueAtTime(3.2, now)

    this.turbineGain = this.ctx.createGain()
    this.turbineGain.gain.setValueAtTime(0.08, now)

    this.turbineOsc1.connect(this.turbineFilter)
    this.turbineOsc2.connect(this.turbineFilter)
    this.turbineFilter.connect(this.turbineGain)
    this.turbineGain.connect(this.distanceFilter)

    this.turbineOsc1.start()
    this.turbineOsc2.start()

    // 3. JET EXHAUST AIRFLOW / PLASMA RUSH (Continuous shaped pink noise)
    this.jetSource = this.ctx.createBufferSource()
    this.jetSource.buffer = this.noiseBuffer
    this.jetSource.loop = true

    this.jetFilter = this.ctx.createBiquadFilter()
    this.jetFilter.type = 'bandpass'
    this.jetFilter.frequency.setValueAtTime(580, now)
    this.jetFilter.Q.setValueAtTime(1.8, now)

    this.jetGain = this.ctx.createGain()
    this.jetGain.gain.setValueAtTime(0.04, now)

    this.jetSource.connect(this.jetFilter)
    this.jetFilter.connect(this.jetGain)
    this.jetGain.connect(this.distanceFilter)

    this.jetSource.start()
  }

  /**
   * Soft ethereal cosmic background atmosphere
   */
  startCosmicAmbient() {
    if (!this.ctx) return

    this.ambientGain = this.ctx.createGain()
    this.ambientGain.gain.setValueAtTime(0.09, this.ctx.currentTime)
    this.ambientGain.connect(this.masterGain)

    const ambientSource = this.ctx.createBufferSource()
    ambientSource.buffer = this.noiseBuffer
    ambientSource.loop = true

    const ambientFilter = this.ctx.createBiquadFilter()
    ambientFilter.type = 'lowpass'
    ambientFilter.frequency.setValueAtTime(380, this.ctx.currentTime)

    ambientSource.connect(ambientFilter)
    ambientFilter.connect(this.ambientGain)
    ambientSource.start()
  }

  /**
   * Modulates sound parameters in real time based on flight telemetry & 3D camera position
   */
  updateTelemetry(telemetry, cameraPos = null) {
    if (!this.ctx || !this.isEnabled || this.isMuted) return

    const now = this.ctx.currentTime
    const { stageIndex, thrusterIntensity, shake, position } = telemetry

    // Default reference camera: center spectator at eye-level (0, 1.4, 0)
    const camX = cameraPos ? cameraPos.x : 0
    const camY = cameraPos ? cameraPos.y : 1.4
    const camZ = cameraPos ? cameraPos.z : 0

    // Compute 3D vector from camera to ship
    const relX = position ? position.x - camX : 0
    const relY = position ? position.y - camY : 0
    const relZ = position ? position.z - camZ : -4.0
    const distance = Math.max(1.2, Math.sqrt(relX * relX + relY * relY + relZ * relZ))

    // Real-time Doppler calculation based on distance rate of change
    const nowPerf = performance.now() * 0.001
    const dt = this.lastTime > 0 ? Math.min(Math.max(nowPerf - this.lastTime, 0.005), 0.1) : 0.016
    const radialVelocity = (distance - this.lastDistance) / dt // negative = approaching, positive = receding
    this.lastDistance = distance
    this.lastTime = nowPerf

    // Doppler pitch factor (approaching: higher pitch, receding: lower pitch)
    const dopplerFactor = Math.min(Math.max(1.0 - (radialVelocity / 32.0), 0.78), 1.28)

    // 1. STEREO PANNING (tracks ship X relative to camera view)
    if (this.panner) {
      const panSpread = Math.abs(relZ) * 0.65 + 1.2
      const targetPan = Math.min(Math.max(relX / panSpread, -0.88), 0.88)
      this.panner.pan.setTargetAtTime(targetPan, now, 0.06)
    }

    // 2. DISTANCE ATTENUATION & AIR ABSORPTION
    if (this.distanceGain) {
      // Natural inverse-distance rolloff with minimum baseline
      const targetDistVol = stageIndex === 0 ? 0.45 : Math.min(Math.max(3.8 / (distance + 1.2), 0.22), 1.35)
      this.distanceGain.gain.setTargetAtTime(targetDistVol, now, 0.08)
    }

    if (this.distanceFilter) {
      // High frequencies diminish when far away (atmospheric damping)
      const targetCutoff = stageIndex === 0 ? 1200 : Math.min(Math.max(16000 / (1.0 + distance * 0.32), 1400), 16000)
      this.distanceFilter.frequency.setTargetAtTime(targetCutoff, now, 0.08)
    }

    // 3. ENGINE OSCILLATORS & THROTTLE MODULATION
    const isGround = stageIndex === 0
    const isIgnition = stageIndex === 1
    const throttle = Math.max(0, thrusterIntensity || 1.0)
    const basePitch = isGround ? 44 : isIgnition ? 48 : (52 + throttle * 24) * dopplerFactor

    if (this.subOsc) {
      this.subOsc.frequency.setTargetAtTime(basePitch, now, 0.07)
    }
    if (this.subGain) {
      const subVol = isGround ? 0.04 : isIgnition ? 0.09 : 0.11 + throttle * 0.05
      this.subGain.gain.setTargetAtTime(subVol, now, 0.07)
    }

    if (this.turbineOsc1 && this.turbineOsc2) {
      this.turbineOsc1.frequency.setTargetAtTime(basePitch * 1.58, now, 0.07)
      this.turbineOsc2.frequency.setTargetAtTime(basePitch * 1.63, now, 0.07)
    }

    if (this.turbineFilter) {
      const turbineCutoff = isGround ? 180 : (320 + throttle * 480 + (shake || 0) * 200) * dopplerFactor
      this.turbineFilter.frequency.setTargetAtTime(turbineCutoff, now, 0.07)
    }

    if (this.turbineGain) {
      const turbVol = isGround ? 0.02 : 0.06 + throttle * 0.06
      this.turbineGain.gain.setTargetAtTime(turbVol, now, 0.07)
    }

    // 4. JET EXHAUST AIRFLOW (roaring plasma hiss)
    if (this.jetFilter && this.jetGain) {
      const jetFreq = isGround ? 350 : (600 + throttle * 650) * dopplerFactor
      const jetVol = isGround ? 0.01 : 0.04 + throttle * 0.07
      this.jetFilter.frequency.setTargetAtTime(jetFreq, now, 0.07)
      this.jetGain.gain.setTargetAtTime(jetVol, now, 0.07)
    }
  }

  /**
   * Event 1: Engine Ignition Pulse (1.2s - 2.5s)
   * High-tech reactor power surge with resonant spool-up and sub thump
   */
  triggerIgnition() {
    if (!this.ctx || !this.isEnabled || this.isMuted) return
    const now = this.ctx.currentTime

    // Power surge spool-up tone
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(35, now)
    osc.frequency.exponentialRampToValueAtTime(160, now + 1.1)

    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(120, now)
    filter.frequency.exponentialRampToValueAtTime(750, now + 1.1)
    filter.Q.setValueAtTime(4.0, now)

    gain.gain.setValueAtTime(0.01, now)
    gain.gain.linearRampToValueAtTime(0.26, now + 0.6)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.3)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.masterGain)

    osc.start(now)
    osc.stop(now + 1.35)

    // Deep sub-bass ignition thump
    const subOsc = this.ctx.createOscillator()
    const subGain = this.ctx.createGain()
    subOsc.type = 'sine'
    subOsc.frequency.setValueAtTime(80, now + 0.3)
    subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.9)

    subGain.gain.setValueAtTime(0.01, now + 0.3)
    subGain.gain.linearRampToValueAtTime(0.32, now + 0.45)
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2)

    subOsc.connect(subGain)
    subGain.connect(this.masterGain)

    subOsc.start(now + 0.3)
    subOsc.stop(now + 1.25)
  }

  /**
   * Event 2: Takeoff Liftoff Blast (2.5s - 5.0s)
   * Powerful rocket propulsion surge, deep launch bass and rushing jet blast
   */
  triggerTakeoff() {
    if (!this.ctx || !this.isEnabled || this.isMuted) return
    const now = this.ctx.currentTime

    // 1. Ascending Turbine Roar
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(70, now)
    osc.frequency.exponentialRampToValueAtTime(240, now + 1.8)

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(320, now)
    filter.frequency.exponentialRampToValueAtTime(1400, now + 1.6)
    filter.Q.setValueAtTime(2.5, now)

    gain.gain.setValueAtTime(0.02, now)
    gain.gain.linearRampToValueAtTime(0.3, now + 0.5)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.2)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.masterGain)

    osc.start(now)
    osc.stop(now + 2.2)

    // 2. Blast Noise Whoosh
    if (this.noiseBuffer) {
      const blastSrc = this.ctx.createBufferSource()
      blastSrc.buffer = this.noiseBuffer

      const blastFilter = this.ctx.createBiquadFilter()
      blastFilter.type = 'bandpass'
      blastFilter.frequency.setValueAtTime(400, now)
      blastFilter.frequency.exponentialRampToValueAtTime(1200, now + 0.9)
      blastFilter.frequency.exponentialRampToValueAtTime(500, now + 2.2)
      blastFilter.Q.setValueAtTime(1.5, now)

      const blastGain = this.ctx.createGain()
      blastGain.gain.setValueAtTime(0.02, now)
      blastGain.gain.linearRampToValueAtTime(0.38, now + 0.6)
      blastGain.gain.exponentialRampToValueAtTime(0.001, now + 2.4)

      blastSrc.connect(blastFilter)
      blastFilter.connect(blastGain)
      blastGain.connect(this.masterGain)

      blastSrc.start(now)
      blastSrc.stop(now + 2.4)
    }
  }

  /**
   * Event 3: Close Flyby Whoosh (22.5s - 24.0s / closest approach)
   * Dramatic Hollywood cinematic flyby: stereo sweep from left to right,
   * high-speed air compression whoosh, and Doppler pitch drop!
   */
  triggerFlyby() {
    if (!this.ctx || !this.isEnabled || this.isMuted) return
    const now = this.ctx.currentTime

    // Debounce to prevent overlapping flyby sounds
    if (now - this.lastFlybyTime < 3.0) return
    this.lastFlybyTime = now

    // 1. Stereo Panner Sweep (left-to-right pass matching flight trajectory)
    let flybyPanner = null
    if (this.ctx.createStereoPanner) {
      flybyPanner = this.ctx.createStereoPanner()
      flybyPanner.pan.setValueAtTime(-0.82, now)
      flybyPanner.pan.linearRampToValueAtTime(0.0, now + 0.7)
      flybyPanner.pan.linearRampToValueAtTime(0.85, now + 1.8)
    }

    // 2. Jet Wash Air Whoosh (sweeping bandpass noise)
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource()
      noise.buffer = this.noiseBuffer

      const noiseFilter = this.ctx.createBiquadFilter()
      noiseFilter.type = 'bandpass'
      noiseFilter.frequency.setValueAtTime(320, now)
      noiseFilter.frequency.exponentialRampToValueAtTime(2600, now + 0.65) // Peak rush right in front
      noiseFilter.frequency.exponentialRampToValueAtTime(380, now + 1.9)
      noiseFilter.Q.setValueAtTime(2.2, now)

      const noiseGain = this.ctx.createGain()
      noiseGain.gain.setValueAtTime(0.01, now)
      noiseGain.gain.linearRampToValueAtTime(0.48, now + 0.65) // Maximum loudness at closest point
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0)

      noise.connect(noiseFilter)
      noiseFilter.connect(noiseGain)

      if (flybyPanner) {
        noiseGain.connect(flybyPanner)
        flybyPanner.connect(this.masterGain)
      } else {
        noiseGain.connect(this.masterGain)
      }

      noise.start(now)
      noise.stop(now + 2.0)
    }

    // 3. Doppler Turbine Whine (dives from 540Hz down to 110Hz)
    const turbine = this.ctx.createOscillator()
    turbine.type = 'triangle'
    turbine.frequency.setValueAtTime(560, now)
    turbine.frequency.exponentialRampToValueAtTime(130, now + 1.6)

    const turbGain = this.ctx.createGain()
    turbGain.gain.setValueAtTime(0.02, now)
    turbGain.gain.linearRampToValueAtTime(0.28, now + 0.6)
    turbGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8)

    turbine.connect(turbGain)
    if (flybyPanner) {
      turbGain.connect(flybyPanner)
    } else {
      turbGain.connect(this.masterGain)
    }

    turbine.start(now)
    turbine.stop(now + 1.8)

    // 4. Sub-Bass Jet Core Rumble on Closest Approach
    const sub = this.ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.setValueAtTime(65, now + 0.4)
    sub.frequency.exponentialRampToValueAtTime(38, now + 1.4)

    const subGain = this.ctx.createGain()
    subGain.gain.setValueAtTime(0.01, now + 0.4)
    subGain.gain.linearRampToValueAtTime(0.35, now + 0.68)
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6)

    sub.connect(subGain)
    subGain.connect(this.masterGain)

    sub.start(now + 0.4)
    sub.stop(now + 1.6)
  }

  toggleMute() {
    if (!this.masterGain || !this.ctx) return false
    this.isMuted = !this.isMuted
    const now = this.ctx.currentTime
    this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.55, now, 0.05)
    return this.isMuted
  }
}

