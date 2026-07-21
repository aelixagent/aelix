"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, useLoader, useThree, invalidate } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * Diorama v2 — a true 3D painterly mountain world, scrubbed by scroll.
 * Built the same way the reference site does it: PROCEDURAL peaks (displaced
 * cones, seeded sine-noise ridges) wearing the impressionist textures, under
 * a bright sky, with aerial-perspective fog, drifting mist sprites, particles,
 * birds, and a tilt-shift depth-of-field post pass. Scroll flies the camera
 * along a spline through the range — every scroll offset is a camera frame.
 * The sky/fog grade from day-blue to Aelix dusk as you descend.
 *
 * ssr:false — import via next/dynamic from the client page.
 */

const BASE = "/experience/";
const TEX = {
  bg: BASE + "SC_01_BACKGROUND_MOUNTAINS_TEXTURE.webp",
  mountain: BASE + "SC_01_MOUNTAIN_TEXTURE.webp",
  ridge: BASE + "SC_01_RIDGE_TEXTURE.webp",
  river1: BASE + "SC_02_P1_TEXTURE.webp",
  river2: BASE + "SC_02_P6_TEXTURE.webp",
  river3: BASE + "SC_02_P2_TEXTURE.webp", // confluence — the river widens
  lake: BASE + "SC_03_LAKE_TEXTURE.webp",
  fog: BASE + "fog.webp",
  fogFlow: BASE + "fog_flow.webp",
  bird: BASE + "BIRD_ALPHA.webp",
  birdTex: BASE + "BIRD_TEXTURE_01.webp",
};

type RefN = React.RefObject<number>;
type Ref2 = React.RefObject<{ x: number; y: number }>;

/* ── colour script: sky/fog/dim stops across the scroll journey ────────── */
/* The journey is three chapters over a 1370vh runway:
   A (s 0 → ~0.37)   — the 3D mountain flight, daylight blues.
   ⬛ blackout #1 at the Built-For seam (s ≈ 0.372)
   B (s ~0.41 → 0.65) — the painted river flyover (SC_02 panels).
   ⬛ blackout #2 at the You-Decide seam (s ≈ 0.650)
   C (s ~0.68 → 1)   — the lake aerial finale; `dim` grades it to dusk. */
const SKY_STOPS = [
  // charcoal (#22242A) sky, horizon glow in true chartreuse ratio (#D7FE51)
  { s: 0.0,  top: [0.12, 0.13, 0.15],  bot: [0.35, 0.42, 0.13],  fog: [0.35, 0.42, 0.13],  dim: 0 },
  { s: 0.3,  top: [0.13, 0.14, 0.16],  bot: [0.40, 0.48, 0.15],  fog: [0.40, 0.48, 0.15],  dim: 0 },
  { s: 0.45, top: [0.12, 0.13, 0.15],  bot: [0.38, 0.45, 0.14],  fog: [0.38, 0.45, 0.14],  dim: 0.03 },
  { s: 0.75, top: [0.11, 0.12, 0.14],  bot: [0.35, 0.42, 0.13],  fog: [0.36, 0.43, 0.13],  dim: 0.06 },
  { s: 0.9,  top: [0.10, 0.11, 0.13],  bot: [0.32, 0.38, 0.12],  fog: [0.33, 0.39, 0.12],  dim: 0.06 },
  { s: 1.0,  top: [0.09, 0.10, 0.12],  bot: [0.29, 0.35, 0.11],  fog: [0.31, 0.37, 0.11],  dim: 0.10 },
];

/** Hard cuts to black between chapters, timed to section seams so each new
 *  title emerges from the dark. */
function blackoutAt(s: number): number {
  // one continuous 3D world — no chapter cut-to-dark
  void s;
  return 0;
}

/** Chapter-A progress: the camera finishes its flight before blackout #1. */
function chapterA(s: number): number {
  return Math.min(1, Math.max(0, s / 0.44));
}

function skyAt(s: number) {
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (s >= SKY_STOPS[i].s && s <= SKY_STOPS[i + 1].s) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const t = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s);
  const mix = (u: number[], v: number[]) => u.map((x, i) => x + (v[i] - x) * t);
  return { top: mix(a.top, b.top), bot: mix(a.bot, b.bot), fog: mix(a.fog, b.fog), dim: a.dim + (b.dim - a.dim) * t };
}

/* ── procedural peak: displaced open cone with seeded ridged noise ─────── */
type PeakCfg = {
  x: number; z: number; h: number; r: number;
  squash: number; rot: number; seed: number; tex: "mountain" | "ridge";
};

/* The camera flies the x≈0 corridor from z 4.5 → -26.5. Displacement can
   swell a peak's reach to ~1.9 × r in ANY direction (squash is pre-rotation),
   so every peak the camera passes keeps |x| ≥ r * 1.9 + 1. Peaks beyond the
   path's end (z < -34) are scenery only and may sit anywhere. */
const PEAKS: PeakCfg[] = [
  // THE hero peak — the camera sweeps ~300° around this one
  { x: 2.5,  z: -16, h: 13.5, r: 3.6, squash: 0.85, rot: 0.3, seed: 11,  tex: "mountain" },
  // outer ring — always something behind/beside the hero so frames stay full
  { x: -12,  z: -2,  h: 8.5,  r: 3.0, squash: 0.75, rot: 0.6, seed: 7,   tex: "ridge" },
  { x: 15,   z: -1,  h: 9.5,  r: 3.2, squash: 0.8,  rot: 1.9, seed: 19,  tex: "mountain" },
  { x: -19,  z: -13, h: 11.0, r: 3.8, squash: 0.7,  rot: 4.0, seed: 51,  tex: "mountain" },
  { x: -16,  z: -28, h: 10.0, r: 3.4, squash: 0.72, rot: 5.2, seed: 67,  tex: "ridge" },
  { x: -2,   z: -38, h: 12.0, r: 4.0, squash: 0.7,  rot: 0.9, seed: 83,  tex: "mountain" },
  { x: 9,    z: -32, h: 11.0, r: 3.6, squash: 0.74, rot: 3.3, seed: 97,  tex: "ridge" },
  { x: 21,   z: -24, h: 10.5, r: 3.4, squash: 0.7,  rot: 2.6, seed: 113, tex: "mountain" },
  { x: 20,   z: -6,  h: 9.0,  r: 3.0, squash: 0.76, rot: 4.4, seed: 127, tex: "ridge" },
  // far scenery — depth beyond the ring
  { x: -6,   z: -44, h: 12.0, r: 3.0, squash: 0.8,  rot: 2.2, seed: 163, tex: "mountain" },
  { x: 6,    z: -47, h: 13.0, r: 3.2, squash: 0.75, rot: 0.4, seed: 179, tex: "ridge" },
  { x: 18,   z: -38, h: 11.0, r: 2.8, squash: 0.8,  rot: 3.9, seed: 191, tex: "mountain" },
];

/* remap any painted texture to the brand ramp: charcoal → #8FAE2E → #D7FE51
   → #E9FF86. Kills every trace of forest-green — the world is literally
   drawn in chartreuse. Runs once per texture on the client. */
function chartreuseRamp(src: THREE.Texture): THREE.Texture {
  const img = src.image as HTMLImageElement;
  // downscale to a working cap: these are blurry backdrops (tiled ground, fogged
  // ring, small peak windows) — full res just makes the per-pixel remap block the
  // main thread at load. 800px keeps it crisp enough at a fraction of the pixels.
  const MAX = 800;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.max(2, Math.round(img.width * scale));
  const h = Math.max(2, Math.round(img.height * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  const stops: [number, number, number, number][] = [
    [0.0, 13, 14, 17],
    [0.45, 168, 200, 56],
    [0.78, 215, 254, 81],
    [1.0, 233, 255, 134],
  ];
  for (let i = 0; i < px.length; i += 4) {
    const l = Math.min(1, (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255);
    for (let k = 0; k < stops.length - 1; k++) {
      const A = stops[k], B = stops[k + 1];
      if (l >= A[0] && l <= B[0]) {
        const t = (l - A[0]) / (B[0] - A[0]);
        px[i] = A[1] + (B[1] - A[1]) * t;
        px[i + 1] = A[2] + (B[2] - A[2]) * t;
        px[i + 2] = A[3] + (B[3] - A[3]) * t;
        break;
      }
    }
  }
  ctx.putImageData(d, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/* crop a clean sub-rect out of a canvas-backed texture (fractions of w/h) */
function cropTex(src: THREE.Texture, fx: number, fy: number, fw: number, fh: number): THREE.Texture {
  const img = src.image as HTMLCanvasElement;
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(img.width * fw));
  c.height = Math.max(2, Math.round(img.height * fh));
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, img.width * fx, img.height * fy, c.width, c.height, 0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function buildPeak(cfg: PeakCfg): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(cfg.r, cfg.h, 140, 56, true);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // deterministic per-peak randomness
  let seed = cfg.seed * 7919 + 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ph = Array.from({ length: 6 }, () => rnd() * Math.PI * 2);
  const fr = [1.7, 2.4, 3.2, 5.3, 8.9, 13.7];
  const am = [0.42, 0.3, 0.2, 0.12, 0.07, 0.04];

  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (y + cfg.h / 2) / cfg.h; // 0 base → 1 apex
    const ang = Math.atan2(x, z);

    let n = 0;
    for (let k = 0; k < 6; k++) n += Math.sin(ang * fr[k] + ph[k] + t * (k + 1) * 1.35) * am[k];
    n += Math.abs(Math.sin(ang * 2.2 + ph[0])) * 0.55; // sharp ridge lines
    n += Math.abs(Math.sin(ang * 4.7 + ph[2] + t * 2.0)) * 0.3; // secondary crags
    const fall = Math.sin(Math.min(1, 1 - t) * Math.PI * 0.5); // 0 at apex → 1 at base
    // clamp the swell so a peak's true reach stays ≤ ~1.66 × r — the camera
    // corridor math depends on this bound
    const kf = 1 + Math.min(1.1, Math.max(-0.6, n)) * 0.6 * fall;

    pos.setX(i, x * kf);
    pos.setZ(i, z * kf * cfg.squash);
    pos.setY(i, y + Math.sin(ang * 3.7 + ph[1]) * (0.22 + 0.5 * t) * fall);

    // painted-sun shading baked into vertex colors: bright apex + lit faces
    const lit = 0.52 + 0.62 * t + 0.18 * Math.sin(ang + 2.3) + n * 0.12;
    const l = Math.max(0.38, Math.min(1.3, lit));
    // pale scree/snow toward the apex, like the reference peaks
    const snow = THREE.MathUtils.smoothstep(t, 0.72, 0.96) * (0.5 + 0.5 * Math.sin(ang * 1.7 + ph[3]));
    const edge = Math.max(0, n) * 0.9 + snow * 0.85 + Math.pow(t, 2.2) * 0.62;
    const lum = Math.min(1.25, 0.2 + edge); // grayscale — the ramped map carries the chartreuse
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = lum;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/* ── layered distant ridgelines: jagged silhouette curtains that replace the
   flat horizon band. Each ring is a thin strip whose TOP edge is 1-D ridged
   noise (abs-sine octaves over the angle), modulated by a slow angular
   envelope so some sectors read as tall massifs and others as low foothills,
   with the whole ring wobbled off-circle so distance-to-camera varies per
   angle. Feet sink below the ground plane; fog + a per-layer tint grade the
   far rings toward the horizon colour — so they stack into a real receding
   range with parallax across the 300° sweep, not a level painted wall. ───── */
type RidgeCfg = { rad: number; segs: number; baseH: number; ampH: number; seed: number; tint: number };

/* concentric to the point the camera orbits (the hero massif) so the rings
   frame the sweep; radii sit BEYOND every peak (peaks live within r≈31). */
const MASSIF = { x: 2.5, z: -16 };
const RIDGES: RidgeCfg[] = [
  { rad: 44, segs: 256, baseH: 2.2, ampH: 10, seed: 211, tint: 0.9 },
  { rad: 60, segs: 224, baseH: 3.0, ampH: 12, seed: 233, tint: 0.72 },
  { rad: 78, segs: 192, baseH: 3.5, ampH: 14, seed: 251, tint: 0.55 },
];

function buildRidge(cfg: RidgeCfg): THREE.BufferGeometry {
  let seed = cfg.seed * 7919 + 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fr = [3, 6, 11, 19, 34]; // low freqs → big massifs, high → crags
  const am = [1, 0.55, 0.3, 0.16, 0.09];
  const NORM = am.reduce((a, b) => a + b, 0);
  const ph = fr.map(() => rnd() * Math.PI * 2);
  const eph = rnd() * Math.PI * 2; // envelope phase — which sectors tower
  const wph = [rnd() * Math.PI * 2, rnd() * Math.PI * 2]; // radial-wobble phases
  const bottomY = -4; // sink the feet below the y≈-0.02 ground plane

  const N = cfg.segs;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    let n = 0;
    for (let k = 0; k < fr.length; k++) n += Math.abs(Math.sin(a * fr[k] + ph[k])) * am[k];
    n = Math.min(1, n / NORM);
    const env = 0.5 + 0.5 * Math.sin(a * 0.7 + eph); // tall-massif vs foothill sectors
    const top = cfg.baseH + n * cfg.ampH * (0.35 + 0.65 * env);
    // wobble the radius off-circle → distance-to-camera varies per angle → parallax
    const R = cfg.rad * (1 + 0.07 * Math.sin(a * 2 + wph[0]) + 0.035 * Math.sin(a * 5 + wph[1]));
    const x = MASSIF.x + Math.sin(a) * R;
    const z = MASSIF.z + Math.cos(a) * R;
    pos.push(x, bottomY, z, x, top, z);
    const crest = Math.min(0.7, 0.28 + 0.5 * n); // cap crest → controlled bloom
    const base = 0.1;
    col.push(base, base, base, crest, crest, crest);
    uv.push((i / N) * 8, 0, (i / N) * 8, 1); // u wraps 8× → strokes at reference scale
  }
  const idx: number[] = [];
  for (let i = 0; i < N; i++) {
    const a0 = i * 2, a1 = i * 2 + 1, b0 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
    idx.push(a0, b0, a1, a1, b0, b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g; // no normals — MeshBasicMaterial is unlit
}

/* ── tilt-shift depth-of-field post pass (sharp centre, soft edges) ────── */
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uAmount: { value: 0.55 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uAmount;
    void main() {
      vec2 c = vec2(0.5, 0.47);
      vec2 d2 = vec2((vUv.x - c.x) * 1.35, vUv.y - c.y);
      float blur = smoothstep(0.13, 0.72, length(d2)) * uAmount;
      vec2 r = uTexel * (blur * 13.0);
      vec4 col = texture2D(tDiffuse, vUv) * 0.2270;
      col += (texture2D(tDiffuse, vUv + vec2( 1.0,  0.0) * r) + texture2D(tDiffuse, vUv - vec2( 1.0,  0.0) * r)) * 0.1531;
      col += (texture2D(tDiffuse, vUv + vec2( 0.0,  1.0) * r) + texture2D(tDiffuse, vUv - vec2( 0.0,  1.0) * r)) * 0.1531;
      col += (texture2D(tDiffuse, vUv + vec2( 0.7,  0.7) * r) + texture2D(tDiffuse, vUv - vec2( 0.7,  0.7) * r)) * 0.0805;
      col += (texture2D(tDiffuse, vUv + vec2( 0.7, -0.7) * r) + texture2D(tDiffuse, vUv - vec2( 0.7, -0.7) * r)) * 0.0805;
      gl_FragColor = col;
    }
  `,
};

function Effects() {
  const { gl, scene, camera, size } = useThree();
  const bits = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    // gentle bloom — only the brightest chartreuse highlights glow (high threshold)
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 0.85);
    composer.addPass(bloom);
    const tilt = new ShaderPass(TiltShiftShader);
    composer.addPass(tilt);
    return { composer, tilt, bloom };
  }, [gl, scene, camera]);

  useEffect(() => {
    const pr = gl.getPixelRatio();
    bits.composer.setPixelRatio(pr);
    bits.composer.setSize(size.width, size.height);
    // half-res bloom — much cheaper (keeps the scroll smooth), still glows fine
    bits.bloom.setSize(Math.max(1, Math.round(size.width / 2)), Math.max(1, Math.round(size.height / 2)));
    (bits.tilt.uniforms.uTexel.value as THREE.Vector2).set(1 / (size.width * pr), 1 / (size.height * pr));
  }, [bits, gl, size]);

  useEffect(() => () => bits.composer.dispose(), [bits]);

  useFrame(() => {
    bits.composer.render();
  }, 1);

  return null;
}

/* ── full-screen clip-space quads: sky gradient behind, dusk dim in front ─ */
const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function SkyAndDim({ smooth }: { smooth: RefN }) {
  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform vec3 uTop, uBot;
          void main() {
            vec3 col = mix(uBot, uTop, smoothstep(0.12, 0.9, vUv.y));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        uniforms: { uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() } },
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  const dim = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform float uOpacity;
          void main() { gl_FragColor = vec4(vec3(0.08, 0.085, 0.095), uOpacity); }
        `,
        uniforms: { uOpacity: { value: 0 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  useFrame(() => {
    const s = smooth.current ?? 0;
    const g = skyAt(s);
    (sky.uniforms.uTop.value as THREE.Color).setRGB(g.top[0], g.top[1], g.top[2]);
    (sky.uniforms.uBot.value as THREE.Color).setRGB(g.bot[0], g.bot[1], g.bot[2]);
    // dusk grade OR the inter-chapter blackout — whichever is deeper
    dim.uniforms.uOpacity.value = Math.max(g.dim, blackoutAt(s));
  });

  return (
    <>
      <mesh renderOrder={-10} frustumCulled={false} material={sky}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh renderOrder={990} frustumCulled={false} material={dim}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </>
  );
}

/* ── camera flight path, scrubbed by scroll, nudged by pointer ─────────── */
/* the flight path — approach the hero peak, then sweep ~300° AROUND it
   (vvvhound-style: directed, circling one mountain, not a slalom) */
const POS_CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 4.0, 9),
  new THREE.Vector3(-1.5, 3.6, 0),
  new THREE.Vector3(-5, 3.3, -7),
  new THREE.Vector3(-10.5, 3.0, -16),
  new THREE.Vector3(-6, 2.8, -25.5),
  new THREE.Vector3(2.5, 2.6, -29.5),
  new THREE.Vector3(11, 2.5, -25),
  new THREE.Vector3(15, 2.45, -16),
  new THREE.Vector3(13.5, 2.4, -8),
]);
/* where the gaze locks during the sweep — the hero peak */
const PEAK_LOOK = new THREE.Vector3(2.5, 4.4, -16);

function Rig({ smooth, pointer }: { smooth: RefN; pointer: Ref2 }) {
  const { camera } = useThree();
  const pos = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const peak = useMemo(() => new THREE.Vector3(), []);
  const soft = useRef({ x: 0, y: 0 });

  useFrame(() => {
    const sA = chapterA(smooth.current ?? 0);
    POS_CURVE.getPoint(sA, pos);
    POS_CURVE.getPoint(Math.min(1, sA + 0.07), ahead);
    ahead.y += 0.15;
    // approach: look down the path; sweep: lock the gaze on the hero peak
    const lockOn = THREE.MathUtils.smoothstep(sA, 0.14, 0.32);
    peak.set(PEAK_LOOK.x, PEAK_LOOK.y - sA * 1.3, PEAK_LOOK.z);
    look.lerpVectors(ahead, peak, lockOn);
    const px = pointer.current?.x ?? 0;
    const py = pointer.current?.y ?? 0;
    soft.current.x += (px - soft.current.x) * 0.04;
    soft.current.y += (py - soft.current.y) * 0.04;
    const bank = THREE.MathUtils.clamp((ahead.x - pos.x) * -0.12 - soft.current.x * 0.04, -0.2, 0.2);
    camera.up.set(Math.sin(bank), Math.cos(bank), 0);
    camera.position.set(pos.x + soft.current.x * 0.5, pos.y - soft.current.y * 0.25, pos.z);
    camera.lookAt(look.x + soft.current.x * 1.1, look.y - soft.current.y * 0.7, look.z);
  });
  return null;
}

/* ── the painted world: peaks, ground, horizon ring ────────────────────── */
function World() {
  const [bg, mountain, ridge, lake] = useLoader(THREE.TextureLoader, [TEX.bg, TEX.mountain, TEX.ridge, TEX.lake]);

  const { peakMeshes, groundMat, ridgeMeshes } = useMemo(() => {
    for (const t of [bg, mountain, ridge, lake]) {
      // NoColorSpace: the composer has no output-encode pass, so pass the
      // authored painting through untouched (WYSIWYG, no double conversion)
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
      t.anisotropy = 4;
    }

    // hand-curated clean windows of each atlas — clear of the pink flower
    // patch, the purple corner and the dark bark strips
    const WINDOWS: Record<"mountain" | "ridge", [number, number][]> = {
      mountain: [
        [0.06, 0.3],
        [0.16, 0.38],
        [0.1, 0.46],
        [0.24, 0.28],
      ],
      ridge: [
        [0.12, 0.16],
        [0.2, 0.26],
        [0.08, 0.32],
        [0.28, 0.2],
      ],
    };
    const mountainC = chartreuseRamp(mountain);
    const ridgeC = chartreuseRamp(ridge);
    const bgC = chartreuseRamp(bg);
    const lakeC = chartreuseRamp(lake);
    const peakMeshes = PEAKS.map((cfg, i) => {
      const geo = buildPeak(cfg);
      const map = (cfg.tex === "mountain" ? mountainC : ridgeC).clone();
      map.needsUpdate = true;
      const win = WINDOWS[cfg.tex][i % WINDOWS[cfg.tex].length];
      map.offset.set(win[0], win[1]);
      map.repeat.set(0.44, 0.4); // strokes at reference scale, inside the window
      const mat = new THREE.MeshBasicMaterial({ map, fog: true, vertexColors: true });
      return { cfg, geo, mat };
    });

    // mossy valley floor — kept close to the fog tone so the horizon line
    // dissolves instead of cutting
    // valley floor — the aerial lake painting, tiled + graded chartreuse so the
    // foreground reads as glowing terrain instead of empty black
    // tile only the clean water/shore region — the atlas junk never reaches the floor
    const groundMap = cropTex(lakeC, 0.02, 0.3, 0.56, 0.62);
    groundMap.needsUpdate = true;
    groundMap.wrapS = groundMap.wrapT = THREE.MirroredRepeatWrapping;
    groundMap.repeat.set(9, 9);
    const groundMat = new THREE.MeshBasicMaterial({ map: groundMap, color: new THREE.Color(0.9, 0.9, 0.9), fog: true });

    // distant range: three concentric jagged silhouette curtains, each reusing
    // the ramped background painting, fogged + tinted so far layers recede into
    // aerial perspective instead of standing as one flat encircling band
    const ridgeMeshes = RIDGES.map((rc) => {
      const geo = buildRidge(rc);
      const map = bgC.clone();
      map.needsUpdate = true;
      map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping;
      map.offset.set(0, 0.3); // mid silhouette band of the painting
      map.repeat.set(1, 0.4); // u is driven by the geometry's 0..8 uv
      const mat = new THREE.MeshBasicMaterial({
        map,
        vertexColors: true,
        fog: true,
        color: new THREE.Color(rc.tint, rc.tint, rc.tint), // far layers desaturate toward fog
        side: THREE.DoubleSide, // the sweep views the ring from every angle
      });
      return { geo, mat };
    });

    return { peakMeshes, groundMat, ridgeMeshes };
  }, [bg, mountain, ridge, lake]);

  return (
    <>
      {/* peaks */}
      {peakMeshes.map(({ cfg, geo, mat }, i) => (
        <mesh
          key={i}
          geometry={geo}
          material={mat}
          position={[cfg.x, cfg.h / 2 - 0.15, cfg.z]}
          rotation={[0, cfg.rot, 0]}
        />
      ))}
      {/* valley floor — the aerial lake painting */}
      <mesh material={groundMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -18]}>
        <planeGeometry args={[240, 240]} />
      </mesh>
      {/* far horizon: layered jagged ridgelines receding into fog — replaces the flat band */}
      {ridgeMeshes.map(({ geo, mat }, i) => (
        <mesh key={`ridge-${i}`} geometry={geo} material={mat} renderOrder={-3} frustumCulled={false} />
      ))}
    </>
  );
}

/* ── drifting mist sprites ─────────────────────────────────────────────── */
/** Soft radial puff drawn at runtime — always smooth, no asset surprises. */
function makePuffTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.45, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function Mist({ smooth, animate }: { smooth: RefN; animate: boolean }) {
  const fogTex = useMemo(makePuffTexture, []);
  const group = useRef<THREE.Group>(null!);

  const puffs = useMemo(() => {
    let seed = 4242;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 10 }, (_, i) => ({
      x: (rnd() - 0.5) * 26,
      y: 0.6 + rnd() * 2.6,
      z: -6 - rnd() * 32,
      sc: 7 + rnd() * 9,
      v: 0.12 + rnd() * 0.25,
      ph: rnd() * Math.PI * 2,
      base: 0.16 + rnd() * 0.2,
    }));
  }, []);

  const materials = useMemo(
    () =>
      puffs.map(
        () =>
          new THREE.SpriteMaterial({
            map: fogTex,
            transparent: true,
            depthWrite: false,
            color: new THREE.Color(0.78, 0.9, 0.3),
            opacity: 0,
          }),
      ),
    [puffs, fogTex],
  );

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    const s = smooth.current ?? 0;
    const boost = 0.55 + 0.5 * band(s, 0.05, 0.85, 0.15); // drifting mist through the whole flight
    group.current.children.forEach((child, i) => {
      const p = puffs[i];
      const spr = child as THREE.Sprite;
      spr.position.set(p.x + Math.sin(t * p.v + p.ph) * 1.6, p.y + Math.sin(t * 0.3 + p.ph) * 0.25, p.z);
      spr.scale.set(p.sc, p.sc * 0.6, 1);
      (spr.material as THREE.SpriteMaterial).opacity = p.base * boost;
    });
  });

  return (
    <group ref={group}>
      {puffs.map((_, i) => (
        <sprite key={i} material={materials[i]} renderOrder={500} />
      ))}
    </group>
  );
}

/* ── floating dust/light particles ─────────────────────────────────────── */
function Particles({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    let seed = 999;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // a persistent ambient field — wider + taller volume so faint chartreuse
    // motes drift across EVERY section, not just the mountain moment
    const n = 140;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (rnd() - 0.5) * 42;
      arr[i * 3 + 1] = 0.2 + rnd() * 11;
      arr[i * 3 + 2] = 4 - rnd() * 46;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);

  useFrame((state) => {
    if (!animate) return;
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.03) * 0.05;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.11) * 0.35;
  });

  return (
    <points ref={ref} geometry={geo} renderOrder={400}>
      <pointsMaterial
        size={0.07}
        transparent
        opacity={0.62}
        color={new THREE.Color(0.78, 0.95, 0.4)}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

/* ── birds ────────────────────────────────────────────────────────────── */
function band(s: number, a: number, b: number, fade: number): number {
  const inN = THREE.MathUtils.smoothstep(s, a - fade, a + fade);
  const outN = 1 - THREE.MathUtils.smoothstep(s, b - fade, b + fade);
  return Math.min(inN, outN);
}



/* ── distant flock — a loose V of tiny gull silhouettes gliding ahead of
   the camera along the route. Small + far reads perfectly (no close-up
   geometry to look wrong). Hidden on the hero; fades in with the journey. ── */
function Flock({ smooth, animate }: { smooth: RefN; animate: boolean }) {
  const group = useRef<THREE.Group>(null!);
  const p = useMemo(() => new THREE.Vector3(), []);

  // classic gull "M" chevron: two triangles with a baked dihedral —
  // animating scale.y flaps the wing tips
  const { geo, mat } = useMemo(() => {
    const v = new Float32Array([
      // left wing
      -1, 0.3, -0.12, 0, 0, 0.14, 0, 0, -0.14,
      // right wing
      1, 0.3, -0.12, 0, 0, -0.14, 0, 0, 0.14,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(v, 3));
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.82, 0.85, 0.88),
      transparent: true,
      opacity: 0,
      fog: false,
      side: THREE.DoubleSide,
    });
    return { geo, mat };
  }, []);

  const BIRDS = useMemo(
    () => [
      { o: [0, 0, 0], ph: 0.0, sc: 0.34 },
      { o: [-0.9, 0.18, -0.8], ph: 1.7, sc: 0.3 },
      { o: [0.95, 0.12, -0.9], ph: 3.1, sc: 0.31 },
      { o: [-1.8, 0.34, -1.7], ph: 4.4, sc: 0.27 },
      { o: [1.9, 0.26, -1.8], ph: 5.6, sc: 0.28 },
    ],
    [],
  );

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    const s = smooth.current ?? 0;
    const sA = chapterA(s);
    POS_CURVE.getPoint(Math.min(1, sA + 0.13), p);
    // in once the journey starts, out before the river chapter
    mat.opacity =
      THREE.MathUtils.smoothstep(s, 0.03, 0.08) * (1 - THREE.MathUtils.smoothstep(s, 0.38, 0.46));
    group.current.children.forEach((child, i) => {
      const b = BIRDS[i];
      child.position.set(
        p.x + b.o[0] + Math.sin(t * 0.5 + b.ph) * 0.25,
        p.y + 1.1 + b.o[1] + Math.sin(t * 1.1 + b.ph) * 0.16,
        p.z + b.o[2],
      );
      const flap = 0.55 + 0.45 * Math.sin(t * 7 + b.ph);
      child.scale.set(b.sc, b.sc * flap, b.sc);
    });
  });

  return (
    <group ref={group}>
      {BIRDS.map((_, i) => (
        <mesh key={i} geometry={geo} material={mat} />
      ))}
    </group>
  );
}

/* ── painted flyover chapters: full-screen aerial paintings, scroll-scrubbed
      Ken-Burns (fade up out of a blackout, drift + zoom as you scroll) ──── */
type PaintCfg = {
  url: string;
  order: number;
  zoomFrom: number;
  zoomTo: number;
  win?: [number, number, number, number]; // clean uv window (x, y, w, h) — skips atlas junk
  panY: number; // total v drift across the panel's life
  opacity: (s: number) => number;
  prog: (s: number) => number;
};

const PAINT_CHAPTERS: PaintCfg[] = [
  // one visual per act — each panel owns a whole section, crossfades sit on the
  // section seams so the background never flips mid-read
  {
    url: TEX.river1, order: 940, zoomFrom: 1.42, zoomTo: 1.16, panY: 0.22,
    opacity: (s) => band(s, 0.475, 0.665, 0.04),
    prog: (s) => Math.min(1, Math.max(0, (s - 0.435) / 0.27)),
  },
  {
    url: TEX.river3, order: 942, zoomFrom: 1.14, zoomTo: 1.38, panY: 0.18,
    opacity: (s) => band(s, 0.585, 0.80, 0.04),
    prog: (s) => Math.min(1, Math.max(0, (s - 0.585) / 0.255)),
  },
  {
    url: TEX.river2, order: 944, zoomFrom: 1.4, zoomTo: 1.18, panY: 0.2,
    opacity: (s) => band(s, 0.72, 0.925, 0.04),
    prog: (s) => Math.min(1, Math.max(0, (s - 0.72) / 0.245)),
  },
  {
    url: TEX.lake, order: 946, zoomFrom: 1.18, zoomTo: 1.06, panY: 0.05,
    win: [0.02, 0.2, 0.58, 0.6],
    opacity: (s) => THREE.MathUtils.smoothstep(s, 0.845, 0.885),
    prog: (s) => Math.min(1, Math.max(0, (s - 0.845) / 0.155)),
  },
];

function PaintingLayer({ cfg, smooth }: { cfg: PaintCfg; smooth: RefN }) {
  const tex = useLoader(THREE.TextureLoader, cfg.url);

  const mat = useMemo(() => {
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
    tex.anisotropy = 4;
    return new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uMap;
        uniform float uOpacity, uProg, uTime;
        uniform float uZoomFrom, uZoomTo, uPanY;
        uniform float uImgAspect, uScreenAspect;
        uniform vec4 uWin;
        void main() {
          // background-size: cover, with zoom headroom for the drift
          float zoom = mix(uZoomFrom, uZoomTo, uProg);
          vec2 uv = (vUv - 0.5) / zoom + 0.5;
          vec2 sc = (uScreenAspect > uImgAspect)
            ? vec2(1.0, uImgAspect / uScreenAspect)
            : vec2(uScreenAspect / uImgAspect, 1.0);
          uv = (uv - 0.5) * sc + 0.5;
          uv.y += (0.5 - uProg) * uPanY;                // fly "north" as you scroll
          uv.x += sin(uTime * 0.02) * 0.008;            // barely-there idle drift
          uv = uWin.xy + clamp(uv, 0.0, 1.0) * uWin.zw; // stay inside the clean window
          vec4 c = texture2D(uMap, uv);
          float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          vec3 dk   = vec3(0.051, 0.055, 0.067); // charcoal
          vec3 mid  = vec3(0.659, 0.784, 0.220); // brighter chartreuse mid
          vec3 top  = vec3(0.843, 0.996, 0.318); // #D7FE51 exact
          vec3 neon = vec3(0.914, 1.0, 0.525);   // #E9FF86
          vec3 graded = mix(dk, mid, smoothstep(0.0, 0.45, lum));
          graded = mix(graded, top, smoothstep(0.45, 0.78, lum));
          graded = mix(graded, neon, smoothstep(0.78, 1.0, lum));
          gl_FragColor = vec4(graded, uOpacity);
        }
      `,
      uniforms: {
        uMap: { value: tex },
        uOpacity: { value: 0 },
        uProg: { value: 0 },
        uTime: { value: 0 },
        uZoomFrom: { value: cfg.zoomFrom },
        uZoomTo: { value: cfg.zoomTo },
        uPanY: { value: cfg.panY },
        uImgAspect: { value: 1 },
        uScreenAspect: { value: 1 },
        uWin: { value: new THREE.Vector4(...(cfg.win ?? [0, 0, 1, 1])) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  }, [tex, cfg]);

  useFrame((state) => {
    const s = smooth.current ?? 0;
    const u = mat.uniforms;
    u.uOpacity.value = cfg.opacity(s);
    u.uProg.value = cfg.prog(s);
    u.uTime.value = state.clock.elapsedTime;
    u.uScreenAspect.value = state.size.width / state.size.height;
    const img = tex.image as { width?: number; height?: number } | undefined;
    const win = cfg.win ?? [0, 0, 1, 1];
    if (img?.width && img?.height) u.uImgAspect.value = (img.width * win[2]) / (img.height * win[3]);
  });

  return (
    <mesh renderOrder={cfg.order} frustumCulled={false} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/* ── low foreground haze: fills the near floor with drifting chartreuse fog ─ */
function GroundHaze({ smooth, animate }: { smooth: RefN; animate: boolean }) {
  const tex = useLoader(THREE.TextureLoader, BASE + "SMOKE.webp");
  const group = useRef<THREE.Group>(null!);

  const puffs = useMemo(() => {
    let seed = 7331;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 11 }, () => ({
      x: (rnd() - 0.5) * 32,
      y: -0.4 + rnd() * 1.8,
      z: 3 - rnd() * 28,
      sc: 11 + rnd() * 13,
      v: 0.05 + rnd() * 0.13,
      ph: rnd() * Math.PI * 2,
      base: 0.1 + rnd() * 0.16,
    }));
  }, []);

  const materials = useMemo(() => {
    tex.colorSpace = THREE.NoColorSpace;
    return puffs.map(
      () =>
        new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color(0.7, 0.82, 0.26),
          opacity: 0,
        }),
    );
  }, [puffs, tex]);

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    const s = smooth.current ?? 0;
    // present through chapter A, gone before blackout #1
    const boost = 0.5 + 0.6 * band(s, 0.02, 0.8, 0.12);
    group.current.children.forEach((child, i) => {
      const p = puffs[i];
      const spr = child as THREE.Sprite;
      spr.position.set(p.x + Math.sin(t * p.v + p.ph) * 2.4, p.y + Math.sin(t * 0.2 + p.ph) * 0.22, p.z);
      spr.scale.set(p.sc, p.sc * 0.5, 1);
      (spr.material as THREE.SpriteMaterial).opacity = p.base * boost;
    });
  });

  return (
    <group ref={group}>
      {puffs.map((_, i) => (
        <sprite key={i} material={materials[i]} renderOrder={470} />
      ))}
    </group>
  );
}

/* ── drifting fog bands circling the massif (fog_flow.webp) — depth + never-empty ─ */
function FogRing({ animate }: { animate: boolean }) {
  const tex = useLoader(THREE.TextureLoader, TEX.fogFlow);
  const group = useRef<THREE.Group>(null!);
  const bands = useMemo(() => {
    let seed = 3113;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // a LOW, WIDE valley-fog belt nestled in the gap between the near peaks
    // (r≈31) and the nearest ridgeline (r≈44) — an aerial-perspective layer
    // break that separates foreground from range, not upright panels ringing
    // the hero
    return Array.from({ length: 16 }, (_, i) => ({
      a: (i / 16) * Math.PI * 2,
      rad: 33 + rnd() * 11,
      y: 0.4 + rnd() * 2.4,
      sc: 16 + rnd() * 14,
      v: 0.015 + rnd() * 0.05,
      ph: rnd() * Math.PI * 2,
      base: 0.05 + rnd() * 0.08,
    }));
  }, []);
  const materials = useMemo(() => {
    tex.colorSpace = THREE.NoColorSpace;
    return bands.map(
      () =>
        new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color(0.62, 0.73, 0.24),
          opacity: 0,
        }),
    );
  }, [bands, tex]);
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    group.current.children.forEach((child, i) => {
      const b = bands[i];
      const spr = child as THREE.Sprite;
      const a = b.a + t * b.v;
      spr.position.set(2.5 + Math.sin(a) * b.rad, b.y + Math.sin(t * 0.15 + b.ph) * 0.4, -16 + Math.cos(a) * b.rad);
      spr.scale.set(b.sc, b.sc * 0.32, 1); // flatter banks — a haze belt, not standing panels
      (spr.material as THREE.SpriteMaterial).opacity = b.base;
    });
  });
  return (
    <group ref={group}>
      {bands.map((_, i) => (
        <sprite key={i} material={materials[i]} renderOrder={450} />
      ))}
    </group>
  );
}

/* ── starfield in the charcoal sky ─────────────────────────────────────── */
function Stars({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    let seed = 777;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 460;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (rnd() - 0.5) * 190;
      arr[i * 3 + 1] = 15 + rnd() * 52; // high band — above the peaks, in the dark sky
      arr[i * 3 + 2] = 24 - rnd() * 130;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);

  useFrame((state) => {
    if (!animate) return;
    const m = ref.current.material as THREE.PointsMaterial;
    m.opacity = 0.72 + Math.sin(state.clock.elapsedTime * 0.6) * 0.16; // slow twinkle
  });

  return (
    <points ref={ref} geometry={geo} renderOrder={-5}>
      <pointsMaterial
        size={0.34}
        transparent
        opacity={0.8}
        color={new THREE.Color(0.92, 0.95, 0.86)}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        fog={false}
      />
    </points>
  );
}

/* ── first-frame signal: tells the page the world has actually painted, so the
   preloader can lift onto a live scene instead of a dark void ─────────────── */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const fired = useRef(false);
  const frames = useRef(0);
  useFrame(() => {
    if (fired.current) return;
    // let a couple of frames compose (bloom + tilt-shift render at priority 1)
    if (++frames.current >= 2) {
      fired.current = true;
      onReady?.();
    }
  });
  return null;
}

/* ── scene root: fog grading + everything wired to the smoothed scroll ─── */
function SceneRoot({ scroll, pointer, animate, onReady }: { scroll: RefN; pointer: Ref2; animate: boolean; onReady?: () => void }) {
  const { scene } = useThree();
  const smooth = useRef(0);

  const fog = useMemo(() => new THREE.Fog(new THREE.Color(0.30, 0.34, 0.12), 16, 54), []);
  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  useFrame(() => {
    const raw = scroll.current ?? 0;
    // demand mode (reduced motion / offscreen) renders single frames on
    // scroll — snap instead of easing so the frame matches the position
    if (animate) smooth.current += (raw - smooth.current) * 0.075;
    else smooth.current = raw;
    const g = skyAt(smooth.current);
    // fog matches the sky's horizon colour exactly → seamless blend
    fog.color.setRGB(g.bot[0], g.bot[1], g.bot[2]);
    fog.near = 14;
    fog.far = 62 - smooth.current * 8;
  });

  return (
    <>
      <ReadySignal onReady={onReady} />
      <SkyAndDim smooth={smooth} />
      <Stars animate={animate} />
      <World />
      <Mist smooth={smooth} animate={animate} />
      <GroundHaze smooth={smooth} animate={animate} />
      <FogRing animate={animate} />
      <Particles animate={animate} />
      <Flock smooth={smooth} animate={animate} />
      {/* river/lake panels aren't visible until the flight ends (~44% scroll):
          stream them in their OWN Suspense so ~1.6MB of textures never blocks
          the world's first paint */}
      <Suspense fallback={null}>
        {PAINT_CHAPTERS.map((cfg) => (
          <PaintingLayer key={cfg.url + cfg.order} cfg={cfg} smooth={smooth} />
        ))}
      </Suspense>
      <Rig smooth={smooth} pointer={pointer} />
      <Effects />
    </>
  );
}

export default function Diorama({ onReady }: { onReady?: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const scroll = useRef(0);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const onMove = (e: MouseEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scroll.current = max > 0 ? window.scrollY / max : 0;
      // in demand mode (reduced motion / offscreen) request a frame so the
      // scene still tracks the scroll position; no-op while looping
      invalidate();
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    const el = wrap.current;
    let io: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting)), {
        threshold: 0.01,
      });
      io.observe(el);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io?.disconnect();
    };
  }, []);

  const animate = inView && !reduced;

  return (
    <div className="vx-bg" ref={wrap} aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={animate ? "always" : "demand"}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: 50, near: 0.1, far: 120, position: [0, 3.3, 4.5] }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0.12, 0.13, 0.15), 1)}
      >
        <Suspense fallback={null}>
          <SceneRoot scroll={scroll} pointer={pointer} animate={animate} onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}
