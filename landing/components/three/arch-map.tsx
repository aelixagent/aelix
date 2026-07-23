"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ArchMap — an interactive 3D map of the desk architecture for the docs.
 *
 * The Portfolio Manager sits at the core; the analysts, Risk Manager, the
 * Robinhood MCP, strategies, guardrails, dashboard and audit logs orbit it,
 * each wired back to the PM. Drag to rotate; it auto-rotates otherwise. Labels
 * are crisp HTML overlays (projected each frame) so the map stays legible.
 *
 * SSR-safe: three.js is lazy-imported inside useEffect (never at module load),
 * so this client component renders an empty box on the server. Honors
 * prefers-reduced-motion (static frame) and disposes all GPU resources.
 */

type Kind = "core" | "analyst" | "risk" | "io";
type NodeDef = { id: string; label: string; sub?: string; kind: Kind };

const NODES: NodeDef[] = [
  { id: "pm", label: "Portfolio Manager", sub: "only role that can order", kind: "core" },
  { id: "fund", label: "Fundamental", kind: "analyst" },
  { id: "tech", label: "Technical", kind: "analyst" },
  { id: "macro", label: "Macro / News", sub: "injection-isolated", kind: "analyst" },
  { id: "risk", label: "Risk Manager", sub: "veto", kind: "risk" },
  { id: "mcp", label: "Robinhood MCP", sub: "Agentic account", kind: "io" },
  { id: "strat", label: "strategies/", kind: "io" },
  { id: "guard", label: "Guardrails", sub: "CLAUDE.md · settings", kind: "io" },
  { id: "dash", label: "Dashboard", sub: "desk-state.json", kind: "io" },
  { id: "logs", label: "Audit logs", kind: "io" },
];
const EDGES = NODES.filter((n) => n.id !== "pm").map((n) => ["pm", n.id] as const);

const COLOR: Record<Kind, number> = {
  core: 0xd7fe51,
  analyst: 0xc5e94a,
  risk: 0xffc53d,
  io: 0x7f8b7a,
};

export default function ArchMap() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const labelWrapRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<"loading" | "webgl" | "fallback">("loading");

  useEffect(() => {
    const el = mountRef.current;
    const labelWrap = labelWrapRef.current;
    if (!el || !labelWrap) return;
    const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let cancelled = false;
    let cleanup = () => {};

    import("three")
      .then((THREE) => {
        if (cancelled) return;
        try {
          cleanup = init(THREE, el, labelWrap, reduce);
          setMode("webgl");
        } catch {
          setMode("fallback");
        }
      })
      .catch(() => {
        if (!cancelled) setMode("fallback");
      });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div className={`archmap mode-${mode}`}>
      <div className="archmap-canvas" ref={mountRef} aria-hidden="true" />
      <div className="archmap-labels" ref={labelWrapRef} aria-hidden="true" />
      <div className="archmap-hint">drag to rotate</div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function init(THREE: any, el: HTMLElement, labelWrap: HTMLElement, reduce: boolean) {
  const w = el.clientWidth || 720;
  const h = el.clientHeight || 380;
  // narrow (phone) viewports can't fit a wide graph + its labels, so pull the
  // satellites inward and the camera back so everything stays on-canvas
  const narrow = w < 640;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, w / h, 0.1, 100);
  camera.position.set(0, 0.5, narrow ? 8.6 : 9.2);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);
  const dispose: any[] = [];
  const track = (o: any) => (dispose.push(o), o);

  // fibonacci placement for the 9 satellites on a sphere
  const R = narrow ? 2.7 : 3.5;
  const sats = NODES.filter((n) => n.id !== "pm");
  const posById: Record<string, any> = { pm: new THREE.Vector3(0, 0, 0) };
  const golden = Math.PI * (3 - Math.sqrt(5));
  sats.forEach((n, i) => {
    const t = (i + 0.5) / sats.length;
    const y = 1 - t * 2;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    posById[n.id] = new THREE.Vector3(Math.cos(theta) * rr * R, y * R * 0.62, Math.sin(theta) * rr * R);
  });

  // edges
  const edgePts: number[] = [];
  EDGES.forEach(([a, b]) => {
    const pa = posById[a], pb = posById[b];
    edgePts.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
  });
  const edgeGeo = track(new THREE.BufferGeometry());
  edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgePts, 3));
  group.add(new THREE.LineSegments(edgeGeo, track(new THREE.LineBasicMaterial({ color: 0xc5e94a, transparent: true, opacity: 0.18 }))));

  // nodes + labels
  const labels: { el: HTMLElement; node: { pos: any }; off: number }[] = [];
  NODES.forEach((n) => {
    const p = posById[n.id];
    const isCore = n.kind === "core";
    const rNode = isCore ? 0.46 : 0.2;
    const mesh = new THREE.Mesh(
      track(new THREE.SphereGeometry(rNode, 24, 24)),
      track(new THREE.MeshBasicMaterial({ color: COLOR[n.kind] })),
    );
    mesh.position.copy(p);
    group.add(mesh);
    // halo
    const halo = new THREE.Mesh(
      track(new THREE.SphereGeometry(rNode * (isCore ? 1.7 : 2.0), 18, 18)),
      track(new THREE.MeshBasicMaterial({ color: COLOR[n.kind], transparent: true, opacity: isCore ? 0.22 : 0.16, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    halo.position.copy(p);
    group.add(halo);

    const d = document.createElement("div");
    d.className = "archmap-label" + (isCore ? " core" : "") + (n.kind === "risk" ? " risk" : "");
    d.innerHTML = `<span class="al-name">${n.label}</span>${n.sub ? `<span class="al-sub">${n.sub}</span>` : ""}`;
    labelWrap.appendChild(d);
    // hang the label BELOW its node (clear of the sphere/halo) so text stays legible
    labels.push({ el: d, node: { pos: p }, off: isCore ? 34 : 16 });
  });

  // interaction
  let raf = 0, running = true;
  let autoRot = reduce ? 0 : 0.0016;
  let dragging = false, lastX = 0, lastY = 0;
  const rot = { x: -0.1, y: 0.2 };
  const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; autoRot = 0; el.setPointerCapture?.(e.pointerId); };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    rot.y += (e.clientX - lastX) * 0.006;
    rot.x += (e.clientY - lastY) * 0.006;
    rot.x = Math.max(-1.1, Math.min(1.1, rot.x));
    lastX = e.clientX; lastY = e.clientY;
  };
  const onUp = () => { dragging = false; };
  el.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  const v = new THREE.Vector3();
  const projectLabels = () => {
    for (const { el: le, node, off } of labels) {
      v.copy(node.pos).applyMatrix4(group.matrixWorld).project(camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      const depth = v.z; // ~ -1 near .. 1 far
      const behind = depth > 1 || depth < -1;
      // anchor at top-center and drop below the node so the sphere never covers the text
      le.style.transform = `translate(-50%, 0) translate(${x.toFixed(1)}px, ${(y + off).toFixed(1)}px)`;
      le.style.opacity = behind ? "0" : String(Math.max(0.32, 1 - Math.max(0, depth) * 0.85));
    }
  };

  const frame = () => {
    if (!dragging) rot.y += autoRot;
    group.rotation.y = rot.y;
    group.rotation.x = rot.x;
    group.updateMatrixWorld();
    renderer.render(scene, camera);
    projectLabels();
  };
  const loop = () => { if (!running) return; frame(); raf = requestAnimationFrame(loop); };
  if (reduce) frame(); else raf = requestAnimationFrame(loop);

  const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!reduce) { running = true; raf = requestAnimationFrame(loop); } };
  document.addEventListener("visibilitychange", onVis);

  const ro = new ResizeObserver(() => {
    const nw = el.clientWidth || w, nh = el.clientHeight || h;
    renderer.setSize(nw, nh);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    frame();
  });
  ro.observe(el);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    el.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    document.removeEventListener("visibilitychange", onVis);
    ro.disconnect();
    labels.forEach((l) => l.el.remove());
    dispose.forEach((d) => d.dispose && d.dispose());
    renderer.dispose();
    if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
  };
}
