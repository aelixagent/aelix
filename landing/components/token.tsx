import { Reveal } from "@/components/ui/reveal";
import { GlitchText } from "@/components/ui/glitch-text";
import { BorderScan } from "@/components/ui/border-scan";
import { TokenCoin } from "@/components/fx/token-coin";

export function Token() {
  return (
    <section className="sec dark" id="token">
      <div className="wrap">
        <span className="eyebrow">// WEB3 · EXPERIMENTAL</span>
        <Reveal className="token-box">
          <div>
            <h3>
              <GlitchText text="$AELIX, a roadmap experiment" mode="hover" />
            </h3>
            <p>
              A planned utility token on Robinhood Chain (chainId 4663) for premium research access,
              governance over risk parameters, and fee discounts. The vault and guardrail contracts
              are deployed on mainnet; the token is not. No sale, no price, no listing.
            </p>
            <p>
              It is a Web3 experiment, not a fundraising or investment vehicle. Launchpad terms and
              legal status remain unverified open items pending review.
            </p>
          </div>
          <div style={{ display: "grid", gap: "20px" }}>
            <TokenCoin />
            <div className="warn-note" style={{ position: "relative" }}>
              <BorderScan color="#FF5B52" size={10} speed={90} />
              ⚠ NOT A SECURITY OFFERING.
              <br />
              NOT INVESTMENT ADVICE.
              <br />
              TOKEN UNLAUNCHED · SUBJECT TO REVIEW.
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
