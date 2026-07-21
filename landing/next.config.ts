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
// The Vite app/vault build is committed to public/app (base "/app/") and served
// as static files. The clean /vault route is a real Next page (app/vault/page.tsx)
// that frames /app/vault.html — a Next *rewrite* to a static .html file works in
// `next start` but 404s on Vercel, so we use a page route, which is reliable.
const nextConfig: NextConfig = process.env.VERCEL
  ? {}
  : {
      turbopack: { root: __dirname },
      outputFileTracingRoot: __dirname,
    };

export default nextConfig;
