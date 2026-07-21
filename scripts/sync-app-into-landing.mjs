#!/usr/bin/env node
// Build the Vite app/vault (ui/) and copy its static output into
// landing/public/app so the whole product ships from ONE Next.js deployment
// (one domain, no localhost, no second Vercel project). Next rewrites expose it
// at /vault and /desk. Re-run this whenever ui/ changes, then commit.
import { execSync } from 'node:child_process'
import { rm, mkdir, cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'ui', 'dist')
const dest = resolve(root, 'landing', 'public', 'app')

console.log('› building ui/ (Vite, base=/app/)…')
execSync('npm run build', { cwd: resolve(root, 'ui'), stdio: 'inherit' })

console.log(`› syncing ${dist} → ${dest}`)
await rm(dest, { recursive: true, force: true })
await mkdir(dest, { recursive: true })
await cp(dist, dest, { recursive: true })

console.log('✓ app/vault synced into landing/public/app — commit the result.')
