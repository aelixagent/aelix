import { Reveal } from "@/components/ui/reveal";
import { DecryptText } from "@/components/ui/decrypt-text";
import { RoadmapProgress } from "@/components/fx/roadmap-progress";
import { ROADMAP } from "@/lib/data";

export function Roadmap() {
  return (
    <section className="sec" id="roadmap">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <DecryptText text="// ROADMAP" as="span" className="eyebrow" />
            <h2>
              From guardrails<br />to mainnet.
            </h2>
          </div>
          <p>
            Built in phases. Every desk trading feature ships behind human approval first,
            paper-trading second. The on-chain module is deployed on Robinhood Chain
            mainnet and its ownership sits with a 2-of-3 Safe multisig — with no timelock
            yet — while third-party audit, explorer verification and legal review are
            still open.
          </p>
        </div>
        <div className="road" style={{ position: "relative" }}>
          <RoadmapProgress />
          {ROADMAP.map((p, i) => {
            const onchain = "onchain" in p && p.onchain;
            const done = p.status === "done";
            return (
              <Reveal key={p.phase} delay={i * 70} className={"phase" + (onchain ? " exp" : "")}>
                <div className="ph">{p.phase}</div>
                <h3>
                  {p.title}
                  {done ? (
                    <span className="badge">DONE</span>
                  ) : (
                    <span className="badge" style={{ color: "var(--ink-2)", borderColor: "var(--hair-hi)" }}>
                      PENDING
                    </span>
                  )}
                  {onchain && <span className="badge">MAINNET · UNAUDITED</span>}
                </h3>
                <p>{p.body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
