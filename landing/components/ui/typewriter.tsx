"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Typewriter — types text character by character (with the theme's blinking
 * block caret) the first time it enters the viewport. Server-renders the full
 * text for SEO/no-JS; reduced motion keeps it static.
 *
 *   <Typewriter text="THE DESK NEVER SLEEPS //" />
 *   <Typewriter text="..." speed={34} delay={300} caret={false} as="div" />
 */
export function Typewriter({
  text,
  as: Tag = "span" as const,
  className,
  speed = 30,
  delay = 0,
  caret = true,
}: {
  text: string;
  as?: "span" | "div" | "p";
  className?: string;
  speed?: number;
  delay?: number;
  caret?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(text.length);
  const [active, setActive] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined"
    )
      return;

    let timer: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;
    const io = new IntersectionObserver(
      (entries) => {
        if (started.current || !entries.some((e) => e.isIntersecting)) return;
        started.current = true;
        io.disconnect();
        timer = setTimeout(() => {
          setShown(0);
          setActive(true);
          let i = 0;
          interval = setInterval(() => {
            i += 1;
            setShown(i);
            if (i >= text.length) {
              clearInterval(interval);
              setActive(false);
            }
          }, speed);
        }, delay);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [text, speed, delay]);

  return (
    <Tag ref={ref as React.Ref<never>} className={cn(className)} aria-label={text}>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        {caret && active && <span className="caret" />}
      </span>
    </Tag>
  );
}
