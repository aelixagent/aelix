import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Backend API",
  description:
    "Run the Aelix public backend and call its REST API — auth, the Rule-Keeper, Portfolio X-Ray, the 24/7 desk, and alerts.",
  eyebrow: "19 — Going Public",
  blocks: [
    {
      type: "prose",
      md: "The public backend lives in [`backend/`](/docs/public-architecture) and is a zero-dependency Node service — it runs with plain `node`, no `npm install`. In its default `mock` mode it serves a demo account, so the whole API works with **no credentials** (great for local dev, CI, and the frontend).",
    },
    {
      type: "heading",
      text: "Run it",
    },
    {
      type: "code",
      lang: "bash",
      code: `cd backend
cp .env.example .env        # optional in dev — ephemeral secrets auto-generate
npm start                   # → http://localhost:8787  (broker=mock)
npm test                    # deterministic Rule-Keeper + crypto tests`,
    },
    {
      type: "callout",
      tone: "warn",
      title: "Secrets are fatal in production",
      md: "In dev, `JWT_SECRET` and `VAULT_KEY` are auto-generated (ephemeral — sessions reset on restart). In `NODE_ENV=production` the server **refuses to boot** without real ones. Generate: `openssl rand -hex 32` (JWT), `openssl rand -base64 32` (vault).",
    },
    {
      type: "heading",
      text: "Auth flow",
    },
    {
      type: "prose",
      md: "Sign up or log in to get a **JWT**, then send it as `Authorization: Bearer <token>` on every authenticated call.",
    },
    {
      type: "code",
      lang: "bash",
      code: `BASE=http://localhost:8787

# sign up → { token, user }
curl -s $BASE/v1/auth/signup -H 'content-type: application/json' \\
  -d '{"email":"you@example.com","password":"supersecret"}'

# then use the token
TOKEN=... ; AUTH="authorization: Bearer $TOKEN"`,
    },
    {
      type: "heading",
      text: "Endpoints",
    },
    {
      type: "table",
      headers: ["Method", "Path", "Auth", "Purpose"],
      rows: [
        ["GET", "`/health`", "–", "Liveness."],
        ["GET", "`/v1/meta`", "–", "Broker mode, feature flags, default caps."],
        ["POST", "`/v1/auth/signup`", "–", "Create account → `{ token, user }`."],
        ["POST", "`/v1/auth/login`", "–", "→ `{ token, user }`."],
        ["GET", "`/v1/me`", "✓", "Current user."],
        ["PUT", "`/v1/me/settings`", "✓", "`autoScan`, `scanIntervalSec`."],
        ["POST", "`/v1/broker/connect`", "✓", "Store the user's Robinhood OAuth token (encrypted)."],
        ["GET", "`/v1/broker/status`", "✓", "Connection + account snapshot."],
        ["DELETE", "`/v1/broker`", "✓", "Disconnect (delete token)."],
        ["GET / PUT", "`/v1/rules`", "✓", "Read / update the user's risk caps."],
        ["POST", "`/v1/rulekeeper/check`", "✓", "Check a trade vs the rules → verdict."],
        ["GET", "`/v1/desk`", "✓", "Latest persisted desk snapshot."],
        ["POST", "`/v1/desk/run`", "✓", "Run a fresh read-only desk pass now."],
        ["GET", "`/v1/xray`", "✓", "Fresh portfolio x-ray."],
        ["GET", "`/v1/alerts`", "✓", "Recent alerts."],
        ["POST", "`/v1/alerts/read`", "✓", "Mark alerts read."],
      ],
    },
    {
      type: "note",
      md: "Add `?explain=1` to `/v1/rulekeeper/check` and `/v1/xray` to get a plain-language coach note (only when `ANTHROPIC_API_KEY` is configured).",
    },
    {
      type: "heading",
      text: "The Rule-Keeper",
    },
    {
      type: "prose",
      md: "The core endpoint. You send a trade **the user wants to make**; it returns a verdict against the user's own caps with explicit, checkable math — `APPROVE`, `APPROVE-WITH-CHANGES` (with a compliant `suggestedQty`), or `VETO`.",
    },
    {
      type: "code",
      lang: "bash",
      code: `curl -s $BASE/v1/rulekeeper/check -H "$AUTH" -H 'content-type: application/json' \\
  -d '{"trade":{"symbol":"AAPL","side":"buy","qty":40,"price":208,"stop":195}}'`,
    },
    {
      type: "code",
      filename: "response",
      lang: "json",
      code: `{
  "trade": { "symbol": "AAPL", "side": "buy", "qty": 40, "price": 208, "stop": 195 },
  "verdict": {
    "decision": "VETO",
    "reasons": [
      "Post-trade AAPL weight vs concentration cap (25%).",
      "Cash after buy is below your 10% buffer.",
      "No compliant size available — your concentration cap leaves no room to add AAPL."
    ],
    "checks": [ { "name": "per-trade cap", "ok": false, "detail": "..." } ],
    "suggestedQty": 0,
    "sizing": { "qty": 0, "maxNotional": 0, "boundBy": "concentration cap" }
  },
  "explanation": null
}`,
    },
    {
      type: "heading",
      text: "The default caps",
    },
    {
      type: "prose",
      md: "New users start with the same conservative defaults as the desk's [`strategies/`](/docs/strategies). Each user owns and edits their own via `PUT /v1/rules`.",
    },
    {
      type: "code",
      lang: "json",
      code: `{
  "perTradePct": 15,
  "maxConcentrationPct": 25,
  "maxOpenPositions": 6,
  "maxDailyOrders": 4,
  "stopLossPct": 8,
  "dailyLossHaltPct": 5,
  "cashBufferPct": 10,
  "noAveragingIntoLosers": true
}`,
    },
    {
      type: "heading",
      text: "Portfolio X-Ray",
    },
    {
      type: "prose",
      md: "`GET /v1/xray` returns objective analytics on what the user already owns — concentration, sector exposure, cash %, a 0–100 discipline `healthScore`, and `flags` tied to the user's own caps (concentration breach, stop-breach, earnings-soon, underwater, cash-buffer). No recommendations.",
    },
    {
      type: "note",
      md: "The full endpoint list, deploy steps, and production checklist live in `backend/README.md`. Architecture + the legal gates are in [Public Architecture](/docs/public-architecture).",
    },
    {
      type: "pills",
      items: ["Zero-dep Node", "JWT auth", "mock + mcp broker", "curl-able", "Docker-ready"],
    },
  ],
};
