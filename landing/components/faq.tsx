"use client";

import { useEffect, useRef, useState } from "react";
import { FAQ } from "@/lib/data";
import { GlitchText } from "@/components/ui/glitch-text";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  // Measured natural heights of each answer, filled in after mount.
  // Until then the CSS fallback (.faq-item.open .faq-a max-height cap) applies,
  // so server HTML still shows the initially-open answer.
  const [heights, setHeights] = useState<number[] | null>(null);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const measure = () => {
      setHeights(innerRefs.current.map((el) => (el ? el.offsetHeight : 0)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    innerRefs.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, []);

  return (
    <section className="sec" id="faq">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// FAQ</span>
            <h2>
              <GlitchText text="Straight answers." mode="hover" />
            </h2>
          </div>
          <p>The important ones, up front — scope, safety, and what this is not.</p>
        </div>
        <div className="faq">
          {FAQ.map((f, i) => {
            const isOpen = open === i;
            return (
              <div className={"faq-item" + (isOpen ? " open" : "")} key={f.q}>
                <button
                  className="faq-q"
                  id={`faq-q-${i}`}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span>{f.q}</span>
                  <span
                    className="pm"
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      transform: `rotate(${isOpen ? 180 : 0}deg)`,
                      transition: "transform .22s steps(3, end)",
                    }}
                  >
                    {isOpen ? "–" : "+"}
                  </span>
                </button>
                <div
                  className="faq-a"
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  aria-hidden={!isOpen}
                  style={
                    heights
                      ? {
                          // Inline style outranks the fixed 460px cap in globals.css,
                          // so open/close animates to the exact measured height.
                          maxHeight: isOpen ? (heights[i] ?? 460) : 0,
                          transition: "max-height .3s steps(8, end)",
                        }
                      : undefined
                  }
                >
                  <div
                    className="inner"
                    ref={(el) => {
                      innerRefs.current[i] = el;
                    }}
                  >
                    {f.a}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
