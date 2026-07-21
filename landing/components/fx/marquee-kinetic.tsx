"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useScrollVelocity } from "@/lib/lenis-store";

const SKEW_STEP = 0.5; // deg — quantized lean increments
const SKEW_MAX = 6; // deg — hard clamp
const SKEW_GAIN = 0.18; // scroll velocity → degrees
const RATE_STEP = 0.25; // playbackRate quantum
const RATE_MAX = 2.5; // never more than 2.5× loop speed
const RATE_GAIN = 0.035; // |velocity| → extra playback rate

/**
 * Client shell around the server-rendered marquee tracks. Leans the loop with
 * scroll velocity (skew snapped to 0.5° steps, clamped ±6°) and nudges the CSS
 * loop's playbackRate in 0.25× steps; both decay back when scrolling stops.
 * The skew lives on a wrapper div because the keyframe animation owns
 * `transform` on `.marquee-loop` itself. No re-renders — styles are mutated
 * through refs inside a rAF loop. Skipped entirely under reduced motion.
 */
export function MarqueeKinetic({
  reverse = false,
  children,
}: {
  reverse?: boolean;
  children: ReactNode;
}) {
  const vel = useScrollVelocity();
  const skewRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let anim: Animation | null | undefined; // undefined → not located yet
    let tries = 0;
    let skew = 0;
    let lastSkew = 0;
    let rate = 1;
    let lastRate = 1;
    const dir = reverse ? -1 : 1;

    const findAnim = (): Animation | null => {
      if (anim !== undefined) return anim;
      const found = loopRef.current
        ?.getAnimations()
        .find(
          (a): a is CSSAnimation =>
            a instanceof CSSAnimation && a.animationName.startsWith("marquee")
        );
      if (found) anim = found;
      else if (++tries > 120) anim = null; // give up quietly, skew still works
      return anim ?? null;
    };

    const reset = () => {
      skew = lastSkew = 0;
      rate = lastRate = 1;
      if (skewRef.current) skewRef.current.style.transform = "";
      if (anim) anim.playbackRate = 1;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = vel.current;

      // lean: velocity → skew, eased toward target, snapped to 0.5° steps
      const skewTarget =
        Math.max(-SKEW_MAX, Math.min(SKEW_MAX, v * SKEW_GAIN)) * dir;
      skew += (skewTarget - skew) * 0.14;
      const snappedSkew = Math.round(skew / SKEW_STEP) * SKEW_STEP;
      if (snappedSkew !== lastSkew && skewRef.current) {
        lastSkew = snappedSkew;
        skewRef.current.style.transform =
          snappedSkew === 0 ? "" : `skewX(${snappedSkew}deg)`;
      }

      // hustle: faster scroll → faster loop, snapped to 0.25× steps
      const rateTarget = Math.min(RATE_MAX, 1 + Math.abs(v) * RATE_GAIN);
      rate += (rateTarget - rate) * 0.08;
      const snappedRate = Math.round(rate / RATE_STEP) * RATE_STEP;
      if (snappedRate !== lastRate) {
        const a = findAnim();
        if (a) {
          lastRate = snappedRate;
          a.playbackRate = snappedRate;
        }
      }
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      reset();
    };

    if (!mq.matches) start();
    const onChange = () => (mq.matches ? stop() : start());
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      cancelAnimationFrame(raf);
      reset();
    };
  }, [reverse, vel]);

  return (
    <div ref={skewRef} style={{ display: "inline-flex", willChange: "transform" }}>
      <div className="marquee-loop" ref={loopRef}>
        {children}
      </div>
    </div>
  );
}
