"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { setLenis } from "@/lib/lenis-store";

/**
 * Site-wide Lenis smooth scrolling. Renders nothing — mount once in the root
 * layout. Skipped entirely for prefers-reduced-motion (native scroll stays).
 * `anchors: true` takes over the header/footer # links so jumps glide too.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      autoRaf: true,
      anchors: { offset: -84 }, // keep jumped-to sections clear of the sticky header
      lerp: 0.115,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });
    setLenis(lenis);

    return () => {
      setLenis(null);
      lenis.destroy();
    };
  }, []);

  return null;
}
