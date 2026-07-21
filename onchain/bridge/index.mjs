#!/usr/bin/env node
// Aelix desk -> chain bridge.
//
// Reads LIVE state from the deployed Aelix contracts and writes the `onchain`
// block into ui/public/desk-state.json — the exact block the dashboard's on-chain
// panels (VaultPanel, GuardrailsOnChain, TrackRecord, ExecutorPanel, AutosavePanel)
// already render. With --attest and a PRIVATE_KEY it also commits one desk-run
// attestation to DeskRegistry, so the track record grows over time.
//
// Usage:
//   RPC_URL=http://127.0.0.1:8545 node index.mjs            # read-only refresh
//   RPC_URL=... PRIVATE_KEY=0x.. node index.mjs --attest    # + attest a desk run
//
// Addresses come from ../deployments/latest.json (written by script/Deploy.s.sol).

import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ONCHAIN = join(__dir, "..");
const UI_PUBLIC = join(ONCHAIN, "..", "ui", "public");

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DO_ATTEST = process.argv.includes("--attest");

// ---- minimal human-readable ABIs (only what we call) ----
const VAULT_ABI = [
  "function navUsdg() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function symbol() view returns (string)",
  "function manager() view returns (address)",
  "function openPositions() view returns (uint256)",
  "function ordersToday() view returns (uint8)",
  "function asset() view returns (address)",
];
const CFG_ABI = [
  "function caps() view returns (tuple(uint16 perTradeBps,uint16 maxConcentrationBps,uint8 maxOpenPositions,uint8 maxDailyOrders,uint16 stopLossBps,uint16 dailyLossHaltBps,uint16 cashBufferBps))",
];
const REG_ABI = [
  "function count(bytes32) view returns (uint256)",
  "function attesterOf(bytes32) view returns (address)",
  "function attest(bytes32 subject,uint64 epoch,uint256 nav,int256 realizedPnl,bytes32 snapshotHash,string uri) returns (uint256)",
  "function latest(bytes32) view returns (tuple(uint64 epoch,uint64 timestamp,uint256 nav,int256 realizedPnl,bytes32 snapshotHash,string uri))",
];
const PERF_ABI = [
  "function summary(bytes32) view returns (tuple(uint256 samples,uint256 startNav,uint256 endNav,int256 totalReturnBps,uint256 maxDrawdownBps,int256 meanPeriodReturnBps,uint256 volatilityBps,int256 sharpeMilli,uint64 firstTs,uint64 lastTs))",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

const num = (x, dec = 18) => Number(ethers.formatUnits(x, dec));
const round2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function loadDeployments() {
  const p = join(ONCHAIN, "deployments", "latest.json");
  if (!existsSync(p)) {
    throw new Error(`No deployment found at ${p}. Run: forge script script/Deploy.s.sol --broadcast ...`);
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

function loadDeskState() {
  const live = join(UI_PUBLIC, "desk-state.json");
  const example = join(UI_PUBLIC, "desk-state.example.json");
  const src = existsSync(live) ? live : example;
  return { state: JSON.parse(readFileSync(src, "utf8")), from: src };
}

function capsToRows(c) {
  const pct = (bps) => `${Number(bps) / 100}%`;
  return [
    { key: "perTradePct", label: "Per-trade cap", value: pct(c.perTradeBps), enforced: true },
    { key: "maxConcentrationPct", label: "Max concentration", value: pct(c.maxConcentrationBps), enforced: true },
    { key: "maxOpenPositions", label: "Max open positions", value: String(c.maxOpenPositions), enforced: true },
    { key: "maxDailyOrders", label: "Max daily orders", value: String(c.maxDailyOrders), enforced: true },
    { key: "stopLossPct", label: "Stop-loss", value: `-${Number(c.stopLossBps) / 100}%`, enforced: true },
    { key: "dailyLossHaltPct", label: "Daily-loss halt", value: `-${Number(c.dailyLossHaltBps) / 100}%`, enforced: true },
    { key: "cashBufferPct", label: "Cash buffer", value: `>=${Number(c.cashBufferBps) / 100}%`, enforced: true },
    { key: "noAveraging", label: "No averaging into losers", value: "enforced", enforced: true },
  ];
}

async function main() {
  const d = loadDeployments();
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const net = await provider.getNetwork();

  const vault = new ethers.Contract(d.vault, VAULT_ABI, provider);
  const cfg = new ethers.Contract(d.guardrailConfig, CFG_ABI, provider);
  const reg = new ethers.Contract(d.deskRegistry, REG_ABI, provider);
  const perf = new ethers.Contract(d.perfScore, PERF_ABI, provider);
  const usdg = new ethers.Contract(d.usdg, ERC20_ABI, provider);

  const [nav, shares, totalAssets, symbol, manager, caps, cashBal, count, summary] =
    await Promise.all([
      vault.navUsdg(),
      vault.totalSupply(),
      vault.totalAssets(),
      vault.symbol(),
      vault.manager(),
      cfg.caps(),
      usdg.balanceOf(d.vault),
      reg.count(d.subject),
      perf.summary(d.subject),
    ]);

  const navN = num(nav), sharesN = num(shares), cashN = num(cashBal);
  const sharePrice = sharesN > 0 ? round2(num(totalAssets) / sharesN) : 1;
  const utilizationPct = navN > 0 ? Math.round(((navN - cashN) / navN) * 100) : 0;
  const totalReturnPct = round2(Number(summary.totalReturnBps) / 100);
  const maxDdPct = round2(Number(summary.maxDrawdownBps) / 100);
  // Heuristic 0-100 track-record score from verified return & drawdown.
  const perfScore = Math.round(clamp(50 + totalReturnPct * 2 - maxDdPct, 0, 100));
  const managerIsExecutor = manager.toLowerCase() === d.executor.toLowerCase();

  const onchain = {
    network: {
      name: net.chainId === 46630n ? "Robinhood Chain Testnet"
           : net.chainId === 4663n ? "Robinhood Chain"
           : `Chain ${net.chainId}`,
      chainId: Number(net.chainId),
      deployed: true,
      explorer: "https://explorer.testnet.chain.robinhood.com",
    },
    contracts: {
      guardrails: d.guardrailConfig,
      vault: d.vault,
      attestor: d.deskRegistry,
      executor: d.executor,
      autosave: d.autosave,
    },
    vault: {
      symbol,
      nav: round2(navN),
      totalAssets: round2(num(totalAssets)),
      totalShares: round2(sharesN),
      sharePrice,
      yourShares: 0,
      yourValue: 0,
      utilizationPct,
      apyPct: null,
    },
    guardrails: capsToRows(caps),
    trackRecord: {
      perfScore,
      attestations: Number(count),
      verifiedPnlPct: Number(summary.samples) > 1 ? totalReturnPct : null,
      lastAttestation: null,
    },
    executor: {
      type: "Scoped session key (EOA)",
      status: managerIsExecutor ? "live" : "preview",
      scope: "guardrail-bounded swaps · approval-gated",
      sessionKey: null,
      dailyCapPct: Number(caps.perTradeBps) / 100,
      lastAction: null,
    },
    autosave: { enabled: false, cadence: "weekly", amount: 100, asset: "USDG", nextRun: null },
  };

  // Optionally attest a fresh desk run (commits state).
  if (DO_ATTEST) {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) throw new Error("--attest requires PRIVATE_KEY");
    const wallet = new ethers.Wallet(pk, provider);
    const owner = reg.connect(wallet);
    const epoch = Number(count) + 1;
    const snapshotHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(onchain)));
    const tx = await owner.attest(d.subject, epoch, nav, 0n, snapshotHash, "");
    const rcpt = await tx.wait();
    onchain.trackRecord.attestations = epoch;
    onchain.trackRecord.lastAttestation = {
      ts: new Date().toISOString(),
      txHash: rcpt.hash,
      summary: `desk run #${epoch} attested on-chain`,
    };
    console.log(`attested epoch ${epoch} — tx ${rcpt.hash}`);
  }

  const { state, from } = loadDeskState();
  state.onchain = onchain;
  const outPath = join(UI_PUBLIC, "desk-state.json");
  writeFileSync(outPath, JSON.stringify(state, null, 2) + "\n");

  console.log(`bridged live chain state (from ${from.split("/").pop()}) -> ${outPath}`);
  console.log(
    `  network=${onchain.network.name} vault=${symbol} nav=${onchain.vault.nav} ` +
    `shares=${onchain.vault.totalShares} sharePrice=${sharePrice} util=${utilizationPct}% ` +
    `attestations=${onchain.trackRecord.attestations} perfScore=${perfScore} exec=${onchain.executor.status}`
  );
}

main().catch((e) => {
  console.error("bridge failed:", e.message);
  process.exit(1);
});
