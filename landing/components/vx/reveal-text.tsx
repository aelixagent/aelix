"use client";

import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";

// let `style` carry CSS custom properties (--i, --step) used by the reveals
declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}

/**
 * Blur-in reveal primitives for the cinematic route. When the element scrolls
 * into view we add `.in`; the CSS in vx.css does the blur→sharp, translate-up,
 * fade. Children stagger via a `--i` custom property. Section content is
 * additionally gated by the scroll choreography adding `.vx-live` to the
 * pinned wrapper, so the animation plays when the act is actually on screen.
 * Progressive enhancement: no IntersectionObserver → reveal immediately.
 */
function useReveal<T extends HTMLElement>(once = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("in");
            if (once) io.disconnect();
          } else if (!once) {
            el.classList.remove("in");
          }
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);
  return ref;
}

/** Single block that blurs in when it enters view. */
export function Reveal({
  children,
  className = "",
  as: Tag = "div",
  i = 0,
  style,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "span" | "p" | "h1" | "h2" | "h3";
  i?: number;
  style?: CSSProperties;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={`vx-reveal ${className}`}
      style={{ "--i": i, ...style }}
    >
      {children}
    </Tag>
  );
}

/** Multi-line paragraph; each line masks + blurs in, staggered. */
export function RevealLines({
  lines,
  className = "",
  as: Tag = "p",
  step = 110,
}: {
  lines: string[];
  className?: string;
  as?: "p" | "div" | "h2" | "h3";
  step?: number;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <Tag ref={ref as React.Ref<never>} className={`vx-r-group ${className}`} style={{ "--step": `${step}ms` }}>
      {lines.map((line, i) => (
        <span className="vx-line" key={i}>
          <span className="vx-reveal" style={{ "--i": i }}>
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}

/** Headline split into characters that blur in one after another.
 *  Chars are grouped per word (nowrap) so lines only break at spaces. */
export function RevealChars({
  text,
  className = "",
  as: Tag = "h2",
  step = 34,
}: {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "span";
  step?: number;
}) {
  const ref = useReveal<HTMLElement>();
  const words = text.split(" ");
  let ci = 0;
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={`vx-r-group vx-chars ${className}`}
      style={{ "--step": `${step}ms` }}
      aria-label={text}
    >
      {words.map((word, wi) => (
        <span key={wi} aria-hidden="true">
          <span className="vx-word">
            {[...word].map((ch) => {
              const i = ci++;
              return (
                <span className="vx-reveal" style={{ "--i": i }} key={i}>
                  {ch}
                </span>
              );
            })}
          </span>
          {wi < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}
