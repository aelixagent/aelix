import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to THIS app. The repo-root package-lock.json (added
  // for the `npm run dev` launcher via concurrently) otherwise makes Next infer
  // the whole monorepo as the root — Turbopack then watches/scans ui/, onchain/,
  // the vvvhound asset folder and every node_modules, ballooning memory until
  // the dev server OOMs. Scoping the root to landing/ fixes that and silences
  // the "multiple lockfiles" warning.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
