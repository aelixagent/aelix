import type { NextConfig } from "next";

// Pin the workspace root to THIS app FOR LOCAL DEV ONLY. The repo-root
// package-lock.json (added for the `npm run dev` launcher via concurrently)
// otherwise makes Next infer the whole monorepo as the root — Turbopack then
// watches/scans ui/, onchain/, and every node_modules, ballooning memory until
// the dev server OOMs. Scoping the root to landing/ fixes that locally.
//
// On Vercel these SAME settings make the builder look for `.next` at the repo
// root instead of landing/, which fails the deploy with
// `ENOENT ... lstat '/vercel/path0/.next/package.json'`. Vercel already scopes
// the build to the `landing` Root Directory, so it doesn't need them — apply
// them only when NOT building on Vercel.
// The Vite app/vault build is committed to public/app (base "/app/"). Expose the
// Vault dApp on a clean same-origin path so the whole product lives on one
// domain. /desk is the marketing desk page (a real Next route); the raw desk
// mirror stays at /app/index.html. Skipped in local dev when NEXT_PUBLIC_APP_URL
// points at the standalone :5180.
const appRewrites = process.env.NEXT_PUBLIC_APP_URL
  ? []
  : [{ source: "/vault", destination: "/app/vault.html" }];

const base: NextConfig = process.env.VERCEL
  ? {}
  : {
      turbopack: { root: __dirname },
      outputFileTracingRoot: __dirname,
    };

const nextConfig: NextConfig = {
  ...base,
  async rewrites() {
    return appRewrites;
  },
};

export default nextConfig;
