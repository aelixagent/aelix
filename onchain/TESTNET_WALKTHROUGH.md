# Deploy Aelix ke Robinhood Chain Testnet — Panduan Langkah demi Langkah

Dua level:
- **Level 1 (bisa SEKARANG):** deploy **stack demo** (`Deploy.s.sol`) yang bawa mock
  USDG/oracle/swap sendiri. Cukup butuh wallet + testnet ETH. Semua fitur jalan di
  chain asli (deposit, agent trade ber-guardrail, attestation, dApp).
- **Level 2 (nanti):** ganti ke periphery asli (`DeployProduction.s.sol`) begitu alamat
  testnet USDG/Stock Token/feed Chainlink diketahui dari docs.robinhood.com/chain.

Panduan ini fokus **Level 1**. Jalankan dari folder `onchain/`.

---

## Step 0 — Prasyarat
- Foundry sudah terpasang (`forge --version`). ✅ kamu udah.
- Node terpasang (buat bridge). ✅

## Step 1 — Bikin wallet dev (JANGAN pakai wallet utama)
```bash
cast wallet new
```
Catat `Address` dan `Private key`. Ini wallet buang/dev khusus testnet.
```bash
export PRIVATE_KEY=0x....            # private key dari atas
export ME=0x....                      # address dari atas
export RH_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com/rpc
```

## Step 2 — Ambil testnet ETH (buat gas)
Buka faucet, paste `Address` kamu, minta ETH:
- https://faucet.testnet.chain.robinhood.com/
- (cadangan) https://faucets.chain.link/robinhood-testnet

Cek saldo (harus > 0):
```bash
cast balance $ME --rpc-url $RH_TESTNET_RPC
```

## Step 3 — Deploy stack demo
```bash
forge script script/Deploy.s.sol \
  --rpc-url $RH_TESTNET_RPC --broadcast --private-key $PRIVATE_KEY
```
Yang terjadi: deploy 6 kontrak inti + mock periphery, wiring manager=executor,
lalu seed demo (deposit 10.000 USDG, 1 trade ber-guardrail, 2 attestation).

Yang kamu lihat: daftar alamat di `== Logs ==`, dan file `deployments/latest.json`
kebentuk. `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`.

## Step 4 — Lihat di block explorer (Blockscout)
Buka `https://explorer.testnet.chain.robinhood.com`, paste alamat `RWAVault` dari log.
Kamu bakal lihat kontraknya + transaksi deploy/deposit/trade.

(Opsional) verify source code:
```bash
VAULT=$(node -e "console.log(require(process.cwd()+'/deployments/latest.json').vault)")
forge verify-contract $VAULT src/RWAVault.sol:RWAVault \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/ --watch
```

## Step 5 — Nyalain UI (bridge → dashboard + dApp)
```bash
cd bridge && npm install
RPC_URL=$RH_TESTNET_RPC node index.mjs           # tulis blok onchain ke desk-state.json
cd ../../ui && npm install && npm run dev          # buka http://localhost:5180
```
- Dashboard (`/`) → panel on-chain (Vault/Guardrails/TrackRecord) nyala dengan data live.
- dApp investor → buka `http://localhost:5180/vault.html`.

## Step 6 — Connect wallet ke dApp
1. Di MetaMask → Add network manual:
   - Network name: `Robinhood Chain Testnet`
   - RPC: `https://rpc.testnet.chain.robinhood.com/rpc`
   - Chain ID: `46630`
   - Symbol: `ETH`
   - Explorer: `https://explorer.testnet.chain.robinhood.com`
2. Import wallet dev kamu (private key) ke MetaMask.
3. Buka `vault.html` → **Connect wallet**. Kamu bakal lihat posisi (deployer udah punya
   ~10.000 shares dari seed demo).

## Step 7 — Coba deposit lagi (mock USDG bisa di-mint)
Karena USDG demo itu mock dengan `mint` publik:
```bash
USDG=$(node -e "console.log(require(process.cwd()+'/deployments/latest.json').usdg)")
# (jalankan dari onchain/)  mint 1.000 USDG ke diri sendiri
cast send $USDG "mint(address,uint256)" $ME 1000ether \
  --rpc-url $RH_TESTNET_RPC --private-key $PRIVATE_KEY
```
Lalu di dApp: isi jumlah → **Deposit** (approve + deposit otomatis). Refresh → shares naik.

## Step 8 — (Opsional) keeper Autosave
```bash
cd onchain/bridge
RPC_URL=$RH_TESTNET_RPC PRIVATE_KEY=$PRIVATE_KEY node keeper.mjs --interval 300
```

---

## Level 2 — periphery asli (nanti)
Begitu kamu dapat alamat testnet **USDG**, **Stock Token**, **feed Chainlink**,
**sequencer feed**, **router DEX** dari `docs.robinhood.com/chain`, ikuti `DEPLOY.md`
dan pakai `script/DeployProduction.s.sol`. Struktur & UI-nya sama persis — cuma ganti
periphery dari mock ke asli.

## Troubleshooting
- `insufficient funds` → testnet ETH kurang, ulang Step 2.
- RPC error → coba host tanpa `/rpc` di ujung, atau cek status di docs.
- dApp "No deployed vault found" → jalankan bridge (Step 5) dulu supaya `desk-state.json`
  keisi alamat.
- ⚠️ Ini **testnet-preview, belum diaudit** — jangan pernah pakai dana asli.
