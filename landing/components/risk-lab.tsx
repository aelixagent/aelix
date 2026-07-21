"use client";

import { useEffect, useRef, useState } from "react";
import { RISK } from "@/lib/data";

const GLITCH_CHARS = "█▓▒░<>/\\#%&@!";

/** Tracks prefers-reduced-motion; false during SSR/first paint (effects only layer on after mount). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Quick 4-step settle toward the target number (~140ms). Restarts from the current display on rapid input. */
function useSettledNumber(target: number, reduced: boolean): number {
  const [display, setDisplay] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    if (reduced) {
      shownRef.current = target;
      setDisplay(target);
      return;
    }
    const STEPS = 4;
    let step = 0;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now: number) {
      if (now - last >= 34) {
        last = now;
        step++;
        const v = step >= STEPS ? target : Math.round(from + ((target - from) * step) / STEPS);
        shownRef.current = v;
        setDisplay(v);
      }
      if (step < STEPS) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return display;
}

/** Interactive position-sizing demo — cross the per-trade cap and the Risk Manager vetoes. */
export function RiskLab() {
  const [equity, setEquity] = useState(10000);
  const [weight, setWeight] = useState(4);
  const reduced = usePrefersReducedMotion();

  const pos = Math.round((equity * weight) / 100);
  const over = weight > RISK.capPct;
  const fillPct = Math.min(100, (weight / RISK.maxWeight) * 100);
  const steppedPct = Math.round(fillPct / 2.5) * 2.5; // quantize meter to 2.5% notches
  const capLeft = (RISK.capPct / RISK.maxWeight) * 100;

  const displayPos = useSettledNumber(pos, reduced);
  const verdictText = over ? "⛔ VETO — EXCEEDS CAP" : "✓ APPROVE — WITHIN CAP";

  // 3-frame glitch/flash when the verdict flips OK <-> VETO.
  const [glitch, setGlitch] = useState<{ label: string; frame: number } | null>(null);
  const prevOver = useRef(over);
  useEffect(() => {
    if (prevOver.current === over) return;
    prevOver.current = over;
    if (reduced) return;
    const text = over ? "⛔ VETO — EXCEEDS CAP" : "✓ APPROVE — WITHIN CAP";
    const scramble = () =>
      text
        .split("")
        .map((c) => (c === " " || c === "—" ? c : GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]))
        .join("");
    let frame = 0;
    setGlitch({ label: scramble(), frame });
    const id = setInterval(() => {
      frame++;
      if (frame >= 3) {
        setGlitch(null);
        clearInterval(id);
      } else {
        setGlitch({ label: scramble(), frame });
      }
    }, 55);
    return () => clearInterval(id);
  }, [over, reduced]);

  const flashStyle =
    glitch && glitch.frame % 2 === 0
      ? { background: "var(--white)", color: "var(--ink)", borderColor: "var(--ink)" }
      : undefined;

  return (
    <section className="sec" id="risklab">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// RISK LAB · INTERACTIVE</span>
            <h2>
              Size a trade.<br />Watch the veto.
            </h2>
          </div>
          <p>
            The Risk Manager checks every proposal against a written per-trade cap of {RISK.capPct}%. Move the
            sliders — cross the cap and it vetoes.
          </p>
        </div>
        <div className="risklab">
          <div>
            <div className="ctrl">
              <label htmlFor="rl-eq">
                Account equity <b>${equity.toLocaleString()}</b>
              </label>
              <input
                id="rl-eq"
                type="range"
                min={RISK.minEquity}
                max={RISK.maxEquity}
                step={500}
                value={equity}
                onChange={(e) => setEquity(+e.target.value)}
              />
            </div>
            <div className="ctrl">
              <label htmlFor="rl-wt">
                Position weight <b>{weight}%</b>
              </label>
              <input
                id="rl-wt"
                type="range"
                min={1}
                max={RISK.maxWeight}
                step={1}
                value={weight}
                onChange={(e) => setWeight(+e.target.value)}
              />
            </div>
            <div className="risk-meter">
              <div
                className={"fill" + (over ? " over" : "")}
                style={{
                  width: steppedPct + "%",
                  transition: "width .18s steps(3, end), background .12s steps(2, end)",
                }}
              />
              <div className="cap" style={{ left: capLeft + "%" }} />
            </div>
            <p style={{ fontFamily: "var(--ff-pixel)", fontSize: 8, letterSpacing: 1, marginTop: 12, color: "var(--ink-soft)" }}>
              ▲ RED MARK = {RISK.capPct}% PER-TRADE CAP
            </p>
          </div>
          <div className="risk-out">
            <div className="lbl">Proposed position</div>
            <div className="big">
              <span className="sr-only">${pos.toLocaleString()}</span>
              <span aria-hidden="true">${displayPos.toLocaleString()}</span>
            </div>
            <div className={"risk-verdict " + (over ? "veto" : "ok")} style={flashStyle}>
              <span className="sr-only">{verdictText}</span>
              <span aria-hidden="true">{glitch ? glitch.label : verdictText}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
