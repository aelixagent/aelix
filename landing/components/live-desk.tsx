"use client";

import { useEffect, useRef, useState } from "react";
import { Candles } from "@/components/candles";
import { BorderScan } from "@/components/ui/border-scan";
import { DESK_RUN, type TermTag } from "@/lib/data";

type Line = { tag: string; cls: TermTag | "you"; text: string };
type Phase = "idle" | "running" | "await" | "done";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function LiveDesk() {
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [toast, setToast] = useState<string | null>(null);
  const [px, setPx] = useState(158);
  const [chg, setChg] = useState(0);
  const runId = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const reduced = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function run() {
    started.current = true;
    const id = ++runId.current;
    setToast(null);
    setPhase("running");
    setLines([]);
    const push = (l: Line) => setLines((p) => [...p, l]);
    const setLast = (text: string) =>
      setLines((p) => {
        const c = [...p];
        if (c.length) c[c.length - 1] = { ...c[c.length - 1], text };
        return c;
      });

    if (reduced()) {
      setLines(DESK_RUN.map((s) => ({ tag: s.tag, cls: s.cls, text: s.text })));
      setPhase("await");
      return;
    }

    await sleep(250);
    if (id !== runId.current) return;
    for (const s of DESK_RUN) {
      if (id !== runId.current) return;
      push({ tag: s.tag, cls: s.cls, text: "" });
      for (let i = 1; i <= s.text.length; i++) {
        if (id !== runId.current) return;
        setLast(s.text.slice(0, i));
        await sleep(9);
      }
      await sleep(s.pause ?? 300);
    }
    if (id !== runId.current) return;
    setPhase("await");
  }

  function decide(ok: boolean) {
    setLines((p) => [
      ...p,
      {
        tag: "YOU",
        cls: "you",
        text: ok
          ? "approved — but this is a demo. Real orders are placed only in the live Claude Code session."
          : "rejected — desk stands aside. No order placed.",
      },
    ]);
    setPhase("done");
    setToast(ok ? "DEMO ONLY · REAL APPROVAL HAPPENS IN-SESSION" : "REJECTED · DESK STANDS ASIDE");
  }

  // auto-run once when the section scrolls into view
  useEffect(() => {
    const el = bodyRef.current?.closest("section");
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!started.current && entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const b = bodyRef.current;
    if (b) b.scrollTop = b.scrollHeight;
  }, [lines]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  const running = phase === "running";

  return (
    <section className="sec dark" id="live">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// LIVE · DEMO</span>
            <h2>
              Watch the desk<br />run one idea.
            </h2>
          </div>
          <p>
            A simulated desk run — sense, three analysts, a risk veto, a preview. It always stops at your
            approval. This demo places nothing.
          </p>
        </div>

        <div className="livedesk">
          {/* terminal */}
          <div className="term" style={{ position: "relative" }}>
            <BorderScan color="#FF5B52" size={10} speed={90} />
            <div className="term-bar">
              <span className="term-dot" />
              <span className="term-dot" style={{ background: "var(--warn)" }} />
              <span className="term-dot" style={{ background: "var(--green)" }} />
              <span className="grow">aelix@desk — run</span>
            </div>
            <div className="term-body" ref={bodyRef} data-lenis-prevent>
              {phase === "idle" && lines.length === 0 && (
                <div className="term-line">
                  <span className="tg cmd">$</span>press RUN DESK to begin
                  <span className="caret" />
                </div>
              )}
              {lines.map((l, i) => (
                <div className={"term-line" + (l.cls === "you" ? " you" : "")} key={i}>
                  <span className={"tg " + l.cls}>
                    {l.cls === "you" ? "[YOU]" : l.tag === "$" ? "$" : "[" + l.tag + "]"}
                  </span>
                  {l.text}
                  {running && i === lines.length - 1 && <span className="caret" />}
                </div>
              ))}
            </div>
            <div className="term-actions">
              <button className="btn-mini" onClick={run} disabled={running}>
                {phase === "idle" ? "Run Desk ▸" : "Re-run ▸"}
              </button>
              {phase === "await" && (
                <>
                  <button className="btn-mini" onClick={() => decide(true)}>
                    Approve
                  </button>
                  <button className="btn-mini danger" onClick={() => decide(false)}>
                    Reject
                  </button>
                  <span style={{ fontFamily: "var(--ff-pixel)", fontSize: 9, color: "var(--warn)", letterSpacing: 1 }}>
                    ⏸ AWAITING YOU
                  </span>
                </>
              )}
            </div>
          </div>

          {/* chart */}
          <div className="chart-card">
            <div className="chart-head">
              <span className="term-dot" />
              <span className="sym">NVDA · 1D</span>
              <span className="px">${px.toFixed(2)}</span>
              <span className={"chg " + (chg >= 0 ? "up" : "down")}>
                {chg >= 0 ? "▲ +" : "▼ "}
                {chg.toFixed(2)}%
              </span>
            </div>
            <div className="chart-wrap">
              <Candles
                onTick={(p, c) => {
                  setPx(p);
                  setChg(c);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="toast show">{toast}</div>}
    </section>
  );
}
