"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * TiltCard — quantized 3D tilt toward the cursor (rotation snaps in 1.5°
 * steps, so it clicks like a sprite sheet instead of floating). The hard
 * shadow counter-shifts for depth. Wrapper div; give it the card class:
 *
 *   <TiltCard className="card"> ... </TiltCard>
 */
export function TiltCard({
  children,
  className,
  maxTilt = 4.5,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    const step = (v: number) => Math.round(v / 1.5) * 1.5;
    const rx = step(-py * maxTilt * 2);
    const ry = step(px * maxTilt * 2);
    el.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  };

  const onLeave = () => {
    const el = ref.current;
    if (el) el.style.transform = "";
  };

  return (
    <div ref={ref} className={cn("tilt-card", className)} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </div>
  );
}
