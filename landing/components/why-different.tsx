import { Reveal } from "@/components/ui/reveal";
import { GlitchText } from "@/components/ui/glitch-text";
import { CheckPixel, CrossPixel } from "@/components/ui/pixel-art";
import { COMPARE } from "@/lib/data";

export function WhyDifferent() {
  return (
    <section className="sec" id="why">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// WHY DIFFERENT</span>
            <h2>
              Two ways to let<br />an AI near your money.
            </h2>
          </div>
          <p>One hands the keys to a black box. The other keeps you in the chair and makes the machine prove its case first.</p>
        </div>
        <Reveal className="compare">
          <div className="col bad">
            <div className="ch">
              <CrossPixel /> <GlitchText text={COMPARE.bad.head} mode="hover" />
            </div>
            {COMPARE.bad.rows.map((r, i) => (
              <Reveal className="crow hover:bg-[rgba(226,59,59,.08)]" delay={i * 40} key={r}>
                <CrossPixel />
                {r}
              </Reveal>
            ))}
          </div>
          <div className="col good">
            <div className="ch">
              <CheckPixel /> <GlitchText text={COMPARE.good.head} mode="hover" />
            </div>
            {COMPARE.good.rows.map((r, i) => (
              <Reveal className="crow hover:bg-[rgba(22,24,13,.05)]" delay={i * 40} key={r}>
                <CheckPixel />
                {r}
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
