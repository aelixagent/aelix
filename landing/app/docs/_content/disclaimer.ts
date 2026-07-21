import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Safety & Disclaimer",
  description:
    "The honest boundary of the project: beta, equities-only, not investment advice, no track record — and what is explicitly out of scope.",
  eyebrow: "17 — Safety & Disclaimer",
  blocks: [
    {
      type: "callout",
      tone: "danger",
      title: "Real money · beta · not financial advice",
      md: "Aelix is a research & recommendation tool, **not financial advice**. Robinhood Agentic Trading is in beta (US, equities only). The desk trades only inside an isolated Agentic account funded with a dedicated budget — **that budget is the most it can ever lose**. There is **no track record and no performance claim** here. All investment decisions are your own responsibility. Use only risk capital.",
    },
    {
      type: "heading",
      text: "No performance claims",
    },
    {
      type: "prose",
      md: "Every number, snapshot, example log, and backtest in this project is **illustrative/demo** unless you feed it real data. Nothing here represents historical performance. The [backtester](/docs/backtesting) checks whether rule logic is internally consistent — not whether a strategy is profitable — and feeding it real bars does not create a track record.",
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
        "Fund the Agentic account with a **small budget you can afford to lose** — that is your maximum downside.",
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
        { term: "Instrument scope", md: "Robinhood Agentic Trading is currently beta and equities-only — crypto/options/futures support is not available. The desk is intentionally limited to equities long-only; confirm current scope with Robinhood." },
        { term: "MCP tool names & behavior", md: "Verify the real tool names via `/mcp` or `claude mcp get robinhood-trading`, then tighten [`.claude/settings.json`](/docs/mcp) to match. Names can change during beta." },
        { term: "Legal", md: "Any feature beyond equities could fall under securities regulation and must pass legal review before it is even considered." },
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
      md: "Exploratory notes reference a `$AELIX` utility token, a \"Robinhood Chain\" L2, Alchemy RPC endpoints, wallets, and a Bankr launchpad. **None of this is part of the running system.** These are aspirational ideas from an early draft — unverified, unimplemented, and gated behind legal/securities review plus official confirmation of non-equities availability. There is **no blockchain, RPC, wallet, or token code** in this repo. Do not treat any of it as a product feature.",
    },
    {
      type: "prose",
      md: "Until legal review, a technical verification of any third-party network, and official confirmation of non-equities availability are all complete, Aelix's scope stays exactly what it is today: **equities-only, long-only, human-in-the-loop, Claude-Code-native.**",
    },
    {
      type: "heading",
      text: "Not affiliated",
    },
    {
      type: "prose",
      md: "Aelix is an independent, educational **reference architecture** built on Claude Code and the Robinhood Agentic beta. It is not endorsed by or affiliated with Robinhood or Anthropic. Licensed under MIT — see the `LICENSE` file.",
    },
    {
      type: "note",
      md: "Related reading: [Guardrails](/docs/guardrails), [Strategies & Risk](/docs/strategies), and the [FAQ](/docs/faq).",
    },
  ],
};
