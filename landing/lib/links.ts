/** Shared external URLs for the whole site (landing + docs). Single source of truth. */
export const GITHUB_URL = "https://github.com/aelixagent/aelix";
export const DOCS_PATH = "/docs";

/**
 * The live app (the `ui/` project) — the Desk dashboard + the investor Vault dApp.
 * In dev it runs on :5180 (this marketing site is :5190). Override with
 * NEXT_PUBLIC_APP_URL when both are deployed behind real domains.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5180";
export const VAULT_URL = `${APP_URL}/vault.html`; // connect wallet · deposit · withdraw
export const DESK_APP_URL = `${APP_URL}/`; // live desk mirror
