import * as THREE from 'three'

/**
 * IonThrusterVFX
 * High-performance GPU-friendly particle system for mobile WebAR.
 * Emits glowing plasma ion thrusters and engine ribbons behind the spaceship.
 */
export class IonThrusterVFX {
  constructor(scene, maxParticles = 260) {
    this.scene = scene
    this.maxParticles = maxParticles

    // Pre-allocated typed arrays for maximum performance
    this.positions = new Float32Array(maxParticles * 3)
    this.velocities = new Float32Array(maxParticles * 3)
    this.colors = new Float32Array(maxParticles * 3)
    this.sizes = new Float32Array(maxParticles)
    this.lifetimes = new Float32Array(maxParticles)
    this.maxLifetimes = new Float32Array(maxParticles)

    this.activeCount = 0

    // Particle texture generation (soft glowing plasma disc)
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)')
    gradient.addColorStop(0.25, 'rgba(0, 240, 255, 0.85)')
    gradient.addColorStop(0.65, 'rgba(0, 140, 255, 0.35)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)

    const texture = new THREE.CanvasTexture(canvas)

    // Geometry & Material
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1))

    this.material = new THREE.PointsMaterial({
      size: 0.35,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      opacity: 0.9,
    })

    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.scene.add(this.points)

    this._tempSpawn = new THREE.Vector3()
    this._tempDir = new THREE.Vector3()
  }

  attachToScene(newScene) {
    if (this.points.parent) {
      this.points.parent.remove(this.points)
    }
    this.scene = newScene
    newScene.add(this.points)
  }

  /**
   * Spawns new thruster particles from the engine nozzle
   */
  emit(origin, backwardDir, count = 2, speedMultiplier = 1.0, colorHex = 0x00d4ff) {
    const col = new THREE.Color(colorHex)
    const baseR = col.r
    const baseG = col.g
    const baseB = col.b

    for (let i = 0; i < count; i++) {
      let idx = -1
      // Find inactive slot or overwrite oldest
      if (this.activeCount < this.maxParticles) {
        idx = this.activeCount
        this.activeCount++
      } else {
        idx = Math.floor(Math.random() * this.maxParticles)
      }

      const pIdx = idx * 3

      // Slight jitter around nozzle origin
      const jitter = 0.08
      this.positions[pIdx] = origin.x + (Math.random() - 0.5) * jitter
      this.positions[pIdx + 1] = origin.y + (Math.random() - 0.5) * jitter
      this.positions[pIdx + 2] = origin.z + (Math.random() - 0.5) * jitter

      // Velocity: shoots backward along backwardDir with slight spread
      const speed = (2.5 + Math.random() * 2.0) * speedMultiplier
      const spread = 0.35
      this.velocities[pIdx] = backwardDir.x * speed + (Math.random() - 0.5) * spread
      this.velocities[pIdx + 1] = backwardDir.y * speed + (Math.random() - 0.5) * spread
      this.velocities[pIdx + 2] = backwardDir.z * speed + (Math.random() - 0.5) * spread

      // Color variation (white hot core to neon cyan)
      const whiteBlend = Math.random() * 0.4
      this.colors[pIdx] = THREE.MathUtils.lerp(baseR, 1.0, whiteBlend)
      this.colors[pIdx + 1] = THREE.MathUtils.lerp(baseG, 1.0, whiteBlend)
      this.colors[pIdx + 2] = THREE.MathUtils.lerp(baseB, 1.0, whiteBlend)

      this.sizes[idx] = 0.25 + Math.random() * 0.2
      this.lifetimes[idx] = 0.0
      this.maxLifetimes[idx] = 0.45 + Math.random() * 0.35
    }
  }

  /**
   * Updates existing particles per frame
   */
  update(delta) {
    const pos = this.positions
    const vel = this.velocities
    const col = this.colors
    const sizes = this.sizes
    const life = this.lifetimes
    const maxLife = this.maxLifetimes

    let needPosUpdate = false

    for (let i = 0; i < this.activeCount; i++) {
      life[i] += delta
      if (life[i] >= maxLife[i]) {
        // Swap with last active particle to keep array compact
        const lastIdx = this.activeCount - 1
        if (i !== lastIdx) {
          const pI = i * 3
          const pL = lastIdx * 3
          pos[pI] = pos[pL]
          pos[pI + 1] = pos[pL + 1]
          pos[pI + 2] = pos[pL + 2]
          vel[pI] = vel[pL]
          vel[pI + 1] = vel[pL + 1]
          vel[pI + 2] = vel[pL + 2]
          col[pI] = col[pL]
          col[pI + 1] = col[pL + 1]
          col[pI + 2] = col[pL + 2]
          sizes[i] = sizes[lastIdx]
          life[i] = life[lastIdx]
          maxLife[i] = maxLife[lastIdx]
        }
        this.activeCount--
        i--
        needPosUpdate = true
        continue
      }

      const pI = i * 3
      // Integrate velocity with slight drag
      pos[pI] += vel[pI] * delta
      pos[pI + 1] += vel[pI + 1] * delta
      pos[pI + 2] += vel[pI + 2] * delta

      vel[pI] *= 0.94
      vel[pI + 1] *= 0.94
      vel[pI + 2] *= 0.94

      // Size expands slightly as particle cools down
      const progress = life[i] / maxLife[i]
      sizes[i] = (0.25 + progress * 0.45) * (1.0 - progress * 0.6)

      needPosUpdate = true
    }

    if (needPosUpdate) {
      this.geometry.attributes.position.needsUpdate = true
      this.geometry.attributes.color.needsUpdate = true
      this.geometry.attributes.size.needsUpdate = true
    }
  }

  clear() {
    this.activeCount = 0
    this.geometry.attributes.position.needsUpdate = true
  }
}
