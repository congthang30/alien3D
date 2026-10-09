import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * SpaceshipRig
 * A single unified parent rig containing both the Spaceship and the Boy models.
 * Guarantees that the boy is physically and naturally attached to the spaceship at all times,
 * moving, tilting, banking, and vibrating together as one cinematic entity.
 */
export class SpaceshipRig {
  constructor() {
    // The master parent rig
    this.rig = new THREE.Group()
    this.rig.name = 'SpaceshipRig'

    // Sub-groups inside the rig
    this.spaceshipModel = null
    this.boyModel = null

    // Animation mixers
    this.spaceshipMixer = null
    this.boyMixer = null
    this.spaceshipAction = null
    this.boyAction = null

    // Engine thruster effects
    this.engineLight = null
    this.beamMaterials = []

    // Rig shake / rumble vibration
    this.shakeIntensity = 0.0
    this.shakeOffset = new THREE.Vector3()

    // Configuration constants (derived from GLB inspection)
    this.BOY_SCALE = 0.0026 // Scales raw 517 unit boy to realistic ~1.35m height
    this.BOY_LOCAL_POS = new THREE.Vector3(0, 0.74, -0.05) // Aligned to spaceship roof center
    this.BASE_SCALE = 0.85 // Default comfortable WebAR room/world scale
  }

  /**
   * Loads both GLB models and attaches them to the unified rig.
   */
  async load(onProgress = () => {}) {
    const loader = new GLTFLoader()

    // Helper for loading with progress
    const loadGltf = (url, weight, baseProgress) => {
      return new Promise((resolve, reject) => {
        loader.load(
          url,
          (gltf) => resolve(gltf),
          (xhr) => {
            if (xhr.lengthComputable && xhr.total > 0) {
              const p = baseProgress + (xhr.loaded / xhr.total) * weight
              onProgress(Math.min(p, 0.99))
            }
          },
          (err) => reject(err)
        )
      })
    }

    try {
      // 1. Load Spaceship GLB
      const spaceshipGltf = await loadGltf('/model/spaceship.glb', 0.3, 0.0)
      this.setupSpaceship(spaceshipGltf)
      onProgress(0.35)

      // 2. Load Boy GLB
      const boyGltf = await loadGltf('/model/boy.glb', 0.65, 0.35)
      this.setupBoy(boyGltf)
      onProgress(1.0)

      // 3. Attach Engine Thruster Lighting & VFX
      this.setupEngineVFX()

      // Set base rig scale
      this.setScale(this.BASE_SCALE)

      console.info('[SpaceshipRig] Spaceship and Boy successfully loaded and attached to unified rig.')
      return this.rig
    } catch (error) {
      console.error('[SpaceshipRig] Error loading models:', error)
      throw error
    }
  }

  /**
   * Configures the spaceship model and its animations
   */
  setupSpaceship(gltf) {
    this.spaceshipModel = gltf.scene
    this.spaceshipModel.name = 'Spaceship_Model'

    // Preserve the model's original meshes and its authentic built-in flame effect
    this.spaceshipModel.traverse((node) => {
      if (node.isMesh) {
        node.visible = true

        if (node.name.includes('beam') || (node.material && node.material.name === 'beam_M')) {
          // Keep the model's own flame effect intact with soft alpha
          node.castShadow = false
          node.receiveShadow = false
          if (node.material) {
            node.material.transparent = true
            node.material.depthWrite = false
          }
        } else {
          node.castShadow = true
          node.receiveShadow = true
        }
      }
    })

    // Spaceship local position at rig origin
    this.spaceshipModel.position.set(0, 0, 0)
    this.spaceshipModel.rotation.set(0, 0, 0)
    this.rig.add(this.spaceshipModel)

    // Setup spaceship idle animation
    if (gltf.animations && gltf.animations.length > 0) {
      this.spaceshipMixer = new THREE.AnimationMixer(this.spaceshipModel)
      const clip = gltf.animations.find((c) => c.name.includes('Idle')) || gltf.animations[0]
      this.spaceshipAction = this.spaceshipMixer.clipAction(clip)
      this.spaceshipAction.setLoop(THREE.LoopRepeat)
      this.spaceshipAction.play()
    }
  }

  /**
   * Configures the boy model and attaches him on top of the spaceship
   */
  setupBoy(gltf) {
    this.boyModel = gltf.scene
    this.boyModel.name = 'Boy_Model'

    // Configure materials and shadows
    this.boyModel.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true
        node.receiveShadow = true

        if (node.material) {
          node.material.roughness = 0.55
          node.material.metalness = 0.15
        }
      }
    })

    // Crucial requirement: Boy is child of the same SpaceshipRig!
    // Positioned naturally standing on the spaceship roof
    this.boyModel.scale.setScalar(this.BOY_SCALE)
    this.boyModel.position.copy(this.BOY_LOCAL_POS)
    this.boyModel.rotation.set(0, 0, 0) // Faces forward along local +Z matching the ship nose
    this.rig.add(this.boyModel)

    // Setup boy idle / ready animation ('Hunter Mode')
    if (gltf.animations && gltf.animations.length > 0) {
      this.boyMixer = new THREE.AnimationMixer(this.boyModel)
      const clip = gltf.animations.find((c) => c.name.includes('Hunter')) || gltf.animations[0]
      this.boyAction = this.boyMixer.clipAction(clip)
      this.boyAction.setLoop(THREE.LoopRepeat)
      this.boyAction.play()
    }
  }

  /**
   * Engine thruster setup (kept clean, no artificial lights or overlays)
   */
  setupEngineVFX() {
    // Kept clean per requirement: preserve models intact without artificial lights
  }

  /**
   * Sets overall scale of the rig (preserves boy/spaceship ratio)
   */
  setScale(scaleValue) {
    this.rig.scale.setScalar(scaleValue)
  }

  /**
   * Sets engine shake rumble intensity during startup/takeoff
   */
  setShake(intensity) {
    this.shakeIntensity = THREE.MathUtils.clamp(intensity, 0, 1)
  }

  /**
   * Sets dynamic character surfing posture based on spaceship aerodynamics
   * When the ship banks into turns, the boy counter-balances naturally.
   * When the ship pitches up or down, the boy braces forward into the airflow.
   */
  setFlightPosture(roll = 0, pitch = 0) {
    if (!this.boyModel) return
    const targetLeanZ = -roll * 0.22
    const targetLeanX = -pitch * 0.15
    this.boyModel.rotation.z = THREE.MathUtils.lerp(this.boyModel.rotation.z, targetLeanZ, 0.08)
    this.boyModel.rotation.x = THREE.MathUtils.lerp(this.boyModel.rotation.x, targetLeanX, 0.08)
  }

  /**
   * Modulates thruster intensity (no-op since artificial beam/light effects are removed)
   */
  setThrusterIntensity(intensity, colorHex = 0x00d4ff) {
    // Model kept authentic and clean without artificial glow overrides
  }

  /**
   * Returns world position of the thruster nozzle for particle emission
   */
  getThrusterWorldPosition(targetVec) {
    targetVec.set(0, 0.45, -1.6)
    targetVec.applyMatrix4(this.rig.matrixWorld)
    return targetVec
  }

  /**
   * Updates animations and engine vibrations per frame
   */
  update(delta, elapsedTime = 0) {
    // Update model skeletal animations
    if (this.spaceshipMixer) {
      this.spaceshipMixer.update(delta)
    }
    if (this.boyMixer) {
      this.boyMixer.update(delta)
    }

    // Apply engine shake vibration with smooth fadeout
    if (this.shakeIntensity > 0.001) {
      const freq = 42.0
      const amp = this.shakeIntensity * 0.015
      this.shakeOffset.set(
        Math.sin(elapsedTime * freq) * amp,
        Math.cos(elapsedTime * (freq * 1.3)) * amp,
        Math.sin(elapsedTime * (freq * 0.9)) * amp * 0.5
      )
      if (this.spaceshipModel) {
        this.spaceshipModel.position.copy(this.shakeOffset)
      }
      if (this.boyModel) {
        this.boyModel.position.set(
          this.BOY_LOCAL_POS.x + this.shakeOffset.x,
          this.BOY_LOCAL_POS.y + this.shakeOffset.y,
          this.BOY_LOCAL_POS.z + this.shakeOffset.z
        )
      }
    } else {
      if (this.spaceshipModel) {
        this.spaceshipModel.position.lerp(THREE.Vector3.ZERO || new THREE.Vector3(0, 0, 0), 0.15)
      }
      if (this.boyModel) {
        this.boyModel.position.lerp(this.BOY_LOCAL_POS, 0.15)
      }
    }
  }

  /**
   * Sets overall visibility of the rig
   */
  setVisible(visible) {
    this.rig.visible = visible
  }

  /**
   * Sets opacity of all materials in the rig (for smooth fade-out ending)
   */
  setOpacity(opacity) {
    const clamped = THREE.MathUtils.clamp(opacity, 0, 1)
    this.rig.traverse((node) => {
      if (node.isMesh && node.material) {
        node.material.transparent = true
        node.material.opacity = clamped
      }
    })
  }
}
