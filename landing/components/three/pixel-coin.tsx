"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * PixelCoin — a spinning voxel $VLR coin built from instanced cubes:
 * red pixel rim, ink face, lime "V". Rendered at low DPR + antialias off
 * (image-rendering:pixelated via .pixel-coin canvas) to stay on-theme.
 *
 * Import with next/dynamic ({ ssr: false }); it fills its parent
 * (<div className="pixel-coin"> sizing comes from globals.css).
 * Respects prefers-reduced-motion (static frame) and pauses offscreen.
 */

const GRID = 15;
const V_MASK = [
  "...............",
  "...............",
  "...##.....##...",
  "...##.....##...",
  "...##.....##...",
  "....##...##....",
  "....##...##....",
  "....##...##....",
  ".....##.##.....",
  ".....##.##.....",
  "......###......",
  "......###......",
  "...............",
  "...............",
  "...............",
];

const INK = "#ECF2F0";
const LIME = "#D7FE51";
const RED = "#FF5B52";

type Voxel = { x: number; y: number; z: number; color: string };

function buildVoxels(): Voxel[] {
  const c = (GRID - 1) / 2;
  const voxels: Voxel[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const dx = col - c;
      const dy = row - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 7.4) continue;
      const isV = V_MASK[row][col] === "#";
      const isRim = d > 6.1;
      voxels.push({
        x: dx,
        y: -dy,
        // V pixels poke out of both faces for a stamped/embossed read
        z: isV ? 0.5 : 0,
        color: isV ? LIME : isRim ? RED : INK,
      });
    }
  }
  return voxels;
}

function Coin({ animate }: { animate: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const group = useRef<THREE.Group>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const voxels = useMemo(buildVoxels, []);

  useLayoutEffect(() => {
    const m = mesh.current;
    const col = new THREE.Color();
    const S = 0.42; // voxel pitch
    voxels.forEach((v, i) => {
      dummy.position.set(v.x * S, v.y * S, 0);
      dummy.scale.set(1, 1, v.z > 0 ? 1.9 : 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, col.set(v.color));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [voxels, dummy]);

  useFrame((state, delta) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y += delta * 0.7;
    // stepped bob, like a sprite idle animation
    group.current.position.y = (Math.round(Math.sin(t * 1.4) * 3) / 3) * 0.22;
  });

  return (
    <group ref={group} rotation={[0.1, 0, 0]}>
      <instancedMesh ref={mesh} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
        <boxGeometry args={[0.42, 0.42, 0.9]} />
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  );
}

export function PixelCoin() {
  const wrap = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = wrap.current;
    let io: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => setInView(entries.some((e) => e.isIntersecting)),
        { threshold: 0.05 },
      );
      io.observe(el);
    }
    return () => io?.disconnect();
  }, []);

  const animate = inView && !reduced;

  return (
    <div className="pixel-coin" ref={wrap} aria-hidden="true">
      <Canvas
        dpr={0.35}
        frameloop={animate ? "always" : "demand"}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
        camera={{ position: [0, 0.4, 8.4], fov: 40 }}
      >
        <ambientLight intensity={1.25} />
        <directionalLight position={[3, 5, 6]} intensity={1.2} />
        <Coin animate={animate} />
      </Canvas>
    </div>
  );
}
