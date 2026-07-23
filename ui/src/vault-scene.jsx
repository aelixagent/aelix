import { useEffect, useRef, useState } from 'react'

/*
 * VaultScene — the vault dApp's 3D hero centerpiece (Wave 2 set-piece).
 *
 * A calm, abstract visualization of the ERC-4626 vault: a glowing geometric core
 * bounded by a guardrail ring, with USDG "deposits" drifting inward. It shows NO
 * numbers — it's pure brand motion, so there is nothing to fake (every real figure
 * lives in the card below). Optionally `active` (a wallet is connected) brightens it.
 *
 * Same robustness contract as DeskField: three.js is lazy-loaded (kept out of the
 * initial bundle), reduced-motion renders one static frame, no-WebGL falls back to
 * a CSS glow, and every GPU resource is disposed on unmount.
 */

const ACCENT = 0xc5e94a // Aelix lime
const RING = 0x8fae2e

function initScene(THREE, el, { reduce, active }) {
  const w = el.clientWidth || 420
  const h = el.clientHeight || 240

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(w, h)
  el.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 100)
  camera.position.set(0, 0.4, 7.2)
  camera.lookAt(0, 0, 0)

  const group = new THREE.Group()
  scene.add(group)
  const dispose = []
  const track = (o) => { dispose.push(o); return o }

  // ---- vault core: nested wireframe dodecahedron + soft glow --------------
  const coreGeo = track(new THREE.DodecahedronGeometry(1.25, 0))
  const core = new THREE.LineSegments(
    track(new THREE.WireframeGeometry(coreGeo)),
    track(new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: active ? 0.95 : 0.8 })),
  )
  group.add(core)

  const innerGeo = track(new THREE.IcosahedronGeometry(0.72, 0))
  const inner = new THREE.LineSegments(
    track(new THREE.WireframeGeometry(innerGeo)),
    track(new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.4 })),
  )
  group.add(inner)

  const glow = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.6, 24, 24)),
    track(new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: active ? 0.22 : 0.14 })),
  )
  group.add(glow)

  // ---- guardrail ring (the bounded mandate) -------------------------------
  const ring = new THREE.Mesh(
    track(new THREE.TorusGeometry(2.5, 0.018, 8, 128)),
    track(new THREE.MeshBasicMaterial({ color: RING, transparent: true, opacity: 0.6 })),
  )
  ring.rotation.x = Math.PI * 0.5
  group.add(ring)
  const ring2 = new THREE.Mesh(
    track(new THREE.TorusGeometry(2.0, 0.01, 8, 128)),
    track(new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.28 })),
  )
  ring2.rotation.x = Math.PI * 0.42
  ring2.rotation.y = 0.3
  group.add(ring2)

  // ---- inward-drifting "deposit" particles --------------------------------
  const P = 90
  const pos = new Float32Array(P * 3)
  const seed = [] // per-particle { r, theta, y, speed }
  const spawn = (i) => {
    const r = 2.4 + Math.random() * 1.6
    const theta = (i / P) * Math.PI * 2 + Math.random()
    const y = (Math.random() - 0.5) * 1.4
    seed[i] = { r, theta, y, speed: 0.004 + Math.random() * 0.006 }
    pos[i * 3] = Math.cos(theta) * r
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = Math.sin(theta) * r
  }
  for (let i = 0; i < P; i++) spawn(i)
  const pGeo = track(new THREE.BufferGeometry())
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const particles = new THREE.Points(
    pGeo,
    track(new THREE.PointsMaterial({ color: ACCENT, size: 0.07, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })),
  )
  group.add(particles)

  // ---- ambient stars ------------------------------------------------------
  const SN = 120
  const sp = new Float32Array(SN * 3)
  for (let i = 0; i < SN; i++) { sp[i * 3] = (Math.random() - 0.5) * 20; sp[i * 3 + 1] = (Math.random() - 0.5) * 12; sp[i * 3 + 2] = (Math.random() - 0.5) * 14 - 3 }
  const sGeo = track(new THREE.BufferGeometry())
  sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  const stars = new THREE.Points(sGeo, track(new THREE.PointsMaterial({ color: 0x8b94a3, size: 0.035, transparent: true, opacity: 0.45 })))
  scene.add(stars)

  let raf = 0, running = true
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 }
  const onMove = (e) => { const r = el.getBoundingClientRect(); target.x = ((e.clientX - r.left) / r.width - 0.5) * 2; target.y = ((e.clientY - r.top) / r.height - 0.5) * 2 }
  el.addEventListener('pointermove', onMove)

  const frame = (t) => {
    cur.x += (target.x - cur.x) * 0.05
    cur.y += (target.y - cur.y) * 0.05
    group.rotation.y = t * 0.00016 + cur.x * 0.3
    group.rotation.x = -0.08 + cur.y * 0.16
    core.rotation.y = t * 0.0005
    core.rotation.x = t * 0.0003
    inner.rotation.y = -t * 0.0008
    ring.rotation.z = t * 0.0002
    glow.scale.setScalar(1 + Math.sin(t * 0.002) * 0.06)
    // drift particles toward the core, respawn when absorbed
    const arr = particles.geometry.attributes.position.array
    for (let i = 0; i < P; i++) {
      const s = seed[i]
      s.r -= s.speed * 8
      if (s.r < 0.5) spawn(i)
      else { arr[i * 3] = Math.cos(s.theta) * s.r; arr[i * 3 + 1] = s.y * (s.r / 3); arr[i * 3 + 2] = Math.sin(s.theta) * s.r }
    }
    particles.geometry.attributes.position.needsUpdate = true
    stars.rotation.y = t * 0.00003
    renderer.render(scene, camera)
  }

  const loop = (t) => { if (!running) return; frame(t); raf = requestAnimationFrame(loop) }
  if (reduce) frame(1000); else raf = requestAnimationFrame(loop)

  const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf) } else if (!reduce) { running = true; raf = requestAnimationFrame(loop) } }
  document.addEventListener('visibilitychange', onVis)

  const ro = new ResizeObserver(() => {
    const nw = el.clientWidth || w, nh = el.clientHeight || h
    renderer.setSize(nw, nh); camera.aspect = nw / nh; camera.updateProjectionMatrix()
    if (reduce || !running) frame(1000)
  })
  ro.observe(el)

  return () => {
    running = false; cancelAnimationFrame(raf)
    el.removeEventListener('pointermove', onMove)
    document.removeEventListener('visibilitychange', onVis)
    ro.disconnect()
    dispose.forEach((d) => d.dispose && d.dispose())
    renderer.dispose()
    if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
  }
}

export function VaultScene({ active = false }) {
  const mountRef = useRef(null)
  const [mode, setMode] = useState('loading')

  useEffect(() => {
    const el = mountRef.current
    if (!el) return
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    let cancelled = false, cleanup = () => {}
    import('three')
      .then((THREE) => { if (cancelled) return; try { cleanup = initScene(THREE, el, { reduce, active }); setMode('webgl') } catch { setMode('fallback') } })
      .catch(() => { if (!cancelled) setMode('fallback') })
    return () => { cancelled = true; cleanup() }
  }, [active])

  return (
    <div className={`vscene mode-${mode}`} aria-hidden="true">
      <div className="vscene-canvas" ref={mountRef} />
    </div>
  )
}
