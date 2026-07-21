"use client";

import { useEffect, useRef } from "react";
import type Lenis from "lenis";

/**
 * Shared access to the single Lenis instance created by <SmoothScroll />.
 * Client-only. `getLenis()` returns null before mount, when the user prefers
 * reduced motion, or after teardown — always guard.
 */
let instance: Lenis | null = null;
const subs = new Set<(l: Lenis | null) => void>();

export function setLenis(l: Lenis | null) {
  instance = l;
  subs.forEach((fn) => fn(l));
}

export function getLenis(): Lenis | null {
  return instance;
}

/**
 * Smoothed scroll velocity (px/frame-ish) as a ref — updated on every Lenis
 * scroll tick without re-rendering. Falls back to a manual scroll listener
 * when Lenis is off (reduced motion), so consumers always get a signal.
 */
export function useScrollVelocity(): React.RefObject<number> {
  const vel = useRef(0);

  useEffect(() => {
    let raf = 0;
    let lastY = window.scrollY;
    let cleanupLenis: (() => void) | null = null;

    const onLenisScroll = (l: Lenis) => {
      vel.current = l.velocity;
    };
    const attach = (l: Lenis | null) => {
      cleanupLenis?.();
      cleanupLenis = null;
      if (l) {
        l.on("scroll", onLenisScroll);
        cleanupLenis = () => l.off("scroll", onLenisScroll);
      }
    };
    attach(instance);
    subs.add(attach);

    // fallback decay loop for the no-Lenis case
    const tick = () => {
      if (!instance) {
        const y = window.scrollY;
        vel.current = vel.current * 0.85 + (y - lastY) * 0.15;
        lastY = y;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      subs.delete(attach);
      cleanupLenis?.();
      cancelAnimationFrame(raf);
    };
  }, []);

  return vel;
}
