"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * PixelCard (ReactBits "PixelCard", brutalist edition) — on hover/focus a
 * burst of chunky pixels materializes across the card, then dissolves.
 * Renders a wrapper div; give it the card's className and put the card
 * content inside:
 *
 *   <PixelCard className="card"> ...card content... </PixelCard>
 *
 * Pixels sit behind the content (content is lifted to z-index:1 via
 * .pixel-card-content in globals.css).
 */
export function PixelCard({
  children,
  className,
  colors = ["#ECF2F0", "#FF5B52", "#D7FE51"],
  gap = 12,
  size = 6,
}: {
  children: ReactNode;
  className?: string;
  colors?: string[];
  gap?: number;
  size?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const el = wrap.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    type Px = { x: number; y: number; color: string; delay: number; life: number };
    let pixels: Px[] = [];
    let start = 0;
    let dir: 1 | -1 = 1;

    const build = () => {
      const r = el.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width));
      canvas.height = Math.max(1, Math.floor(r.height));
      pixels = [];
      for (let y = 0; y < canvas.height; y += gap) {
        for (let x = 0; x < canvas.width; x += gap) {
          pixels.push({
            x,
            y,
            color: colors[Math.floor(Math.random() * colors.length)],
            delay: Math.random() * 350,
            life: 180 + Math.random() * 320,
          });
        }
      }
    };

    const frame = (t: number) => {
      if (!start) start = t;
      const elapsed = t - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of pixels) {
        const local = dir === 1 ? elapsed - p.delay : p.delay + p.life - elapsed;
        if (local > 0 && local < p.life) {
          alive = true;
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 0.16;
          ctx.fillRect(p.x, p.y, size, size);
        } else if (dir === 1 && local <= 0) {
          alive = true;
        }
      }
      ctx.globalAlpha = 1;
      if (alive && elapsed < 4000) raf.current = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const play = (d: 1 | -1) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      cancelAnimationFrame(raf.current);
      build();
      dir = d;
      start = 0;
      raf.current = requestAnimationFrame(frame);
    };

    const enter = () => play(1);
    const leave = () => play(-1);
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    el.addEventListener("focusin", enter);
    return () => {
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
      el.removeEventListener("focusin", enter);
      cancelAnimationFrame(raf.current);
    };
  }, [colors, gap, size]);

  return (
    <div ref={wrap} className={cn("pixel-card", className)}>
      <canvas ref={canvasRef} className="pixel-card-fx" aria-hidden="true" />
      <div className="pixel-card-content">{children}</div>
    </div>
  );
}
