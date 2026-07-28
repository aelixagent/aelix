import { AelixLogo } from "@/components/ui/aelix-logo";
import { SquaresBg } from "@/components/ui/squares-bg";
import { Magnetic } from "@/components/ui/magnetic";
import { ScrambleHover } from "@/components/ui/scramble-hover";
import { GITHUB_URL, REQUEST_ACCESS_URL } from "@/lib/links";

const FOOT_LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: "REQUEST ACCESS", href: REQUEST_ACCESS_URL },
  { label: "THE DESK", href: REQUEST_ACCESS_URL },
  { label: "HOW IT WORKS", href: "#flow" },
  { label: "THE TEAM", href: "#team" },
  { label: "GUARDRAILS", href: "#safety" },
  { label: "DOCS", href: "/docs" },
  { label: "GITHUB", href: GITHUB_URL, external: true },
];

export function CtaFooter() {
  return (
    <>
      <section className="sec dark cta-band" id="access" style={{ borderBottom: "3px solid var(--ink)" }}>
        <SquaresBg tone="lime" />
        <div className="wrap">
          <span className="eyebrow">// 04, ACCESS</span>
          <h2>Request access.</h2>
          <p>
            Join the gated desk beta or the wallet pre-order list. The desk researches
            your watchlist and stops at a preview; you decide whether it ever becomes an order.
          </p>
          <Magnetic>
            <a href={REQUEST_ACCESS_URL} className="btn btn-lime">
              <ScrambleHover text="Request Access" /> ▸
            </a>
          </Magnetic>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-top">
            <a href="#top" className="brand">
              <AelixLogo />
              AELIX
            </a>
            <div className="foot-links">
              {FOOT_LINKS.map((l) => (
                <a key={`${l.label}-${l.href}`} href={l.href} {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}>
                  <ScrambleHover text={l.label} />
                </a>
              ))}
            </div>
          </div>
          <div className="foot-status">
            <span className="fs">
              <span className="d" /> DESK · RESEARCH-ONLY
            </span>
            <span className="fs">
              <span className="d" /> GUARDRAILS · ARMED
            </span>
            <span className="fs">
              <span className="d" style={{ background: "var(--warn)" }} /> MODE · BETA
            </span>
            <span className="fs">
              <span className="d" style={{ background: "var(--red)" }} /> ORDERS · HUMAN-APPROVED
            </span>
          </div>
          <div className="disclaimer">
            <strong>⚠ DISCLAIMER</strong>
            Aelix is a research &amp; recommendation tool, <b>not financial advice</b>. Robinhood Agentic
            Trading is in beta (US, equities only). The desk trades only inside an isolated Agentic account
            funded with a dedicated budget, that budget is the most it can ever lose. There is no track
            record and no performance claim here. All investment decisions are your own responsibility. Use
            only risk capital.
          </div>
          <div className="copy">© 2026 AELIX // BUILT ON CLAUDE CODE · ROBINHOOD AGENTIC · REFERENCE ARCHITECTURE</div>
        </div>
      </footer>
    </>
  );
}
