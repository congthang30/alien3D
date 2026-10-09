import * as THREE from 'three'

/**
 * FlightPathSystem
 * Generates and evaluates the 3D cinematic flight trajectory for the Spaceship & Boy.
 * Features a realistic VTOL liftoff (level hover, smooth nose-up acceleration)
 * and seamless, gimbal-lock-free aerodynamic flight orientation.
 */
export class FlightPathSystem {
  constructor() {
    this.totalDuration = 24.0 // Fast dynamic runtime in seconds (19s continuous flight loop)

    // Pre-allocated vectors and quaternions to avoid per-frame GC allocations
    this._pos = new THREE.Vector3()
    this._tangent = new THREE.Vector3()
    this._nextTangent = new THREE.Vector3()
    this._prevTangent = new THREE.Vector3()
    this._up = new THREE.Vector3(0, 1, 0)
    this._xAxis = new THREE.Vector3(1, 0, 0)
    this._zAxis = new THREE.Vector3(0, 0, 1)

    this._qYaw = new THREE.Quaternion()
    this._qPitch = new THREE.Quaternion()
    this._qRoll = new THREE.Quaternion()
    this._targetQuat = new THREE.Quaternion()
    this._currentQuat = new THREE.Quaternion()
    this._hoverOffset = new THREE.Vector3()

    // Aerodynamic continuous smoothed roll, pitch, and unwrapped heading
    this.smoothedRoll = 0.0
    this.smoothedPitch = 0.0
    this.smoothedYaw = this.initialYaw
    this.lastSampleTime = 0.0

    // Ground reference coordinates & initial heading
    this.groundPos = new THREE.Vector3(0.0, 0.0, -3.2)
    this.initialYaw = 75 * (Math.PI / 180) // Angled forward-right for cinematic 3/4 view

    // Liftoff end / Flight start point (matches waypoint 0 precisely)
    this.liftoffEndPos = new THREE.Vector3(0.0, 1.7, -3.2)

    // Smooth closed flight loop waypoints (from t = 5.0s onwards)
    // Continuous harmonic aerospace circuit strictly in front of camera (Z in [-12.0m, -3.2m], max turn rate < 24 deg/s)
    this.flightWaypoints = [
      new THREE.Vector3(0.0, 1.7, -3.2),
      new THREE.Vector3(1.02, 1.88, -3.28),
      new THREE.Vector3(1.92, 2.1, -3.53),
      new THREE.Vector3(2.6, 2.32, -3.94),
      new THREE.Vector3(3.04, 2.54, -4.49),
      new THREE.Vector3(3.26, 2.74, -5.16),
      new THREE.Vector3(3.32, 2.91, -5.92),
      new THREE.Vector3(3.31, 3.06, -6.74),
      new THREE.Vector3(3.3, 3.2, -7.6),
      new THREE.Vector3(3.31, 3.34, -8.46),
      new THREE.Vector3(3.32, 3.49, -9.28),
      new THREE.Vector3(3.26, 3.66, -10.04),
      new THREE.Vector3(3.04, 3.86, -10.71),
      new THREE.Vector3(2.6, 4.08, -11.26),
      new THREE.Vector3(1.92, 4.3, -11.67),
      new THREE.Vector3(1.02, 4.52, -11.92),
      new THREE.Vector3(0.0, 4.7, -12.0),
      new THREE.Vector3(-1.02, 4.82, -11.92),
      new THREE.Vector3(-1.92, 4.87, -11.67),
      new THREE.Vector3(-2.6, 4.82, -11.26),
      new THREE.Vector3(-3.04, 4.66, -10.71),
      new THREE.Vector3(-3.26, 4.4, -10.04),
      new THREE.Vector3(-3.32, 4.06, -9.28),
      new THREE.Vector3(-3.31, 3.65, -8.46),
      new THREE.Vector3(-3.3, 3.2, -7.6),
      new THREE.Vector3(-3.31, 2.75, -6.74),
      new THREE.Vector3(-3.32, 2.34, -5.92),
      new THREE.Vector3(-3.26, 2.0, -5.16),
      new THREE.Vector3(-3.04, 1.74, -4.49),
      new THREE.Vector3(-2.6, 1.58, -3.94),
      new THREE.Vector3(-1.92, 1.53, -3.53),
      new THREE.Vector3(-1.02, 1.58, -3.28),
    ]

    // Closed centripetal Catmull-Rom spline: continuous infinite loop!
    this.flightCurve = new THREE.CatmullRomCurve3(this.flightWaypoints, true, 'centripetal', 0.5)

    // Stage Definitions synchronized with actual waypoint locations
    this.stages = [
      {
        id: 0,
        name: 'GROUND_STANDBY',
        title: 'Mặt Đất — Chuẩn Bị',
        subtitle: 'Phi thuyền hạ cánh trên mặt phẳng, cậu bé đứng hiên ngang sẵn sàng xuất kích',
        startTime: 0.0,
        endTime: 1.2,
      },
      {
        id: 1,
        name: 'ENGINE_IGNITION',
        title: 'Động Cơ Khởi Động',
        subtitle: 'Kích hoạt luồng phản lực ion, thân tàu rung nhẹ chuẩn bị cất cánh',
        startTime: 1.2,
        endTime: 2.5,
      },
      {
        id: 2,
        name: 'TAKEOFF_LIFTOFF',
        title: 'Cất Cánh Vút Lên',
        subtitle: 'Phi thuyền êm ái nâng mình khỏi mặt đất, tăng tốc bay lướt lên cao',
        startTime: 2.5,
        endTime: 5.0,
      },
      {
        id: 3,
        name: 'ORBITAL_LOOP',
        title: 'Lượn Vòng Cung Tầm Mắt',
        subtitle: 'Quỹ đạo lượn vòng cung hoành tráng ngay phía trước tầm mắt, nghiêng cánh sống động',
        startTime: 5.0,
        endTime: 7.5,
      },
      {
        id: 4,
        name: 'CROSS_FLIGHT',
        title: 'Băng Ngang Bầu Trời',
        subtitle: 'Phi thuyền lướt ngang tầm mắt người xem và tăng tốc lên cao',
        startTime: 7.5,
        endTime: 10.5,
      },
      {
        id: 5,
        name: 'CLIMB_TO_APEX',
        title: 'Thăng Hoa Lên Điểm Cao',
        subtitle: 'Nâng mũi tàu vươn tới đỉnh cao chiến lược trên bầu trời xa',
        startTime: 10.5,
        endTime: 13.5,
      },
      {
        id: 6,
        name: 'S_CURVE_SLALOM',
        title: 'Vũ Điệu Lượn Sóng S-Curve',
        subtitle: 'Hạ độ cao qua không phận bên trái, uốn lượn nhịp nhàng',
        startTime: 13.5,
        endTime: 16.5,
      },
      {
        id: 7,
        name: 'TURN_AND_DIVE',
        title: 'Chuyển Hướng Lao Tới',
        subtitle: 'Phi thuyền bo cua ngoạn mục bên cánh trái, hạ dần độ cao chuẩn bị lao tới',
        startTime: 16.5,
        endTime: 19.5,
      },
      {
        id: 8,
        name: 'FULL_BOOST_APPROACH',
        title: 'Tăng Tốc Toàn Lực',
        subtitle: 'Động cơ ion gầm rú, phi thuyền tăng tốc với vận tốc tối đa tiến sát tầm mắt',
        startTime: 19.5,
        endTime: 22.5,
      },
      {
        id: 9,
        name: 'CLOSE_FLYBY',
        title: 'Lướt Sát Ống Kính',
        subtitle: 'Phi thuyền cùng cậu bé lao vút sát qua tầm mắt với tốc độ ngoạn mục!',
        startTime: 22.5,
        endTime: 24.0,
      },
    ]

    // Set initial orientation
    this._qYaw.setFromAxisAngle(this._up, this.initialYaw)
    this._currentQuat.copy(this._qYaw)
  }

  getStage(time) {
    let t = Math.max(0, time)
    if (t >= this.totalDuration) {
      const flightStartTime = 5.0
      const loopDuration = this.totalDuration - flightStartTime
      t = flightStartTime + ((t - flightStartTime) % loopDuration)
    }
    const index = this.stages.findIndex((s) => t >= s.startTime && t < s.endTime)
    const stageIndex = index >= 0 ? index : this.stages.length - 1
    return { stage: this.stages[stageIndex], index: stageIndex }
  }

  /**
   * Resets internal smoothing state (useful when seeking or replaying)
   */
  resetState(time = 0.0) {
    this.smoothedRoll = 0.0
    this.smoothedPitch = 0.0
    this.smoothedYaw = this.initialYaw
    this.lastSampleTime = time
    this._qYaw.setFromAxisAngle(this._up, this.initialYaw)
    this._currentQuat.copy(this._qYaw)
  }

  /**
   * Samples 3D position, orientation, and flight parameters
   */
  sample(time, elapsedTime = 0, delta = 0.016) {
    const { stage, index } = this.getStage(time)

    // Detect seeking vs natural loop wrapping
    const flightStartTime = 5.0
    const loopDuration = this.totalDuration - flightStartTime
    const isLoopWrap = Math.abs(time - (this.lastSampleTime - loopDuration)) < 0.4
    const isSeeking = !isLoopWrap && Math.abs(time - this.lastSampleTime) > 0.4
    this.lastSampleTime = time

    let shake = 0.0
    let thrusterIntensity = 1.0
    let thrusterColor = 0x00d4ff
    const opacity = 1.0 // Permanent 100% visibility - never disappears!

    // -------------------------------------------------------------
    // STAGE 0: Ground Standby (0s - 1.2s)
    // -------------------------------------------------------------
    if (index === 0 && time < 5.0) {
      this._pos.copy(this.groundPos)
      this._tangent.set(Math.sin(this.initialYaw), 0, Math.cos(this.initialYaw))
      this.smoothedYaw = this.initialYaw
      this.smoothedPitch = 0.0
      this.smoothedRoll = 0.0
      this._qYaw.setFromAxisAngle(this._up, this.initialYaw)
      this._currentQuat.copy(this._qYaw)

      return {
        position: this._pos,
        quaternion: this._currentQuat,
        tangent: this._tangent,
        shake: 0.0,
        thrusterIntensity: 0.2,
        thrusterColor: 0x00d4ff,
        opacity: 1.0,
        stage,
        stageIndex: index,
        progress: time / this.totalDuration,
        smoothedRoll: 0.0,
        smoothedPitch: 0.0,
      }
    }

    // -------------------------------------------------------------
    // STAGE 1: Engine Warmup / Ignition (1.2s - 2.5s)
    // -------------------------------------------------------------
    if (index === 1 && time < 5.0) {
      this._pos.copy(this.groundPos)
      this._tangent.set(Math.sin(this.initialYaw), 0, Math.cos(this.initialYaw))
      this.smoothedYaw = this.initialYaw
      this.smoothedPitch = 0.0
      this.smoothedRoll = 0.0
      this._qYaw.setFromAxisAngle(this._up, this.initialYaw)
      this._currentQuat.copy(this._qYaw)

      const stageRatio = (time - stage.startTime) / (stage.endTime - stage.startTime)
      shake = Math.min(1.0, stageRatio * 1.0)
      thrusterIntensity = 0.4 + stageRatio * 1.6
      thrusterColor = 0x38bdf8

      return {
        position: this._pos,
        quaternion: this._currentQuat,
        tangent: this._tangent,
        shake,
        thrusterIntensity,
        thrusterColor,
        opacity: 1.0,
        stage,
        stageIndex: index,
        progress: time / this.totalDuration,
        smoothedRoll: 0.0,
        smoothedPitch: 0.0,
      }
    }

    // -------------------------------------------------------------
    // STAGE 2: Liftoff & Climb (2.5s - 5.0s)
    // Continuous VTOL rise transitioning with zero-jerk handoff to spline
    // -------------------------------------------------------------
    if (index === 2 && time < 5.0) {
      const p = (time - stage.startTime) / (stage.endTime - stage.startTime) // 0 to 1

      // Smooth vertical rise with C1-continuous smoothstep
      const easeY = p * p * (3 - 2 * p)
      // Horizontal transition begins once airborne
      const horizProgress = Math.max(0, (p - 0.2) / 0.8)
      const easeXZ = horizProgress * horizProgress

      this._pos.set(
        THREE.MathUtils.lerp(this.groundPos.x, this.liftoffEndPos.x, easeXZ),
        THREE.MathUtils.lerp(this.groundPos.y, this.liftoffEndPos.y, easeY),
        THREE.MathUtils.lerp(this.groundPos.z, this.liftoffEndPos.z, easeXZ)
      )

      // Hover wave envelopes smoothly to 0 at both p=0 and p=1 to guarantee zero position steps
      const hoverEnvelope = Math.sin(p * Math.PI)
      const hoverWave = Math.sin(elapsedTime * 6.0) * 0.015 * hoverEnvelope
      this._pos.y += hoverWave

      // Realistic nose-up pitch: smoothly matches the initial spline tangent (-8.4 deg)
      let pitchDeg = 0.0
      if (p > 0.3) {
        const pitchRatio = (p - 0.3) / 0.7
        const smoothRatio = pitchRatio * pitchRatio * (3 - 2 * pitchRatio)
        pitchDeg = smoothRatio * 8.4
      }
      const pitchRad = -pitchDeg * (Math.PI / 180) // Negative X is nose-up in Three.js

      // Subtle right wing bank: smoothly matches spline entry bank (+5 deg)
      let rollDeg = 0.0
      if (p > 0.4) {
        const rollRatio = (p - 0.4) / 0.6
        const smoothRoll = rollRatio * rollRatio * (3 - 2 * rollRatio)
        rollDeg = smoothRoll * 5.0
      }
      const rollRad = rollDeg * (Math.PI / 180)

      // Smooth heading yaw transition from initialYaw (75 deg) to 90 deg (matching spline entry)
      const currentYaw = THREE.MathUtils.lerp(this.initialYaw, Math.PI * 0.5, easeXZ)
      this.smoothedPitch = pitchRad
      this.smoothedRoll = rollRad
      this.smoothedYaw = currentYaw

      this._qYaw.setFromAxisAngle(this._up, currentYaw)
      this._qPitch.setFromAxisAngle(this._xAxis, pitchRad)
      this._qRoll.setFromAxisAngle(this._zAxis, rollRad)
      this._targetQuat.copy(this._qYaw).multiply(this._qPitch).multiply(this._qRoll)

      if (isSeeking) {
        this._currentQuat.copy(this._targetQuat)
      } else {
        // Smooth orientation approach
        this._currentQuat.slerp(this._targetQuat, 1.0 - Math.exp(-14.0 * delta))
      }

      // Flight tangent along nose
      this._tangent.set(Math.sin(currentYaw), Math.sin(-pitchRad), Math.cos(currentYaw)).normalize()

      // Residual engine rumble
      shake = Math.max(0, (1.0 - p * 1.4) * 0.35)
      thrusterIntensity = 2.4 + p * 0.8
      thrusterColor = 0x00f0ff

      return {
        position: this._pos,
        quaternion: this._currentQuat,
        tangent: this._tangent,
        shake,
        thrusterIntensity,
        thrusterColor,
        opacity: 1.0,
        stage,
        stageIndex: index,
        progress: time / this.totalDuration,
        smoothedRoll: this.smoothedRoll,
        smoothedPitch: this.smoothedPitch,
      }
    }

    // -------------------------------------------------------------
    // STAGES 3 - 9: Continuous Infinite Closed Flight Loop (5.0s onwards)
    // Perfectly continuous Catmull-Rom circuit that loops forever
    // -------------------------------------------------------------
    const loopElapsed = (time - flightStartTime) % loopDuration
    const rawProgress = ((loopElapsed / loopDuration) % 1.0 + 1.0) % 1.0

    this.flightCurve.getPointAt(rawProgress, this._pos)
    this.flightCurve.getTangentAt(rawProgress, this._tangent).normalize()

    // Gentle atmospheric micro-breathing (subtle 2cm flotation)
    const hoverAmp = 0.02
    this._pos.y += Math.sin(elapsedTime * 2.2) * hoverAmp
    this._pos.x += Math.cos(elapsedTime * 1.5) * (hoverAmp * 0.4)

    // Raw Heading (Yaw) from horizontal velocity
    const horizLen = Math.sqrt(this._tangent.x * this._tangent.x + this._tangent.z * this._tangent.z)
    const rawYaw = Math.atan2(this._tangent.x, this._tangent.z)

    // Unwrapped Yaw delta
    let dYaw = rawYaw - this.smoothedYaw
    while (dYaw > Math.PI) dYaw -= Math.PI * 2
    while (dYaw < -Math.PI) dYaw += Math.PI * 2

    // Continuous Pitch from vertical tangent gradient
    let targetPitch = -Math.atan2(this._tangent.y, Math.max(horizLen, 0.05))
    targetPitch = THREE.MathUtils.clamp(targetPitch, -24 * (Math.PI / 180), 24 * (Math.PI / 180))

    // Macro-Curvature Banking Roll (smooth 0.04 window wrapped on closed loop)
    const deltaU = 0.04
    const nextU = (rawProgress + deltaU) % 1.0
    const prevU = (rawProgress - deltaU + 1.0) % 1.0
    this.flightCurve.getTangentAt(prevU, this._prevTangent).normalize()
    this.flightCurve.getTangentAt(nextU, this._nextTangent).normalize()

    const prevYaw = Math.atan2(this._prevTangent.x, this._prevTangent.z)
    const nextYaw = Math.atan2(this._nextTangent.x, this._nextTangent.z)

    let curvDYaw = nextYaw - prevYaw
    while (curvDYaw > Math.PI) curvDYaw -= Math.PI * 2
    while (curvDYaw < -Math.PI) curvDYaw += Math.PI * 2

    const turnRate = curvDYaw / (deltaU * 2)
    const maxRoll = 24 * (Math.PI / 180) // Max 24 degrees banking
    const targetRoll = THREE.MathUtils.clamp(-turnRate * 0.08, -maxRoll, maxRoll)

    if (isSeeking) {
      // Immediate snap on timeline scrubbing or seeking
      this.smoothedYaw = rawYaw
      this.smoothedPitch = targetPitch
      this.smoothedRoll = targetRoll

      this._qYaw.setFromAxisAngle(this._up, this.smoothedYaw)
      this._qPitch.setFromAxisAngle(this._xAxis, this.smoothedPitch)
      this._qRoll.setFromAxisAngle(this._zAxis, this.smoothedRoll)
      this._targetQuat.copy(this._qYaw).multiply(this._qPitch).multiply(this._qRoll)
      this._currentQuat.copy(this._targetQuat)
    } else {
      // Smooth aerodynamic continuous filtering with angular rate limits adapted for fast speed
      const maxYawRate = 85 * (Math.PI / 180)
      const maxDeltaYaw = maxYawRate * delta
      const clampedDYaw = THREE.MathUtils.clamp(dYaw * (1.0 - Math.exp(-9.0 * delta)), -maxDeltaYaw, maxDeltaYaw)
      this.smoothedYaw += clampedDYaw

      const maxPitchRate = 50 * (Math.PI / 180)
      const maxDeltaPitch = maxPitchRate * delta
      const dPitch = targetPitch - this.smoothedPitch
      const clampedDPitch = THREE.MathUtils.clamp(dPitch * (1.0 - Math.exp(-8.0 * delta)), -maxDeltaPitch, maxDeltaPitch)
      this.smoothedPitch += clampedDPitch

      const maxRollRate = 45 * (Math.PI / 180)
      const maxDeltaRoll = maxRollRate * delta
      const dRoll = targetRoll - this.smoothedRoll
      const clampedDRoll = THREE.MathUtils.clamp(dRoll * (1.0 - Math.exp(-6.0 * delta)), -maxDeltaRoll, maxDeltaRoll)
      this.smoothedRoll += clampedDRoll

      // Compose Target Orientation: Q = Q_yaw * Q_pitch * Q_roll
      this._qYaw.setFromAxisAngle(this._up, this.smoothedYaw)
      this._qPitch.setFromAxisAngle(this._xAxis, this.smoothedPitch)
      this._qRoll.setFromAxisAngle(this._zAxis, this.smoothedRoll)
      this._targetQuat.copy(this._qYaw).multiply(this._qPitch).multiply(this._qRoll)

      // Total angular velocity clamp via rotateTowards (guarantees <= 95 deg/s)
      const maxTotalAngularRate = 95 * (Math.PI / 180)
      const maxAngStep = maxTotalAngularRate * delta
      this._currentQuat.rotateTowards(this._targetQuat, maxAngStep)
    }

    // Stage specific effects
    if (index === 8 || index === 9) {
      // Close fly-by and maximum acceleration
      thrusterIntensity = 3.4
      thrusterColor = 0x38bdf8
    } else if (index === 7) {
      // Turn and dive acceleration
      thrusterIntensity = 2.6
      thrusterColor = 0x00d4ff
    } else {
      thrusterIntensity = 1.8
      thrusterColor = 0x00d4ff
    }

    const currentLoopProgress = time < 5.0 ? time / this.totalDuration : (5.0 + loopElapsed) / this.totalDuration

    return {
      position: this._pos,
      quaternion: this._currentQuat,
      tangent: this._tangent,
      shake: 0.0,
      thrusterIntensity,
      thrusterColor,
      opacity,
      stage,
      stageIndex: index,
      progress: currentLoopProgress,
      smoothedRoll: this.smoothedRoll,
      smoothedPitch: this.smoothedPitch,
    }
  }
}
