"use client";

import { useEffect, useRef, useState } from "react";
import { STATS } from "@/lib/data";
import { BorderScan } from "@/components/ui/border-scan";
import { DecryptText } from "@/components/ui/decrypt-text";

const GLYPHS = "▓▒░█#01<>*+";

/** Fixed-width cell so flicker glyphs never jitter the layout (digits are tabular-nums = 1ch). */
const cellStyle: React.CSSProperties = {
  display: "inline-block",
  width: "1ch",
  textAlign: "center",
  overflow: "clip",
};

/**
 * Pixel slot-flicker counter: the real final value is server-rendered, then on
 * first scroll into view each character locks in left-to-right while unsettled
 * positions flicker through block glyphs (quantized to ~45ms steps).
 * Reduced motion → stays on the final value.
 */
function CountUp({ to, suffix }: { to: number; suffix: string }) {
  const final = `${to}${suffix}`;
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  // null = settled (final value shown); otherwise locked prefix length + flicker tail
  const [anim, setAnim] = useState<{ locked: number; tail: string } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion: final value is already rendered — do nothing.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (done.current || !entries.some((e) => e.isIntersecting)) return;
        done.current = true;
        io.disconnect();
        const dur = 1000;
        const step = 45; // flicker quantization — stepped, not smooth
        let start = 0;
        let lastFlick = -1;
        const tick = (t: number) => {
          if (!start) start = t;
          const p = Math.min(1, (t - start) / dur);
          if (p >= 1) {
            setAnim(null); // lock to the exact final value + suffix
            return;
          }
          const locked = Math.floor(p * final.length);
          const flick = Math.floor((t - start) / step);
          if (flick !== lastFlick) {
            lastFlick = flick;
            let tail = "";
            for (let i = locked; i < final.length; i++) {
              tail += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            }
            setAnim({ locked, tail });
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [final]);

  return (
    <div className="v" ref={ref} aria-label={final}>
      {anim === null ? (
        <span aria-hidden="true">{final}</span>
      ) : (
        <span aria-hidden="true">
          {final.slice(0, anim.locked)}
          {anim.tail.split("").map((g, i) => (
            <span key={i} style={cellStyle}>
              {g}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export function StatsStrip() {
  return (
    <section className="sec" id="desk">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// 01 — THE DESK</span>
            <h2>
              <DecryptText text="Not a bot that" as="span" />
              <br />
              <DecryptText text="YOLOs your money." as="span" delay={150} />
            </h2>
          </div>
          <p>
            Aelix is a small team of specialist AI analysts that screen your watchlist, debate every
            candidate, and hand you a one-click preview. You approve. It places. Never the other way around.
          </p>
        </div>
        <div className="stats" style={{ position: "relative" }}>
          <BorderScan color="#FF5B52" size={10} speed={90} />
          {STATS.map((s) => (
            <div className="stat" key={s.label}>
              <CountUp to={s.value} suffix={s.suffix} />
              <div className="l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
