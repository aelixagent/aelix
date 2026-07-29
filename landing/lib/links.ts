/** Shared external URLs for the whole site (landing + docs). Single source of truth. */
export const GITHUB_URL = "https://github.com/aelixagent/aelix";
export const DOCS_PATH = "/docs";

/**
 * The live app (the `ui/` project) — the Desk dashboard + the investor Vault dApp.
 * It ships as a static build under /app of THIS site (landing/public/app), so
 * these are same-origin paths — one domain, no localhost, no separate deployment.
 * /vault is a real page route (app/vault/page.tsx) that frames /app/vault.html.
 */
export const VAULT_URL = "/vault"; // connect wallet · deposit · withdraw
export const DESK_APP_URL = "/app/index.html"; // raw desk mirror; public desk entry is gated by request access
export const REQUEST_ACCESS_URL = "/request-access"; // wallet pre-order + gated desk access
