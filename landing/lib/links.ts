/** Shared external URLs for the whole site (landing + docs). Single source of truth. */
export const GITHUB_URL = "https://github.com/aelixagent/aelix";
export const DOCS_PATH = "/docs";

/**
 * The live app (the `ui/` project) — the Desk dashboard + the investor Vault dApp.
 * It ships as a static build under /app of THIS site and is exposed via Next
 * rewrites, so these are same-origin paths — one domain, no localhost, no
 * separate deployment. In local dev the standalone Vite server on :5180 is used
 * instead via NEXT_PUBLIC_APP_URL.
 */
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "";
export const VAULT_URL = `${APP_ORIGIN}/vault`; // connect wallet · deposit · withdraw
export const DESK_APP_URL = `${APP_ORIGIN}/app/index.html`; // raw desk mirror (marketing desk lives at /desk)
