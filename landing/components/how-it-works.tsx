import { BorderScan } from "@/components/ui/border-scan";
import { Reveal } from "@/components/ui/reveal";
import { SquaresBg } from "@/components/ui/squares-bg";
import { STEPS } from "@/lib/data";

export function HowItWorks() {
  return (
    <section className="sec dark" id="flow">
      <SquaresBg tone="lime" />
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// 02 — HOW IT WORKS</span>
            <h2>
              Sense → research →<br />risk → you decide.
            </h2>
          </div>
          <p>
            Steps 1–6 are research and produce no order. The desk&rsquo;s standard output is the
            preview card at step&nbsp;7 — it stops there until you say go.
          </p>
        </div>
        <div className="flow">
          {STEPS.map((s, i) => {
            const isYou = "you" in s && s.you;
            return (
              <Reveal key={s.num} delay={i * 60} className={"step" + (isYou ? " you" : "")}>
                {isYou && <BorderScan color="#FF5B52" size={10} speed={90} />}
                <div className="num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
