"use client";

import { useEffect, useRef } from "react";

/**
 * BorderScan (MagicUI "BorderBeam", pixel edition) — a small square that
 * marches around the edge of its nearest position:relative ancestor in 8px
 * steps. Drop it INSIDE a bordered box (add style={{position:'relative'}} to
 * the box if it isn't already):
 *
 *   <div className="stats" style={{ position: "relative" }}>
 *     <BorderScan />
 *     ...
 *   </div>
 */
export function BorderScan({
  color = "#FF5B52",
  size = 10,
  /** full loops per minute-ish; higher = faster */
  speed = 90,
  inset = -3,
}: {
  color?: string;
  size?: number;
  speed?: number;
  inset?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const dot = ref.current;
    const host = dot?.parentElement;
    if (!dot || !host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let dist = 0;
    let last = 0;
    let running = false;

    const frame = (t: number) => {
      if (!last) last = t;
      const dt = (t - last) / 1000;
      last = t;
      const w = host.clientWidth - inset * 2 - size;
      const h = host.clientHeight - inset * 2 - size;
      const peri = 2 * (w + h);
      dist = (dist + speed * dt * 4) % peri;
      // snap to an 8px grid — marching, not gliding
      const d = Math.round(dist / 8) * 8;
      let x = inset;
      let y = inset;
      if (d < w) {
        x += d;
      } else if (d < w + h) {
        x += w;
        y += d - w;
      } else if (d < w * 2 + h) {
        x += w - (d - w - h);
        y += h;
      } else {
        y += h - (d - w * 2 - h);
      }
      dot.style.transform = `translate(${x}px, ${y}px)`;
      raf = requestAnimationFrame(frame);
    };

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        if (vis && !running) {
          running = true;
          last = 0;
          raf = requestAnimationFrame(frame);
        } else if (!vis && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      });
      io.observe(host);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [speed, size, inset]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: size,
        height: size,
        background: color,
        pointerEvents: "none",
        zIndex: 3,
      }}
    />
  );
}
