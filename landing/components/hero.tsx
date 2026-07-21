"use client";

import { DecryptText } from "@/components/ui/decrypt-text";
import { GlitchText } from "@/components/ui/glitch-text";
import { Magnetic } from "@/components/ui/magnetic";
import { Typewriter } from "@/components/ui/typewriter";

/** Cinematic hero — serif wordmark, calm, matches the / homepage vibe.
 *  (The old ROBIN-DROIDS red eyes + pixel robot/hill were removed so /desk
 *  reads as the same brand as the cinematic landing.) */
export function Hero() {
  return (
    <section className="hero" id="top">
      <span className="hud tl" aria-hidden="true" />
      <span className="hud tr" aria-hidden="true" />
      <span className="hud bl" aria-hidden="true" />
      <span className="hud br" aria-hidden="true" />
      <span className="coords">VLR-011 // 07.26</span>
      <span className="coords right">DESK-04 // ONLINE</span>

      <div className="wrap hero-inner">
        <span className="tag">
          <span className="dot" /> VLR // DESK_01
        </span>
        <h1 className="title">
          <GlitchText text="AELIX" mode="always" />
          <span className="dot">.</span>
        </h1>
        <DecryptText
          as="div"
          className="subtitle"
          text="Agentic AI Trading Research Desk"
          delay={150}
        />
        <div className="lede" style={{ whiteSpace: "pre-line" }}>
          <Typewriter
            text={"THE DESK NEVER SLEEPS //\nTHE TRIGGER IS ALWAYS YOURS."}
            delay={500}
          />
        </div>
        <div className="hero-cta">
          <Magnetic>
            <a href="#access" className="btn btn-primary">
              Request Access ▸
            </a>
          </Magnetic>
          <Magnetic>
            <a href="#flow" className="btn btn-ghost">
              See The Desk
            </a>
          </Magnetic>
        </div>
        <div className="status">
          <span className="live" /> DESK STATUS / RESEARCH-ONLY · HUMAN-IN-THE-LOOP
        </div>
      </div>
    </section>
  );
}
