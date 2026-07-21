"use client";

import { useEffect, useState } from "react";
import { DecryptText } from "@/components/ui/decrypt-text";
import { GlitchText } from "@/components/ui/glitch-text";

/** Pixel boot sequence that slides away after ~1.6s. Skippable; instant under reduced-motion. */
export function BootOverlay() {
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGone(true);
      return;
    }
    const t1 = setTimeout(() => setDone(true), 1650);
    const t2 = setTimeout(() => setGone(true), 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  function skip() {
    setDone(true);
    setTimeout(() => setGone(true), 450);
  }

  if (gone) return null;

  return (
    <div className={"boot" + (done ? " done" : "")} aria-hidden="true">
      <div className="boot-logo">
        {/* glitch-burst fires at 88% of its 3.6s cycle; the negative delay
            shifts that burst to ~1.42s wall-clock — right as the boot bar
            fills and just before the overlay lifts at 1.65s. */}
        <GlitchText
          text="AELIX"
          mode="always"
          className="[&::before]:[animation-delay:-1.75s] [&::after]:[animation-delay:-1.75s]"
        />
        <span className="dot">.</span>
      </div>
      <div className="boot-bar">
        <div className="boot-fill" />
      </div>
      <div className="boot-label">
        <DecryptText text="BOOTING DESK" speed={26} />
        <span className="bk">_</span>{" "}
        <DecryptText text="AGENTS · GUARDRAILS · MCP" speed={16} delay={320} />
      </div>
      <button className="boot-skip" onClick={skip}>
        [ CLICK TO SKIP ]
      </button>
    </div>
  );
}
