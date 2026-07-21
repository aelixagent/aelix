"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Magnetic — the child drifts toward the cursor while hovered, snapped to a
 * 2px grid so it "ticks" instead of gliding (pixel take on the classic
 * magnetic button). Wrap a single element:
 *
 *   <Magnetic><a href="#access" className="btn btn-primary">Request Access ▸</a></Magnetic>
 */
export function Magnetic({
  children,
  className,
  strength = 0.22,
  max = 8,
}: {
  children: ReactNode;
  className?: string;
  /** how strongly the child follows the cursor (0..1) */
  strength?: number;
  /** max offset in px */
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const target = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });

  const snap = (v: number) => Math.round(v / 2) * 2;

  const loop = () => {
    const el = ref.current;
    if (!el) return;
    pos.current.x += (target.current.x - pos.current.x) * 0.3;
    pos.current.y += (target.current.y - pos.current.y) * 0.3;
    el.style.transform = `translate(${snap(pos.current.x)}px, ${snap(pos.current.y)}px)`;
    if (
      Math.abs(target.current.x - pos.current.x) > 0.5 ||
      Math.abs(target.current.y - pos.current.y) > 0.5
    ) {
      raf.current = requestAnimationFrame(loop);
    } else {
      raf.current = 0;
      if (target.current.x === 0 && target.current.y === 0) el.style.transform = "";
    }
  };

  const onMove = (e: React.MouseEvent) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    target.current.x = Math.max(-max, Math.min(max, dx * strength));
    target.current.y = Math.max(-max, Math.min(max, dy * strength));
    if (!raf.current) raf.current = requestAnimationFrame(loop);
  };

  const onLeave = () => {
    target.current.x = 0;
    target.current.y = 0;
    if (!raf.current) raf.current = requestAnimationFrame(loop);
  };

  return (
    <div
      ref={ref}
      className={cn("magnetic", className)}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ display: "inline-block" }}
    >
      {children}
    </div>
  );
}
