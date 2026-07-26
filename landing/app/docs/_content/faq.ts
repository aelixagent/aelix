import type { DocContent } from "./types";

export const content: DocContent = {
  title: "FAQ",
  description:
    "Straight answers to the questions that matter first, scope, safety, cost of failure, and what Aelix is not.",
  eyebrow: "15, FAQ",
  blocks: [
    {
      type: "prose",
      md: "The important ones, up front. If your question is about setup, start with [Quickstart](/docs/quickstart); about safety, with [Guardrails](/docs/guardrails).",
    },
    {
      type: "heading",
      text: "Can Aelix place trades on its own?",
    },
    {
      type: "prose",
      md: "**No.** Every order requires your explicit in-session approval. The analysts have no order tools at all; only the Portfolio Manager can place, and only after you say yes to a preview card. No order is ever placed on a schedule or on its own, even the dashboard's [Run desk](/docs/dashboard) button triggers only a read-only run that stops at the preview.",
    },
    {
      type: "heading",
      text: "Which markets can it trade?",
    },
    {
      type: "prose",
      md: "**US equities only**, long-only, in USD, inside an isolated Robinhood Agentic account (beta). Options, futures, and crypto are out of scope of the underlying beta, the option order tools are explicitly `deny`-ed in [`.claude/settings.json`](/docs/mcp).",
    },
    {
      type: "heading",
      text: "How much can it lose?",
    },
    {
      type: "prose",
      md: "At most the **dedicated budget you fund the isolated Agentic account with**. The desk can only trade that account, it cannot reach your main Robinhood balance. Fund it with money you can afford to lose, and treat that number as the maximum downside.",
    },
    {
      type: "heading",
      text: "What about crypto and the $AELIX token?",
    },
    {
      type: "prose",
      md: "Crypto trading isn't supported by the underlying beta. The `$AELIX` token is **not built**, **unlaunched, and speculative**: no sale, no price, no allocation, **not** an investment product, and it has **no connection to the vault**. The separate on-chain layer (an ERC-4626 vault + guardrails-as-code) **is** now deployed, to Robinhood Chain mainnet, chainId 4663, but it is **unaudited**, deposits are capped at 10,000 USDG (an owner-changeable setting, not structural), TVL is **0**, and it stays gated behind legal/securities review. The Stock Tokens it trades are price-tracking instruments, **not shares**, and are **not for US persons**. See [Safety & Disclaimer](/docs/disclaimer).",
    },
    {
      type: "heading",
      text: "Is the on-chain vault audited? Does it touch my Robinhood account?",
    },
    {
      type: "prose",
      md: "**No, and no.** There is **no third-party audit**, two internal audit passes and a 42-agent preflight review are not an audit, and the contracts are not yet verified on the block explorer. The vault is a **separate system**: it holds no customer money, has no depositors and no trades, and there is no path between it and your Robinhood account. Ownership is settled, every owner-controlled contract is owned by a **2-of-3 Safe multisig**, so no single hot key can move a risk cap, a feed or the deposit cap — but **there is no timelock yet**, a change the Safe signs takes effect in one transaction, and multisig custody is custody, not an audit. Per-contract detail is in [Architecture](/docs/architecture#the-separate-on-chain-module).",
    },
    {
      type: "heading",
      text: "What exactly can the agent do on-chain?",
    },
    {
      type: "prose",
      md: "Less than a hot wallet, by construction. The agent's limits are **published on-chain before it trades** — read them, and watch every order against them. Its session key is scoped by **expiry, per-trade size, total spend budget, trade count, and a ticker allowlist**; the owner (the 2-of-3 Safe) grants and revokes sessions; and the vault itself **reverts any order that breaches the compiled caps** — a rejected order spends none of the session budget. What the scoping does **not** include: per-depositor limits. The caps govern one pooled book, and changing them takes two of three Safe signatures, with **no timelock yet**.",
    },
    {
      type: "heading",
      text: "Why lead with a refusal rate instead of returns?",
    },
    {
      type: "prose",
      md: "Because it is the only number this project can accumulate honestly at TVL 0, and the plumbing for it is real: `previewTrade()` returns the exact rule an order would break **before** anyone signs, a refused order consumes **none** of the session budget, and the `DeskRegistry` is append-only, so refusals and vetoes stay on the record and cannot be pruned. The first number Aelix publishes will be **how often the vault said no**.",
    },
    {
      type: "heading",
      text: "How do vault redemptions and fees work?",
    },
    {
      type: "prose",
      md: "There is no customer money in the vault today — TVL is 0. Structurally, shares are always redeemable **in kind**: a pro-rata slice of the vault's cash and tokens, minus the exit fee. Cash-only redemption is limited to the USDG the vault has on hand. There are **no fees anywhere in the contracts** — no management fee, no performance fee, no carry — and the exit fee accrues to **remaining holders**, not the operator.",
    },
    {
      type: "heading",
      text: "Does the mainnet deploy make the desk autonomous?",
    },
    {
      type: "prose",
      md: "**No.** The equities desk is unchanged: Claude Code plus the Robinhood MCP, with your explicit in-session approval required for **every** order. Nothing on chain can trigger a trade in your Agentic account, and nothing in the desk moves funds on chain. The deploy changed what exists on Robinhood Chain, not what the desk is allowed to do.",
    },
    {
      type: "heading",
      text: "How does it defend against prompt injection?",
    },
    {
      type: "prose",
      md: "The [Macro/News Analyst](/docs/prompt-injection) treats every fetched web page as **untrusted data**. Instruction-like text (\"buy X now\", \"ignore your rules\", \"transfer funds\") is quoted verbatim under `INJECTION ATTEMPTS` and flagged, never obeyed. The PM never acts on instructions found in external content, and because of [least privilege](/docs/team) even a fooled analyst has no order tools.",
    },
    {
      type: "heading",
      text: "Is any of this financial advice?",
    },
    {
      type: "prose",
      md: "**No.** Aelix is a research tool and reference architecture. There is no track record and no performance claim anywhere in the project, all example data is illustrative. Every investment decision, and all the risk, is yours. Use only risk capital.",
    },
    {
      type: "heading",
      text: "What's the kill switch?",
    },
    {
      type: "prose",
      md: "Disconnect the MCP from the Robinhood app, or remove it locally with `claude mcp remove robinhood-trading`. Either one severs the desk's only path to your account. You can also just stop the Claude Code session.",
    },
    {
      type: "heading",
      text: "Where do secrets and tokens live?",
    },
    {
      type: "prose",
      md: "**Outside the repo.** The OAuth token, `.env`, `*.token`/`*.key`/`*.pem`, and the `secrets/`/`credentials/` folders are all gitignored, along with real state like `ui/public/desk-state.json` and live `logs/*.jsonl`. Only sanitized `*.example.*` files are committed. See [Configuration](/docs/configuration).",
    },
    {
      type: "heading",
      text: "Why does it usually tell me to stand aside?",
    },
    {
      type: "prose",
      md: "By design. The desk is **low-touch**, it runs read-only research and only surfaces a trade when one genuinely qualifies against a written rule in [`strategies/`](/docs/strategies). On most days the honest answer is \"no setup,\" and that is exactly what it reports. Steps 1–6 of a run produce no order.",
    },
    {
      type: "heading",
      text: "Do I need the dashboard to trade?",
    },
    {
      type: "prose",
      md: "No. The [dashboard](/docs/dashboard) is a **read-only mirror**, it cannot place orders. Approval and execution happen only in the Claude Code session. The UI just visualizes the snapshot the PM writes after each run.",
    },
    {
      type: "heading",
      text: "Why is the Risk Manager a separate agent?",
    },
    {
      type: "prose",
      md: "Independence. The [Risk Manager](/docs/team) reads the written caps in `strategies/` and can **veto a trade the analysts liked**. Because it is a distinct role with read-only account access and no order tools, its judgment is structurally separate from the analysts building the case, and if the caps are unset or the data looks off, it VETOes rather than assuming.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "Still evaluating?",
      md: "Aelix is beta software against a beta broker product. Expect rough edges, verify the [MCP tool names](/docs/mcp) yourself, keep your budget small, and monitor every run. Read the [Safety & Disclaimer](/docs/disclaimer) before you fund anything.",
    },
  ],
};
