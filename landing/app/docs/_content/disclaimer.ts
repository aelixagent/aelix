import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Safety & Disclaimer",
  description:
    "The honest boundary of the project: beta, equities-only, not investment advice, no track record, an on-chain module that is on mainnet but unaudited, and what is explicitly out of scope.",
  eyebrow: "17, Safety & Disclaimer",
  blocks: [
    {
      type: "callout",
      tone: "danger",
      title: "Real money · beta · not financial advice",
      md: "Aelix is a research & recommendation tool, **not financial advice**. Robinhood Agentic Trading is in beta (US, equities only). The desk trades only inside an isolated Agentic account funded with a dedicated budget, **that budget is the most it can ever lose**. There is **no track record and no performance claim** here. All investment decisions are your own responsibility. Use only risk capital.\n\nThe separate on-chain module is now deployed to Robinhood Chain mainnet: **mainnet, unaudited, deposits capped, zero assets held.** It is not connected to customer money and not part of the desk. Details below.",
    },
    {
      type: "heading",
      text: "No performance claims",
    },
    {
      type: "prose",
      md: "Every number, snapshot, example log, and backtest in this project is **illustrative/demo** unless you feed it real data. Nothing here represents historical performance. The [backtester](/docs/backtesting) checks whether rule logic is internally consistent, not whether a strategy is profitable, and feeding it real bars does not create a track record. On-chain figures are either a **real read or honestly empty**, and today they read **zero**: no TVL, no depositors, no trades.",
    },
    {
      type: "heading",
      text: "Scope",
    },
    {
      type: "prose",
      md: "Aelix is deliberately narrow: **equities-only, long-only, USD, human-in-the-loop, Claude-Code-native.** Options, futures, and crypto are not supported by the underlying beta, and the desk is configured to refuse them (option order tools are `deny`-ed).",
    },
    {
      type: "pills",
      items: ["Equities only", "Long only", "USD", "Human-in-the-loop", "Beta", "Educational"],
    },
    {
      type: "heading",
      text: "Your responsibilities",
    },
    {
      type: "list",
      items: [
        "Fund the Agentic account with a **small budget you can afford to lose**, that is your maximum downside.",
        "Define your risk caps in [`strategies/`](/docs/strategies) **before** trading; the Risk Manager VETOes if they are unset.",
        "**Monitor it yourself.** You own the guardrails and the limits; the agent will not change them.",
        "Keep the repo private, and never commit secrets or the OAuth token. See [Configuration](/docs/configuration).",
        "Verify anything the desk surfaces before acting on it. It is a second opinion, not a decision-maker.",
      ],
    },
    {
      type: "heading",
      text: "Open verification items",
    },
    {
      type: "prose",
      md: "Some assumptions still need confirmation against official sources before you rely on them:",
    },
    {
      type: "deflist",
      items: [
        { term: "Instrument scope", md: "Robinhood Agentic Trading is currently beta and equities-only, crypto/options/futures support is not available. The desk is intentionally limited to equities long-only; confirm current scope with Robinhood." },
        { term: "MCP tool names & behavior", md: "Verify the real tool names via `/mcp` or `claude mcp get robinhood-trading`, then tighten [`.claude/settings.json`](/docs/mcp) to match. Names can change during beta." },
        { term: "Legal", md: "Any feature beyond equities could fall under securities regulation and must pass legal review before it is even considered. **No legal review has been completed**, and deploying a contract does not resolve regulatory exposure, including the US-person question." },
        { term: "Third-party audit (on-chain module)", md: "**Not done.** Two internal audit passes and a 42-agent preflight review are **not** an audit. Nothing on chain should be relied on until an independent audit exists." },
        { term: "Explorer verification", md: "The mainnet contracts are **not yet verified** on the block explorer, so you cannot yet read the deployed source there. Verify addresses against `onchain/deployments/latest.json` and by direct call." },
        { term: "Ownership handover", md: "Incomplete. Three of the deployed contracts are still owned by the deployer EOA, with the Safe only as `pendingOwner()`. See [Architecture](/docs/architecture#the-separate-on-chain-module) for the per-contract state." },
      ],
    },
    {
      type: "heading",
      text: "Out of scope: crypto / token material",
    },
    {
      type: "callout",
      tone: "warn",
      title: "Not implemented, not verified, not a product",
      md: "Exploratory notes reference a `$AELIX` utility token, Alchemy RPC endpoints, wallets, and a Bankr launchpad, **none of these are built**, and none are part of the running equities desk. The token remains **unlaunched and speculative**: no sale, no price, no allocation, **not an investment**. Crypto trading is not supported by the underlying Robinhood beta and stays out of scope pending legal/securities review plus official confirmation of non-equities availability.",
    },
    {
      type: "heading",
      text: "The on-chain module: on mainnet, and unaudited",
    },
    {
      type: "prose",
      md: "One correction to what this page used to say. The on-chain vault + guardrails-as-code module in `onchain/` is **no longer testnet-only**: as of **2026-07-26 it is deployed to Robinhood Chain mainnet, chainId 4663**, against real periphery. This page previously claimed the opposite, that claim was out of date and has been corrected rather than quietly softened, and every caveat around it stands.",
    },
    {
      type: "prose",
      md: "What that deploy does **not** change is more important than what it does. Every item below is current:",
    },
    {
      type: "list",
      items: [
        "**No third-party audit.** Two internal audit passes and a 42-agent preflight review are **not** an audit. This is the single largest caveat on the module.",
        "**The ownership handover is incomplete.** `GuardrailConfig` and `UniswapSwapAdapter` are owned by the 2-of-3 Safe. `RWAVault`, `ChainlinkOracleAdapter`, and `SessionKeyExecutor` are **still owned by the deployer EOA**, with the Safe only as `pendingOwner()`, they are `Ownable2Step` and the Safe must call `acceptOwnership()` on each. Until then **a single hot key controls those three.**",
        "**No track record, no returns, no performance.** TVL is 0, there are no depositors, and no trade has been made. Any figure shown anywhere is a real on-chain read, honestly empty, or explicitly labelled sample.",
        "**Deposits are capped** at 10,000 USDG, and the contracts are **not yet verified on the block explorer**.",
        "**There is no Chainlink sequencer uptime feed on Robinhood Chain.** Aelix substitutes a chain-liveness quorum built from 24/7 crypto feeds. It is **coarse by design**, it catches multi-hour outages, not minute-scale ones, and it is **not equivalent** to a real uptime feed. See [Architecture](/docs/architecture#the-separate-on-chain-module).",
        "**Legal and securities review is still pending**, including the US-person question. Deploying a contract does not resolve regulatory exposure.",
        "**It is not a live product feature for customer money.** The vault holds none, it is not connected to your Robinhood account, and it is not part of the desk's trading path.",
        "**The equities desk is unchanged.** It still requires your explicit in-session approval for every order. The mainnet deploy does **not** make the desk autonomous.",
      ],
    },
    {
      type: "prose",
      md: "So the **desk's** scope stays exactly what it is today: **equities-only, long-only, human-in-the-loop, Claude-Code-native.** Until legal review, a third-party audit, the completed ownership handover, a technical verification of any third-party network, and official confirmation of non-equities availability are **all** complete, the on-chain module stays a **direction**, deployed but unaudited code, not a product you can rely on.",
    },
    {
      type: "heading",
      text: "Not affiliated",
    },
    {
      type: "prose",
      md: "Aelix is an independent, educational **reference architecture** built on Claude Code and the Robinhood Agentic beta. It is not endorsed by or affiliated with Robinhood or Anthropic. Licensed under MIT, see the `LICENSE` file.",
    },
    {
      type: "note",
      md: "Related reading: [Guardrails](/docs/guardrails), [Strategies & Risk](/docs/strategies), and the [FAQ](/docs/faq).",
    },
  ],
};
