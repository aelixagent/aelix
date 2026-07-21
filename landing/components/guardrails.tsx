import { GlitchText } from "@/components/ui/glitch-text";
import { Reveal } from "@/components/ui/reveal";
import { SquaresBg } from "@/components/ui/squares-bg";
import { GUARDS } from "@/lib/data";

export function Guardrails() {
  return (
    <section className="sec dark" id="safety">
      <SquaresBg tone="lime" />
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// SAFETY POSTURE</span>
            <h2>
              Guardrails are structural,<br />not vibes.
            </h2>
          </div>
          <p>Read this before funding. The isolated Agentic budget is the most the desk can ever touch.</p>
        </div>
        <div className="guards">
          {GUARDS.map((g, i) => (
            <Reveal key={g.title} delay={i * 50} className="guard">
              <h3>
                <span className="b" /> <GlitchText text={g.title} mode="hover" />
              </h3>
              <p>{g.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
