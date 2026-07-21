"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * SquaresBg (ReactBits "Squares") — an endless drifting grid where random
 * cells flicker in, plus a hover-highlighted cell. Absolute-positioned canvas;
 * the parent section must be position:relative (every .sec already is) and
 * content must sit in .wrap (z-index:2), so just drop it in first:
 *
 *   <section className="sec dark">
 *     <SquaresBg />            ← lime-on-ink (default)
 *     <SquaresBg tone="ink" /> ← ink-on-lime for light sections
 *     <div className="wrap">…</div>
 */
export function SquaresBg({
  tone = "lime",
  speed = 0.18,
  cell = 44,
  className,
}: {
  tone?: "lime" | "ink";
  speed?: number;
  cell?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    if (!ctx || !parent) return;

    const stroke = tone === "lime" ? "rgba(197,233,74,0.10)" : "rgba(22,24,13,0.10)";
    const fill = tone === "lime" ? "rgba(197,233,74,0.07)" : "rgba(22,24,13,0.06)";
    const hot = tone === "lime" ? "rgba(197,233,74,0.16)" : "rgba(226,59,59,0.14)";

    let raf = 0;
    let off = 0;
    let w = 0;
    let h = 0;
    const mouse = { x: -1, y: -1 };
    // deterministic flicker pattern per cell
    const flick = (cx: number, cy: number, t: number) =>
      Math.sin(cx * 127.1 + cy * 311.7 + Math.floor(t / 900)) * 43758.5453 % 1;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const r = parent.getBoundingClientRect();
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      canvas.width = w;
      canvas.height = h;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      const startX = -(off % cell);
      for (let x = startX; x < w; x += cell) {
        for (let y = 0; y < h; y += cell) {
          const cx = Math.floor((x + off) / cell);
          const cy = Math.floor(y / cell);
          const f = Math.abs(flick(cx, cy, t));
          if (f > 0.965) {
            ctx.fillStyle = fill;
            ctx.fillRect(x, y, cell, cell);
          }
          ctx.strokeRect(x + 0.5, y + 0.5, cell, cell);
          if (
            mouse.x >= x && mouse.x < x + cell &&
            mouse.y >= y && mouse.y < y + cell
          ) {
            ctx.fillStyle = hot;
            ctx.fillRect(x, y, cell, cell);
          }
        }
      }
    };

    const frame = (t: number) => {
      off += speed;
      draw(t);
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => {
      mouse.x = -1;
      mouse.y = -1;
    };

    resize();
    window.addEventListener("resize", resize);
    parent.addEventListener("mousemove", onMove);
    parent.addEventListener("mouseleave", onLeave);

    let io: IntersectionObserver | undefined;
    if (reduce) {
      draw(0);
    } else if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        cancelAnimationFrame(raf);
        if (vis) raf = requestAnimationFrame(frame);
      });
      io.observe(canvas);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      window.removeEventListener("resize", resize);
      parent.removeEventListener("mousemove", onMove);
      parent.removeEventListener("mouseleave", onLeave);
    };
  }, [tone, speed, cell]);

  return <canvas ref={ref} className={cn("squares-bg", className)} aria-hidden="true" />;
}
