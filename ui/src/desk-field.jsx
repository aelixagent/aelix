import { useEffect, useRef, useState } from 'react'

/*
 * DeskField — the product-mode 3D data-scape (Wave 1 flagship).
 *
 * A calm, on-brand three.js centerpiece that visualizes REAL desk data, never
 * decorative filler:
 *   - live/real run   → each open position is a node, sized by weight, tinted by P&L
 *   - demo / no-run   → each on-chain guardrail is a node (all real config), the
 *                       central core is the live vault NAV
 *
 * Hard requirements it honors:
 *   - lazy-loads three.js (kept out of the initial bundle; the dashboard renders
 *     instantly and the scene fades in)
 *   - prefers-reduced-motion → renders a single static frame, no animation loop
 *   - no WebGL / load failure → falls back to a pure-CSS starfield (mode-fallback)
 *   - disposes every geometry/material/renderer on unmount (no GPU leak)
 */

const ACCENT = 0xc5e94a // Aelix lime
const POS = 0x3fd07f
const NEG = 0xef4444
const DIM = 0x59626f

function nodesFrom({ positions, guardrails, isDemo }) {
  if (!isDemo && positions && positions.length) {
    const maxW = Math.max(1, ...positions.map((p) => p.weightPct || 0))
    return positions.slice(0, 14).map((p) => ({
      label: p.symbol,
      size: 0.5 + 0.9 * ((p.weightPct || 0) / maxW),
      color: (p.pnl ?? 0) >= 0 ? POS : NEG,
    }))
  }
  return (guardrails || []).slice(0, 14).map((g) => ({
    label: g.label,
    size: 0.7,
    color: g.enforced ? ACCENT : DIM,
  }))
}

function initScene(THREE, el, data) {
  const { reduce } = data
  const nodes = nodesFrom(data)
  const w = el.clientWidth || 640
  const h = el.clientHeight || 340

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(w, h)
  el.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100)
  camera.position.set(0, 1.4, 8.4)
  camera.lookAt(0, 0, 0)

  const group = new THREE.Group()
  scene.add(group)

  const disposables = []
  const track = (obj) => { disposables.push(obj); return obj }

  // ---- central core: wireframe icosahedron + soft inner glow ---------------
  const coreGeo = track(new THREE.IcosahedronGeometry(1.15, 1))
  const core = new THREE.LineSegments(
    track(new THREE.WireframeGeometry(coreGeo)),
    track(new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.85 })),
  )
  group.add(core)

  const glow = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.78, 24, 24)),
    track(new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.16 })),
  )
  group.add(glow)

  // ---- data nodes on a fibonacci ring + halos + spokes to the core --------
  const nodeMeshes = []
  const spokePositions = []
  const R = 3.55
  const count = Math.max(nodes.length, 1)
  nodes.forEach((n, i) => {
    const golden = Math.PI * (3 - Math.sqrt(5))
    const t = count > 1 ? i / (count - 1) : 0.5
    const y = (t - 0.5) * 1.9
    const radius = Math.sqrt(Math.max(0.18, 1 - (y / 1.9) * (y / 1.9))) * R
    const theta = golden * i
    const x = Math.cos(theta) * radius
    const z = Math.sin(theta) * radius
    const rNode = 0.14 + 0.09 * n.size

    // MeshBasicMaterial = self-lit flat color; renders identically on any GPU or
    // software WebGL (no dependency on scene lights), which is what a crisp data
    // node wants anyway.
    const mesh = new THREE.Mesh(
      track(new THREE.SphereGeometry(rNode, 20, 20)),
      track(new THREE.MeshBasicMaterial({ color: n.color })),
    )
    mesh.position.set(x, y, z)
    mesh.userData.phase = i * 0.7
    mesh.userData.base = mesh.position.clone()
    group.add(mesh)
    nodeMeshes.push(mesh)

    // additive glow halo so each node reads clearly against the dark field
    const halo = new THREE.Mesh(
      track(new THREE.SphereGeometry(rNode * 1.85, 16, 16)),
      track(new THREE.MeshBasicMaterial({
        color: n.color, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })),
    )
    halo.position.copy(mesh.position)
    mesh.userData.halo = halo
    group.add(halo)

    spokePositions.push(0, 0, 0, x, y, z)
  })

  if (spokePositions.length) {
    const spokeGeo = track(new THREE.BufferGeometry())
    spokeGeo.setAttribute('position', new THREE.Float32BufferAttribute(spokePositions, 3))
    const spokes = new THREE.LineSegments(
      spokeGeo,
      track(new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.28 })),
    )
    group.add(spokes)
  }

  // ---- ambient starfield for depth ----------------------------------------
  const STAR_N = 260
  const starPos = new Float32Array(STAR_N * 3)
  for (let i = 0; i < STAR_N; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 26
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 16
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 20 - 4
  }
  const starGeo = track(new THREE.BufferGeometry())
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const stars = new THREE.Points(
    starGeo,
    track(new THREE.PointsMaterial({ color: 0x8b94a3, size: 0.045, transparent: true, opacity: 0.5 })),
  )
  scene.add(stars)

  // ---- lights --------------------------------------------------------------
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const key = new THREE.PointLight(ACCENT, 1.4, 40)
  key.position.set(4, 6, 6)
  scene.add(key)
  const fill = new THREE.PointLight(0x9fb8ff, 0.5, 40)
  fill.position.set(-6, -3, 4)
  scene.add(fill)

  // ---- interaction + animation --------------------------------------------
  let raf = 0
  let running = true
  const target = { x: 0, y: 0 }
  const cur = { x: 0, y: 0 }

  const onMove = (e) => {
    const r = el.getBoundingClientRect()
    target.x = ((e.clientX - r.left) / r.width - 0.5) * 2
    target.y = ((e.clientY - r.top) / r.height - 0.5) * 2
  }
  el.addEventListener('pointermove', onMove)

  const renderFrame = (time) => {
    cur.x += (target.x - cur.x) * 0.05
    cur.y += (target.y - cur.y) * 0.05
    group.rotation.y = time * 0.00013 + cur.x * 0.35
    group.rotation.x = -0.12 + cur.y * 0.18
    core.rotation.y = time * 0.0004
    core.rotation.x = time * 0.00022
    glow.scale.setScalar(1 + Math.sin(time * 0.0018) * 0.05)
    for (const m of nodeMeshes) {
      const b = m.userData.base
      const yy = b.y + Math.sin(time * 0.0016 + m.userData.phase) * 0.08
      m.position.y = yy
      if (m.userData.halo) m.userData.halo.position.y = yy
    }
    stars.rotation.y = time * 0.00004
    camera.position.x += (cur.x * 0.6 - camera.position.x) * 0.04
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
  }

  const loop = (time) => {
    if (!running) return
    renderFrame(time)
    raf = requestAnimationFrame(loop)
  }

  if (reduce) {
    renderFrame(1000) // one static, composed frame
  } else {
    raf = requestAnimationFrame(loop)
  }

  const onVisibility = () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf) }
    else if (!reduce) { running = true; raf = requestAnimationFrame(loop) }
  }
  document.addEventListener('visibilitychange', onVisibility)

  const ro = new ResizeObserver(() => {
    const nw = el.clientWidth || w
    const nh = el.clientHeight || h
    renderer.setSize(nw, nh)
    camera.aspect = nw / nh
    camera.updateProjectionMatrix()
    if (reduce || !running) renderFrame(1000)
  })
  ro.observe(el)

  return () => {
    running = false
    cancelAnimationFrame(raf)
    el.removeEventListener('pointermove', onMove)
    document.removeEventListener('visibilitychange', onVisibility)
    ro.disconnect()
    disposables.forEach((d) => d.dispose && d.dispose())
    renderer.dispose()
    if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
  }
}

export function DeskField({ nav, positions = [], guardrails = [], isDemo = false, caption }) {
  const mountRef = useRef(null)
  const [mode, setMode] = useState('loading') // loading | webgl | fallback

  const posKey = positions.map((p) => `${p.symbol}:${p.weightPct}:${p.pnl}`).join('|')
  const railKey = guardrails.map((g) => `${g.key}:${g.enforced}`).join('|')

  useEffect(() => {
    const el = mountRef.current
    if (!el) return
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    let cancelled = false
    let cleanup = () => {}

    import('three')
      .then((THREE) => {
        if (cancelled) return
        try {
          cleanup = initScene(THREE, el, { nav, positions, guardrails, isDemo, reduce })
          setMode('webgl')
        } catch {
          setMode('fallback')
        }
      })
      .catch(() => { if (!cancelled) setMode('fallback') })

    return () => { cancelled = true; cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey, railKey, nav, isDemo])

  const count = !isDemo && positions.length ? positions.length : guardrails.length
  const kind = !isDemo && positions.length ? 'positions' : 'guardrails on-chain'

  return (
    <div className={`desk-field mode-${mode}`}>
      <div className="desk-field-canvas" ref={mountRef} aria-hidden="true" />
      <div className="desk-field-grid" aria-hidden="true" />
      <div className="desk-field-overlay">
        <div className="df-eyebrow">Desk field</div>
        <div className="df-title">{caption || (isDemo ? 'On-chain' : 'The desk')}</div>
        <div className="df-legend">
          <span className="df-node df-core" /> vault core
          <span className="df-sep">·</span>
          <span className="df-node df-orbit" /> {count || 0} {kind}
        </div>
      </div>
    </div>
  )
}
