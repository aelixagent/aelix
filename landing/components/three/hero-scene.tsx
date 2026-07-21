"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * HeroScene — pixelated three.js backdrop for the hero: a slowly orbiting
 * ring of voxel candlesticks (a "data sculpture", not a chart). Rendered at
 * very low DPR with antialias off + CSS image-rendering:pixelated so it lands
 * on the same chunky grid as the rest of the theme.
 *
 * Import with next/dynamic ({ ssr: false }) from a client component and drop
 * inside the hero: <HeroScene />. It fills its parent via .hero-3d.
 * Respects prefers-reduced-motion (renders one static frame) and pauses when
 * scrolled out of view.
 */

const COUNT = 84;
const INK = "#ECF2F0";
const OLIVE = "#D7FE51";
const RED = "#FF5B52";

function CandleRing({ animate, pointer }: { animate: boolean; pointer: React.RefObject<{ x: number; y: number }> }) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const group = useRef<THREE.Group>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const bars = useMemo(() => {
    // deterministic pseudo-random so SSR/hydration/replays never disagree
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: COUNT }, (_, i) => {
      const ring = i % 2; // two interleaved rings for depth
      const angle = (i / COUNT) * Math.PI * 4;
      const radius = ring === 0 ? 5.2 : 6.6;
      const r = rnd();
      return {
        angle,
        radius,
        base: 0.7 + rnd() * 1.9,
        amp: 0.35 + rnd() * 0.85,
        phase: rnd() * Math.PI * 2,
        speed: 0.35 + rnd() * 0.5,
        color: r < 0.08 ? RED : r < 0.3 ? OLIVE : INK,
        y: ring === 0 ? -0.4 : -0.9,
      };
    });
  }, []);

  useLayoutEffect(() => {
    const m = mesh.current;
    const c = new THREE.Color();
    bars.forEach((b, i) => m.setColorAt(i, c.set(b.color)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [bars]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (animate) {
      group.current.rotation.y += delta * 0.1;
      // quantized pointer parallax — snaps in small steps, pixel-style
      const px = Math.round(pointer.current.x * 8) / 8;
      const py = Math.round(pointer.current.y * 8) / 8;
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, 0.12 + py * 0.06, 0.06);
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, px * -0.04, 0.06);
    }
    const m = mesh.current;
    for (let i = 0; i < COUNT; i++) {
      const b = bars[i];
      // step-quantized heights so the bars "tick" instead of easing
      const raw = b.base + Math.sin(t * b.speed + b.phase) * b.amp;
      const h = Math.max(0.3, Math.round(raw * 3) / 3);
      dummy.position.set(Math.cos(b.angle) * b.radius, b.y + h / 2, Math.sin(b.angle) * b.radius);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group} rotation={[0.12, 0, 0]}>
      <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <boxGeometry args={[0.34, 1, 0.34]} />
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  );
}

export function HeroScene() {
  const wrap = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [inView, setInView] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    // the canvas is pointer-events:none, so track parallax at window level
    const onMove = (e: MouseEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("mousemove", onMove);

    const el = wrap.current;
    let io: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => setInView(entries.some((e) => e.isIntersecting)),
        { threshold: 0.02 },
      );
      io.observe(el);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      io?.disconnect();
    };
  }, []);

  const animate = inView && !reduced;

  return (
    <div className="hero-3d" ref={wrap} aria-hidden="true">
      <Canvas
        dpr={0.3}
        frameloop={animate ? "always" : "demand"}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
        camera={{ position: [0, 2.3, 10.5], fov: 42 }}
      >
        <ambientLight intensity={1.35} />
        <directionalLight position={[4, 8, 6]} intensity={1.1} />
        <CandleRing animate={animate} pointer={pointer} />
      </Canvas>
    </div>
  );
}
