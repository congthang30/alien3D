import * as THREE from 'three'
import './style.css'
import { ARSession } from './ar/arSession.js'
import { CinematicController } from './cinematic/CinematicController.js'
import { SciFiAudio } from './audio/SciFiAudio.js'

window.THREE = THREE

// DOM Elements
const canvas = document.querySelector('#ar-canvas')
const welcomePanel = document.querySelector('#welcome-panel')
const startArBtn = document.querySelector('#start-ar-btn')
const previewBtn = document.querySelector('#preview-btn')
const launchButtons = document.querySelector('#launch-buttons')
const loadingContainer = document.querySelector('#loading-container')
const progressFill = document.querySelector('#progress-fill')
const progressLabel = document.querySelector('#progress-label')

const statusPill = document.querySelector('#status-pill')
const statusDot = document.querySelector('#status-dot')
const statusText = document.querySelector('#status-text')
const modeToggleBtn = document.querySelector('#mode-toggle-btn')
const audioToggleBtn = document.querySelector('#audio-toggle-btn')
const audioIcon = document.querySelector('#audio-icon')

const bottomControls = document.querySelector('#bottom-controls')
const timelineTrack = document.querySelector('#timeline-track')
const timelineFill = document.querySelector('#timeline-fill')
const timelineStageName = document.querySelector('#timeline-stage-name')
const timelineTime = document.querySelector('#timeline-time')
const playPauseBtn = document.querySelector('#play-pause-btn')
const playPauseIcon = document.querySelector('#play-pause-icon')
const playPauseText = document.querySelector('#play-pause-text')
const replayBtn = document.querySelector('#replay-btn')
const freeFlightBtn = document.querySelector('#free-flight-btn')
const speedBtn = document.querySelector('#speed-btn')
const speedLabel = document.querySelector('#speed-label')
const scaleBtn = document.querySelector('#scale-btn')
const scaleLabel = document.querySelector('#scale-label')
const camTrackBtn = document.querySelector('#cam-track-btn')
const camTrackLabel = document.querySelector('#cam-track-label')
const stageMarkers = document.querySelectorAll('.stage-markers .marker')

// Application State
let arSession = null
const preloadScene = new THREE.Scene()
const cinematicController = new CinematicController(preloadScene)
const sciFiAudio = new SciFiAudio()
cinematicController.setAudio(sciFiAudio)

let activeScene = null
let activeCamera = null
let activeRenderer = null
let currentMode = 'none' // 'ar' | 'preview'
let isLoaded = false
let pendingMode = null

// Preview Orbit Camera Controls
let isDragging = false
let previousMouse = { x: 0, y: 0 }
let previewRotation = { theta: 0.05, phi: 0.2 }
let previewDistance = 8.5
let previewTarget = new THREE.Vector3(0, 2.0, -4.5)
let spectatorTarget = new THREE.Vector3(0, 1.5, -3.2)
let autoTrackCamera = true // true = follow ship, false = spectator view from user position

// Scale settings
const scaleModes = [
  { label: '📐 Cỡ Phòng (0.85x)', value: 0.85 },
  { label: '🚀 Cỡ Thật (1.0x)', value: 1.0 },
  { label: '☕ Cỡ Bàn (0.45x)', value: 0.45 },
]
let scaleModeIndex = 0

// Speed settings
const speedModes = [
  { label: '⚡ Tốc Độ (1.8x)', value: 1.8 },
  { label: '🚀 Siêu Tốc (2.2x)', value: 2.2 },
  { label: '🔥 Phản Lực (2.6x)', value: 2.6 },
  { label: '🍃 Êm Ả (1.2x)', value: 1.2 },
]
let speedModeIndex = 0

function updateStatus(text, type = 'normal') {
  if (statusText) statusText.textContent = text
  if (statusDot) {
    statusDot.className = 'status-dot'
    if (type === 'active') statusDot.classList.add('active')
    else if (type === 'loading') statusDot.classList.add('loading')
  }
}

/**
 * Creates common Three.js environment (lighting, shadow receiver)
 */
function setupEnvironment(scene) {
  // Ambient hemisphere lighting
  const hemiLight = new THREE.HemisphereLight(0xbad7ff, 0x1a233a, 0.85)
  hemiLight.position.set(0, 20, 0)
  scene.add(hemiLight)

  // Direct sun lighting for crisp shadows
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.4)
  sunLight.position.set(6, 14, 8)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.width = 1024
  sunLight.shadow.mapSize.height = 1024
  sunLight.shadow.bias = -0.0004
  sunLight.shadow.camera.near = 0.5
  sunLight.shadow.camera.far = 45
  sunLight.shadow.camera.left = -15
  sunLight.shadow.camera.right = 15
  sunLight.shadow.camera.top = 15
  sunLight.shadow.camera.bottom = -15
  scene.add(sunLight)

  // Electric cyan fill light from opposite angle
  const fillLight = new THREE.DirectionalLight(0x00f0ff, 0.45)
  fillLight.position.set(-8, 6, -10)
  scene.add(fillLight)

  // Ground shadow receiver plane (invisible floor in AR that catches spaceship shadows)
  const shadowPlaneGeo = new THREE.PlaneGeometry(60, 60)
  const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.35 })
  const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat)
  shadowPlane.rotation.x = -Math.PI / 2
  shadowPlane.position.y = 0.0
  shadowPlane.receiveShadow = true
  scene.add(shadowPlane)
}

/**
 * Preloads both 3D models and initializes timeline callbacks
 */
async function preloadModels() {
  updateStatus('Đang tải mô hình...', 'loading')

  cinematicController.onStageChange = (stage, index) => {
    if (timelineStageName) timelineStageName.textContent = `${index + 1}. ${stage.title}`
    stageMarkers.forEach((m, idx) => {
      m.classList.toggle('active', idx === index)
    })
  }

  cinematicController.onProgressUpdate = (progress, currentTime, stage) => {
    if (timelineFill) timelineFill.style.width = `${progress * 100}%`
    if (timelineTime) {
      const curMin = Math.floor(currentTime / 60)
      const curSec = Math.floor(currentTime % 60)
      const totalMin = Math.floor(cinematicController.flightSystem.totalDuration / 60)
      const totalSec = Math.floor(cinematicController.flightSystem.totalDuration % 60)
      timelineTime.textContent = `${String(curMin).padStart(2, '0')}:${String(curSec).padStart(2, '0')} / ${String(totalMin).padStart(2, '0')}:${String(totalSec).padStart(2, '0')}`
    }
  }

  await cinematicController.init((progress) => {
    const pct = Math.round(progress * 100)
    if (progressFill) progressFill.style.width = `${pct}%`
    if (progressLabel) progressLabel.textContent = `Đang nạp mô hình 3D (${pct}%)...`
  })

  isLoaded = true
  if (loadingContainer) loadingContainer.classList.add('hidden')
  if (launchButtons) launchButtons.classList.remove('hidden')
  updateStatus('Sẵn sàng xuất kích', 'active')

  if (pendingMode === 'ar') {
    startWebAR()
  } else if (pendingMode === 'preview') {
    setupDesktopPreview()
  }
}

/**
 * Desktop 3D Preview Mode (Interactive orbit camera)
 */
function setupDesktopPreview() {
  if (!isLoaded) {
    pendingMode = 'preview'
    updateStatus('Đang tải mô hình trước khi mở xem trước...', 'loading')
    return
  }

  if (currentMode === 'preview') return
  currentMode = 'preview'

  document.body.classList.remove('ar-mode')

  if (arSession && arSession.running) {
    arSession.stop()
  }

  if (welcomePanel) welcomePanel.classList.add('hidden')
  if (bottomControls) bottomControls.classList.remove('hidden')
  if (modeToggleBtn) {
    modeToggleBtn.classList.remove('hidden')
    modeToggleBtn.querySelector('span').textContent = '📷 Bật Camera AR'
  }

  activeScene = new THREE.Scene()
  activeScene.background = new THREE.Color(0x050811)
  activeScene.fog = new THREE.FogExp2(0x050811, 0.02)

  // Starfield background for preview
  const starGeo = new THREE.BufferGeometry()
  const starCount = 600
  const starPos = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount * 3; i += 3) {
    starPos[i] = (Math.random() - 0.5) * 80
    starPos[i + 1] = Math.random() * 40 - 5
    starPos[i + 2] = (Math.random() - 0.5) * 80
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const starMat = new THREE.PointsMaterial({ color: 0x88ccff, size: 0.15, transparent: true, opacity: 0.7 })
  const stars = new THREE.Points(starGeo, starMat)
  activeScene.add(stars)

  activeCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120)
  updatePreviewCameraPosition()

  activeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  activeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  activeRenderer.setSize(window.innerWidth, window.innerHeight)
  activeRenderer.toneMapping = THREE.ACESFilmicToneMapping
  activeRenderer.toneMappingExposure = 1.2
  activeRenderer.shadowMap.enabled = true
  activeRenderer.shadowMap.type = THREE.PCFSoftShadowMap

  setupEnvironment(activeScene)
  cinematicController.attachToScene(activeScene)
  cinematicController.replay()

  sciFiAudio.init()
  sciFiAudio.resume()

  updateStatus('3D Preview đang chạy', 'active')
  initPreviewEvents()

  let lastTime = performance.now()
  function previewLoop() {
    if (currentMode !== 'preview') return
    requestAnimationFrame(previewLoop)

    const now = performance.now()
    const delta = Math.min((now - lastTime) / 1000, 0.05)
    lastTime = now

    cinematicController.update(delta, activeCamera)

    if (autoTrackCamera) {
      previewTarget.lerp(cinematicController.rig.rig.position, 1.0 - Math.exp(-5.0 * delta))
      updatePreviewCameraPosition()
    } else {
      // Spectator view from center (0, 1.4, 0) tracking spaceship with cinematic damping
      activeCamera.position.set(0, 1.4, 0)
      spectatorTarget.lerp(cinematicController.rig.rig.position, 1.0 - Math.exp(-6.0 * delta))
      activeCamera.lookAt(spectatorTarget)
    }

    activeRenderer.render(activeScene, activeCamera)
  }
  previewLoop()
}

function updatePreviewCameraPosition() {
  if (!activeCamera) return
  const x = previewTarget.x + previewDistance * Math.cos(previewRotation.phi) * Math.sin(previewRotation.theta)
  const y = previewTarget.y + previewDistance * Math.sin(previewRotation.phi)
  const z = previewTarget.z + previewDistance * Math.cos(previewRotation.phi) * Math.cos(previewRotation.theta)
  activeCamera.position.set(x, y, z)
  activeCamera.lookAt(previewTarget)
}

function initPreviewEvents() {
  canvas.onpointerdown = (e) => {
    if (currentMode !== 'preview') return
    isDragging = true
    previousMouse.x = e.clientX
    previousMouse.y = e.clientY
  }

  window.onpointermove = (e) => {
    if (!isDragging || currentMode !== 'preview') return
    const dx = e.clientX - previousMouse.x
    const dy = e.clientY - previousMouse.y
    previousMouse.x = e.clientX
    previousMouse.y = e.clientY

    previewRotation.theta -= dx * 0.007
    previewRotation.phi = Math.max(-0.2, Math.min(1.2, previewRotation.phi + dy * 0.007))
    updatePreviewCameraPosition()
  }

  window.onpointerup = () => {
    isDragging = false
  }

  canvas.onwheel = (e) => {
    if (currentMode !== 'preview') return
    e.preventDefault()
    previewDistance = Math.max(3.0, Math.min(25.0, previewDistance + e.deltaY * 0.015))
    updatePreviewCameraPosition()
  }

  window.onresize = () => {
    if (currentMode === 'preview' && activeCamera && activeRenderer) {
      activeCamera.aspect = window.innerWidth / window.innerHeight
      activeCamera.updateProjectionMatrix()
      activeRenderer.setSize(window.innerWidth, window.innerHeight)
    }
  }
}

/**
 * 8th Wall SLAM World Effects AR Mode
 */
async function startWebAR() {
  if (!isLoaded) {
    pendingMode = 'ar'
    updateStatus('Đang tải mô hình trước khi mở AR...', 'loading')
    return
  }

  currentMode = 'ar'
  document.body.classList.add('ar-mode')

  if (welcomePanel) welcomePanel.classList.add('hidden')
  if (bottomControls) bottomControls.classList.add('hidden')

  updateStatus('Đang kích hoạt Camera AR...', 'loading')
  sciFiAudio.init()
  sciFiAudio.resume()

  try {
    if (!arSession) {
      arSession = new ARSession()
    }

    await arSession.start(canvas, {
      onReady: ({ scene, camera, renderer }) => {
        activeScene = scene
        activeCamera = camera
        activeRenderer = renderer

        activeRenderer.shadowMap.enabled = true
        activeRenderer.shadowMap.type = THREE.PCFSoftShadowMap

        setupEnvironment(activeScene)
        cinematicController.attachToScene(activeScene)
        cinematicController.replay()

        updateStatus('8th Wall SLAM đang theo dõi', 'active')

        // Tap on screen to recenter world tracking or reposition anchor
        canvas.addEventListener('click', () => {
          arSession.recenter()
        })
      },
      onFrame: (delta) => {
        cinematicController.update(delta, activeCamera)
      },
      onCameraStatus: (status) => {
        if (status === 'hasStream') {
          updateStatus('Camera AR đang hoạt động', 'active')
        }
      },
      onError: (err) => {
        console.error('Lỗi ARSession:', err)
        updateStatus('Lỗi camera — chuyển sang 3D Preview', 'normal')
        setupDesktopPreview()
      },
    })
  } catch (error) {
    console.warn('Không thể mở Camera AR (có thể do thiếu HTTPS/Camera), chuyển sang 3D Preview:', error)
    setupDesktopPreview()
  }
}

// UI Event Listeners
startArBtn?.addEventListener('click', () => startWebAR())
previewBtn?.addEventListener('click', () => setupDesktopPreview())

modeToggleBtn?.addEventListener('click', () => {
  if (currentMode === 'ar') {
    setupDesktopPreview()
  } else {
    startWebAR()
  }
})

audioToggleBtn?.addEventListener('click', () => {
  sciFiAudio.init()
  sciFiAudio.resume()
  const isMuted = sciFiAudio.toggleMute()
  if (audioIcon) {
    audioIcon.textContent = isMuted ? '🔇' : '🔊'
  }
})

playPauseBtn?.addEventListener('click', () => {
  const isPlaying = cinematicController.togglePlayPause()
  if (playPauseIcon) playPauseIcon.textContent = isPlaying ? '⏸' : '▶'
  if (playPauseText) playPauseText.textContent = isPlaying ? 'Tạm dừng' : 'Tiếp tục'
})

replayBtn?.addEventListener('click', () => {
  cinematicController.replay()
  if (playPauseIcon) playPauseIcon.textContent = '⏸'
  if (playPauseText) playPauseText.textContent = 'Tạm dừng'
})

freeFlightBtn?.addEventListener('click', () => {
  const isFree = cinematicController.mode === 'freeflight'
  cinematicController.setFreeFlight(!isFree)
  freeFlightBtn.classList.toggle('cyan', !isFree)
  freeFlightBtn.querySelector('span').textContent = !isFree ? '⚡ Đang Bay Tự Do' : '♾ Bay Tự Do'
})

camTrackBtn?.addEventListener('click', () => {
  autoTrackCamera = !autoTrackCamera
  if (camTrackLabel) {
    camTrackLabel.textContent = autoTrackCamera ? '🎯 Bám Theo Tàu' : '👁 Tầm Mắt Người Xem'
  }
})

speedBtn?.addEventListener('click', () => {
  speedModeIndex = (speedModeIndex + 1) % speedModes.length
  const current = speedModes[speedModeIndex]
  cinematicController.playbackSpeed = current.value
  if (speedLabel) speedLabel.textContent = current.label
})

scaleBtn?.addEventListener('click', () => {
  scaleModeIndex = (scaleModeIndex + 1) % scaleModes.length
  const current = scaleModes[scaleModeIndex]
  cinematicController.rig.setScale(current.value)
  if (scaleLabel) scaleLabel.textContent = current.label
})

// Stage Markers Click
stageMarkers.forEach((marker) => {
  marker.addEventListener('click', (e) => {
    e.stopPropagation()
    const stageIdx = parseInt(marker.dataset.stage, 10)
    if (!isNaN(stageIdx)) {
      cinematicController.seekToStage(stageIdx)
    }
  })
})

// Timeline Track Click / Seek
timelineTrack?.addEventListener('click', (e) => {
  const rect = timelineTrack.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const ratio = Math.max(0, Math.min(1, clickX / rect.width))
  cinematicController.currentTime = ratio * cinematicController.flightSystem.totalDuration
  cinematicController.lastStageIndex = -1
})

// Kick off model preloading
preloadModels()
