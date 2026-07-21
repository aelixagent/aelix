"use client";

import { useEffect, useRef } from "react";

/** Quantization step for the fill (5% increments → stepped, non-smooth motion). */
const STEP = 0.05;
/** Viewport reference line: fill tracks how far the list has crossed 80% of the viewport. */
const VIEW_LINE = 0.8;

/**
 * RoadmapProgress — an ink spine that fills down over the `.road` left border
 * as the timeline scrolls through the viewport, snapped to 5% steps, with a
 * red pixel head at the tip. Purely decorative (aria-hidden).
 *
 * Must be rendered as a child of `.road`, which needs `position: relative`.
 * Reduced motion → renders full immediately, no listeners.
 */
export function RoadmapProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const track = bar?.parentElement;
    if (!bar || !track) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      bar.style.height = "100%";
      return;
    }

    let raf = 0;
    let last = -1;

    const update = () => {
      raf = 0;
      const rect = track.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const raw = (vh * VIEW_LINE - rect.top) / Math.max(rect.height, 1);
      const q = Math.min(1, Math.max(0, Math.round(raw / STEP) * STEP));
      if (q !== last) {
        last = q;
        bar.style.height = `${q * 100}%`;
      }
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div
      ref={barRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: -6, // border-left spans [-3, 0] from the padding edge; overhang 3px each side
        width: 9,
        height: 0,
        background: "var(--ink)",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {/* red pixel head at the fill tip (clipped away at 0%) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: 9,
          height: 9,
          background: "var(--red)",
        }}
      />
    </div>
  );
}
