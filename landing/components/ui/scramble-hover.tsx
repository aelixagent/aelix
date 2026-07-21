"use client";

import { useRef, useCallback } from "react";
import { cn } from "@/lib/cn";

const CHARSET = "▓▒░#%&@$<>*+=01";

/**
 * ScrambleHover — scrambles the text through pixel glyphs and settles back on
 * hover/focus. For nav links, buttons, small labels.
 *
 *   <ScrambleHover text="MANIFESTO" />
 *   <a href="#top"><ScrambleHover text="REQUEST ACCESS" /> ▸</a>
 */
export function ScrambleHover({
  text,
  className,
  speed = 26,
}: {
  text: string;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);

  const play = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(raf.current);
    let revealed = 0;
    let last = 0;
    const tick = (t: number) => {
      if (!last) last = t;
      if (t - last >= speed) {
        revealed += 1;
        last = t;
      }
      if (revealed >= text.length) {
        el.textContent = text;
        return;
      }
      let out = text.slice(0, revealed);
      for (let i = revealed; i < text.length; i++) {
        const ch = text[i];
        out += ch === " " ? " " : CHARSET[Math.floor(Math.random() * CHARSET.length)];
      }
      el.textContent = out;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [text, speed]);

  return (
    <span
      className={cn("scramble", className)}
      onMouseEnter={play}
      onFocus={play}
      aria-label={text}
    >
      <span aria-hidden="true" ref={ref}>
        {text}
      </span>
    </span>
  );
}
