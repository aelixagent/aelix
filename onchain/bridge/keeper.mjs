#!/usr/bin/env node
// Aelix Autosave keeper.
//
// Discovers every user who created a plan (via PlanCreated events), checks which
// are due, and calls executeDue(user) for each. Run it on a cron (or Gelato /
// Chainlink Automation) so DCA contributions fire on schedule without the user.
//
// Usage:
//   RPC_URL=... PRIVATE_KEY=0x.. node keeper.mjs --once     # one pass, send txs
//   RPC_URL=... node keeper.mjs --dry                       # report due, send nothing
//   RPC_URL=... PRIVATE_KEY=0x.. node keeper.mjs --interval 300   # loop every 300s
//
// Addresses come from ../deployments/latest.json (written by the deploy script).

import { ethers } from "ethers";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const DEPLOYMENTS = join(__dir, "..", "deployments", "latest.json");
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DRY = process.argv.includes("--dry");
const ONCE = process.argv.includes("--once") || DRY;
const intervalIx = process.argv.indexOf("--interval");
const INTERVAL = intervalIx >= 0 ? Number(process.argv[intervalIx + 1]) : 0;

const AUTOSAVE_ABI = [
  "event PlanCreated(address indexed user, uint256 amountPerPeriod, uint64 period, uint32 totalPeriods)",
  "function due(address) view returns (bool)",
  "function executeDue(address) returns (uint256)",
  "function plans(address) view returns (uint256 amountPerPeriod, uint64 period, uint64 nextExec, uint32 totalPeriods, uint32 periodsDone, bool active)",
];

function load() {
  if (!existsSync(DEPLOYMENTS)) throw new Error(`No deployment at ${DEPLOYMENTS}`);
  return JSON.parse(readFileSync(DEPLOYMENTS, "utf8"));
}

async function discoverUsers(save) {
  // Enumerate PlanCreated events to find every plan owner.
  const logs = await save.queryFilter(save.filters.PlanCreated(), 0, "latest");
  return [...new Set(logs.map((l) => l.args.user))];
}

async function pass(save, signer) {
  const users = await discoverUsers(save);
  let due = 0, executed = 0;
  for (const u of users) {
    const isDue = await save.due(u);
    if (!isDue) continue;
    due++;
    if (DRY || !signer) {
      console.log(`  due: ${u} (dry-run, not executed)`);
      continue;
    }
    try {
      const tx = await save.connect(signer).executeDue(u);
      const rcpt = await tx.wait();
      executed++;
      console.log(`  executed ${u} — tx ${rcpt.hash}`);
    } catch (e) {
      console.log(`  FAILED ${u}: ${(e.shortMessage || e.message).slice(0, 120)}`);
    }
  }
  console.log(`pass complete: ${users.length} plans, ${due} due, ${executed} executed`);
}

async function main() {
  const d = load();
  if (!d.autosave) throw new Error("no autosave address in deployment");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const save = new ethers.Contract(d.autosave, AUTOSAVE_ABI, provider);
  const signer = process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY, provider) : null;

  console.log(`keeper on ${RPC_URL} · autosave ${d.autosave} · ${DRY ? "DRY" : signer ? "LIVE" : "READ-ONLY"}`);

  if (INTERVAL > 0 && !ONCE) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await pass(save, signer).catch((e) => console.error("pass error:", e.message));
      await new Promise((r) => setTimeout(r, INTERVAL * 1000));
    }
  } else {
    await pass(save, signer);
  }
}

main().catch((e) => {
  console.error("keeper failed:", e.message);
  process.exit(1);
});
