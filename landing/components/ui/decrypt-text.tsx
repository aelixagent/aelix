"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const CHARSET = "█▓▒░#@$%&<>/\\*+=01";

/**
 * DecryptText (ReactBits "DecryptedText", pixel edition) — renders the real
 * text on the server (SEO/no-JS safe), then scramble-reveals it left-to-right
 * the first time it scrolls into view. Reduced motion → text stays as-is.
 *
 *   <DecryptText text="AGENTIC AI TRADING RESEARCH DESK" />
 *   <DecryptText text="..." as="div" className="subtitle" speed={24} delay={200} />
 */
export function DecryptText({
  text,
  as: Tag = "span",
  className,
  speed = 22,
  delay = 0,
}: {
  text: string;
  as?: "span" | "div" | "p";
  className?: string;
  /** ms per reveal step */
  speed?: number;
  /** ms to wait after entering view */
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [display, setDisplay] = useState(text);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined"
    )
      return;

    let raf = 0;
    let timer: ReturnType<typeof setTimeout>;

    const run = () => {
      let revealed = 0;
      let last = 0;
      const tick = (t: number) => {
        if (!last) last = t;
        if (t - last >= speed) {
          revealed += Math.max(1, Math.round((t - last) / speed));
          last = t;
        }
        if (revealed >= text.length) {
          setDisplay(text);
          return;
        }
        let out = text.slice(0, revealed);
        for (let i = revealed; i < text.length; i++) {
          const ch = text[i];
          out += ch === " " || ch === "\n" ? ch : CHARSET[Math.floor(Math.random() * CHARSET.length)];
        }
        setDisplay(out);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (started.current || !entries.some((e) => e.isIntersecting)) return;
        started.current = true;
        io.disconnect();
        timer = setTimeout(run, delay);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [text, speed, delay]);

  return (
    <Tag ref={ref as React.Ref<never>} className={cn(className)} aria-label={text}>
      <span aria-hidden="true">{display}</span>
    </Tag>
  );
}
