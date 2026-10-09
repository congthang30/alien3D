import * as THREE from 'three'
import { SpaceshipRig } from './SpaceshipRig.js'
import { FlightPathSystem } from './FlightPathSystem.js'

/**
 * CinematicController
 * Directs the entire "Boy Flying on Spaceship" experience.
 * Orchestrates SpaceshipRig, FlightPathSystem, and audio cues.
 */
export class CinematicController {
  constructor(scene) {
    this.scene = scene
    this.rig = new SpaceshipRig()
    this.flightSystem = new FlightPathSystem()

    this.mode = 'cinematic' // 'cinematic' | 'freeflight'
    this.currentTime = 0
    this.isPlaying = true
    this.playbackSpeed = 1.8
    this.ambientTime = 0

    // Ground anchor offset (allows real-world surface placement)
    this.groundAnchor = new THREE.Vector3(0, 0, 0)

    // Pre-allocated vectors for frame updates
    this._worldPos = new THREE.Vector3()

    this.onStageChange = null
    this.onProgressUpdate = null
    this.lastStageIndex = -1

    // Audio reference
    this.audio = null
  }

  async init(onProgress) {
    await this.rig.load(onProgress)
    this.scene.add(this.rig.rig)

    // Position rig initially at ground start
    const initialSample = this.flightSystem.sample(0, 0, 0.016)
    this.rig.rig.position.copy(initialSample.position).add(this.groundAnchor)
    this.rig.rig.quaternion.copy(initialSample.quaternion)
    return true
  }

  attachToScene(newScene) {
    if (this.rig.rig.parent) {
      this.rig.rig.parent.remove(this.rig.rig)
    }
    this.scene = newScene
    newScene.add(this.rig.rig)
  }

  setAudio(audioInstance) {
    this.audio = audioInstance
  }

  /**
   * Sets real-world surface placement offset
   */
  setGroundAnchor(x, y, z) {
    this.groundAnchor.set(x, y, z)
  }

  play() {
    this.isPlaying = true
  }

  pause() {
    this.isPlaying = false
  }

  togglePlayPause() {
    this.isPlaying = !this.isPlaying
    return this.isPlaying
  }

  replay() {
    this.mode = 'cinematic'
    this.currentTime = 0
    this.isPlaying = true
    this.lastStageIndex = -1
    this.flightSystem.resetState(0)
    this.rig.setVisible(true)
    this.rig.setOpacity(1.0)
    this.rig.setFlightPosture(0, 0)
    const initialSample = this.flightSystem.sample(0, 0, 0.016)
    this.rig.rig.position.copy(initialSample.position).add(this.groundAnchor)
    this.rig.rig.quaternion.copy(initialSample.quaternion)
    this.rig.setShake(0)
  }

  seekToStage(stageIndex) {
    const stage = this.flightSystem.stages[stageIndex]
    if (stage) {
      this.currentTime = stage.startTime
      this.lastStageIndex = -1
      this.flightSystem.resetState(this.currentTime)
      this.rig.setVisible(true)
      this.rig.setOpacity(1.0)
      const telemetry = this.flightSystem.sample(this.currentTime, this.ambientTime, 0.016)
      this.rig.rig.position.copy(telemetry.position).add(this.groundAnchor)
      this.rig.rig.quaternion.copy(telemetry.quaternion)
      this.rig.setFlightPosture(telemetry.smoothedRoll, telemetry.smoothedPitch)
    }
  }

  setFreeFlight(enabled) {
    this.mode = enabled ? 'freeflight' : 'cinematic'
    if (enabled && this.currentTime < 5.0) {
      this.currentTime = 5.0 // Jump straight to flight loop
    }
  }

  /**
   * Main per-frame update loop
   */
  update(delta, camera = null) {
    this.ambientTime += delta

    if (this.isPlaying) {
      this.currentTime += delta * this.playbackSpeed
      // Infinite continuous flight loop:
      // When currentTime reaches totalDuration (24.0s),
      // it seamlessly wraps back to 5.0s (the start of the airborne flight circuit)!
      if (this.currentTime >= this.flightSystem.totalDuration) {
        const flightStartTime = 5.0
        const loopDuration = this.flightSystem.totalDuration - flightStartTime
        this.currentTime = flightStartTime + ((this.currentTime - flightStartTime) % loopDuration)
      }
    }

    // Sample flight path telemetry
    const effectiveDelta = delta * this.playbackSpeed
    const telemetry = this.flightSystem.sample(this.currentTime, this.ambientTime, effectiveDelta)

    // Notify stage changes
    if (telemetry.stageIndex !== this.lastStageIndex) {
      this.lastStageIndex = telemetry.stageIndex
      if (this.onStageChange) {
        this.onStageChange(telemetry.stage, telemetry.stageIndex)
      }

      // Trigger audio events on key stages
      if (this.audio) {
        if (telemetry.stageIndex === 1) {
          this.audio.triggerIgnition()
        } else if (telemetry.stageIndex === 2) {
          this.audio.triggerTakeoff()
        } else if (telemetry.stageIndex === 9) {
          this.audio.triggerFlyby()
        }
      }
    }

    // Notify progress update
    if (this.onProgressUpdate) {
      this.onProgressUpdate(telemetry.progress, this.currentTime, telemetry.stage)
    }

    // Apply 3D Rig Position & Orientation
    this.rig.rig.position.copy(telemetry.position).add(this.groundAnchor)
    this.rig.rig.quaternion.copy(telemetry.quaternion)

    // Apply Rig Engine Shake
    this.rig.setShake(telemetry.shake)

    // Apply Dynamic Surfing Posture to Boy
    this.rig.setFlightPosture(telemetry.smoothedRoll, telemetry.smoothedPitch)

    // Apply Thruster Glow & Color
    this.rig.setThrusterIntensity(telemetry.thrusterIntensity, telemetry.thrusterColor)

    // Apply Ending Fade Opacity
    this.rig.setOpacity(telemetry.opacity)

    // Update skeletal animations and rig vibrations
    this.rig.update(delta, this.ambientTime)

    // Update real-time 3D spatial audio telemetry
    if (this.audio) {
      const camPos = camera ? camera.position : null
      this.audio.updateTelemetry(telemetry, camPos)
    }
  }
}
