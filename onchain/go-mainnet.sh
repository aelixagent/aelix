#!/usr/bin/env bash
# Aelix -> Robinhood Chain mainnet (4663), one shot.
#
#   PREREQ: the deployer must hold ~0.016 ETH on chain 4663 (~$30).
#           At the time of writing it held 0. Bridge first, or step 1 fails.
#
#   export DEPLOYER_PK=<deployer private key>     # not stored in this file
#   ./go-mainnet.sh
#
# Steps: fund the 5 other wallets -> create the 2-of-3 Safe -> deploy the stack.
# Each step is idempotent-ish and stops on the first failure.
set -euo pipefail

# Defaults to the local DNS-bypass proxy, because this network's resolver hijacks
# *.robinhood.com (TrustPositif -> 103.123.248.32, connection refused). Only DNS is
# affected, so the proxy pins the real Cloudflare IPs. Start it first:
#   python3 rpc-proxy.py &
# On a network without that filter, override:  RH_MAINNET_RPC=https://rpc.mainnet.chain.robinhood.com
R="${RH_MAINNET_RPC:-http://127.0.0.1:8545}"
: "${DEPLOYER_PK:?set DEPLOYER_PK}"

DEPLOYER=0xeC68f3c2f23c11Eb7Ca77322b4E66d23492B5c51
SIGNER1=0x054C097D4C9A008848C07bbb9de628A22A781400
SIGNER2=0x3411689A2857A095f877c51E725235a384295619
SIGNER3=0x116892819eC62e7b252f02f744b42ab490eE03ab
AGENT=0xF4B68286ba3cDb4b26A4a3075765177111Cff661
KEEPER=0xA2ac885ba1e73d396cDFE2Db9049DD3a50b455Ed

# Safe 1.4.1 canonical addresses — SafeProxyFactory verified present on 4663.
SAFE_FACTORY=0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67
SAFE_SINGLETON=0x41675C099F32341bf84BFc5382aF534df5C7461a

# forge's vm.envUint parses a bare hex string as DECIMAL and fails on the letters, so
# PRIVATE_KEY must carry an explicit 0x. Normalise here so either input form works.
PK="0x${DEPLOYER_PK#0x}"

# Idempotent funding: re-running after a partial failure must not double-send. Compares the
# recipient's current balance against the target and skips if already at or above it.
fund() {
  local to="$1" amount_eth="$2" label="$3"
  local want have
  want=$(cast to-wei "$amount_eth" ether)
  have=$(cast balance "$to" --rpc-url "$R")
  if [ "$have" -ge "$want" ] 2>/dev/null; then
    echo "    skip $label ($to) - already has $(cast from-wei "$have") ETH"
    return 0
  fi
  echo "    send $amount_eth ETH -> $label ($to)"
  cast send "$to" --value "${amount_eth}ether" --rpc-url "$R" --private-key "$PK" --json >/dev/null
}

echo "==> chain: $(cast chain-id --rpc-url "$R")  (expect 4663)"
[ "$(cast chain-id --rpc-url "$R")" = "4663" ] || { echo "WRONG CHAIN"; exit 1; }

# Wallet targets, scaled to the ACTUAL funded balance (0.0149858 ETH / ~$28.05 at $1,871.79)
# rather than the $30 originally planned. Sends total 0.0069 ETH.
TARGETS="$SIGNER1:0.0016:signer1 $SIGNER2:0.0005:signer2 $SIGNER3:0.0005:signer3 \
$AGENT:0.0027:agent $KEEPER:0.0016:keeper"
# Reserve for the deploy: measured ~12M gas for 8 contracts + wiring, ~2x headroom.
DEPLOY_RESERVE=8000000000000000  # 0.008 ETH

BAL=$(cast balance "$DEPLOYER" --rpc-url "$R")
echo "==> deployer balance: $(cast from-wei "$BAL") ETH"
case "$BAL" in ''|*[!0-9]*) echo "could not read balance"; exit 1 ;; esac

# Require only what is STILL OUTSTANDING, not a fixed total. A flat "needs >= 0.014 ETH" gate
# blocks its own recovery path: after step 1 succeeds the deployer is legitimately down to
# ~0.008 ETH, so a re-run after a later failure would abort here forever.
NEED=0
for t in $TARGETS; do
  to=${t%%:*}; rest=${t#*:}; amt=${rest%%:*}
  want=$(cast to-wei "$amt" ether)
  have=$(cast balance "$to" --rpc-url "$R")
  case "$have" in ''|*[!0-9]*) echo "could not read balance of $to"; exit 1 ;; esac
  [ "$have" -lt "$want" ] && NEED=$((NEED + want - have))
done
REQUIRED=$((NEED + DEPLOY_RESERVE))
echo "    outstanding funding: $(cast from-wei "$NEED") ETH + $(cast from-wei "$DEPLOY_RESERVE") reserve"
[ "$BAL" -ge "$REQUIRED" ] || {
  echo "deployer needs >= $(cast from-wei "$REQUIRED") ETH (has $(cast from-wei "$BAL"))"; exit 1; }

# ---------------------------------------------------------------- 1. fund wallets
echo "==> 1/3 funding wallets"
for t in $TARGETS; do
  to=${t%%:*}; rest=${t#*:}; amt=${rest%%:*}; label=${rest#*:}
  fund "$to" "$amt" "$label"
done
echo "    funded; deployer keeps $(cast from-wei "$(cast balance "$DEPLOYER" --rpc-url "$R")") ETH for the deploy"

# ------------------------------------------------------- 2. create the 2-of-3 Safe
# setup(owners, threshold, to, data, fallbackHandler, paymentToken, payment, refundReceiver)
echo "==> 2/3 creating 2-of-3 Safe"
INIT=$(cast calldata \
  "setup(address[],uint256,address,bytes,address,address,uint256,address)" \
  "[$SIGNER1,$SIGNER2,$SIGNER3]" 2 0x0000000000000000000000000000000000000000 0x \
  0x0000000000000000000000000000000000000000 0x0000000000000000000000000000000000000000 0 \
  0x0000000000000000000000000000000000000000)

# Derive the address ARITHMETICALLY, never by simulating createProxyWithNonce.
# Simulating works exactly once: SafeProxyFactory.deployProxy ends in
# `require(address(proxy) != address(0), "Create2 call failed")`, so once the proxy exists at
# that CREATE2 address the simulation reverts too — which made a second run of this script
# die here instead of reusing the Safe it had already created.
#
# CREATE2, per SafeProxyFactory 1.4.1:
#   salt         = keccak256(keccak256(initializer) ++ uint256(saltNonce))
#   initCode     = proxyCreationCode() ++ uint256(uint160(singleton))
#   address      = last20(keccak256(0xff ++ factory ++ salt ++ keccak256(initCode)))
# proxyCreationCode() is a pure getter on the factory, so this needs no local Safe source.
SAFE_SALT=$(cast keccak "$(cast concat-hex "$(cast keccak "$INIT")" "$(cast to-uint256 0)")")
SAFE_INITCODE_HASH=$(cast keccak "$(cast concat-hex \
  "$(cast call "$SAFE_FACTORY" 'proxyCreationCode()(bytes)' --rpc-url "$R")" \
  "$(cast to-uint256 "$SAFE_SINGLETON")")")
SAFE=$(cast create2 --deployer "$SAFE_FACTORY" --salt "$SAFE_SALT" \
  --init-code-hash "$SAFE_INITCODE_HASH" | tail -1 | tr -d '[:space:]')
case "$SAFE" in 0x????????????????????????????????????????) ;;
  *) echo "FATAL: could not derive the Safe address (got '$SAFE')"; exit 1 ;; esac
echo "    computed Safe: $SAFE"

if [ "$(cast code "$SAFE" --rpc-url "$R")" = "0x" ]; then
  cast send "$SAFE_FACTORY" \
    "createProxyWithNonce(address,bytes,uint256)" "$SAFE_SINGLETON" "$INIT" 0 \
    --rpc-url "$R" --private-key "$PK" >/dev/null
else
  echo "    already deployed, reusing"
fi

# Never hand the stack to an address whose configuration has not been read back.
OWNERS=$(cast call "$SAFE" "getOwners()(address[])" --rpc-url "$R")
THRESH=$(cast call "$SAFE" "getThreshold()(uint256)" --rpc-url "$R")
echo "    owners:    $OWNERS"
echo "    threshold: $THRESH"
[ "$THRESH" = "2" ] || { echo "FATAL: Safe threshold is $THRESH, expected 2"; exit 1; }
for s in "$SIGNER1" "$SIGNER2" "$SIGNER3"; do
  echo "$OWNERS" | grep -qi "${s#0x}" || { echo "FATAL: $s is not a Safe owner"; exit 1; }
done
echo "    Safe verified: 2-of-3 over your three signers"

# ------------------------------------------------------------- 3. deploy the stack
echo "==> 3/3 deploying Aelix stack"
export PRIVATE_KEY="$PK"
export OWNER="$SAFE"
export AGENT
export USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
export ROUTER=0x89e5db8b5aa49aa85ac63f691524311aeb649eba
# NVDA, AAPL, TSLA, GOOGL, SPY  (tokens / feed proxies - verified on 4663)
export STOCKS=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC,0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9,0x322F0929c4625eD5bAd873c95208D54E1c003b2d,0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3,0x117cc2133c37B721F49dE2A7a74833232B3B4C0C
export FEEDS=0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15,0x6B22A786bAa607d76728168703a39Ea9C99f2cD0,0x4A1166a659A55625345e9515b32adECea5547C38,0xF6f373a037c30F0e5010d854385cA89185AE638b,0x319724394D3A0e3669269846abE664Cd621f9f6A
# 24/7 crypto liveness witnesses: ETH/USD, USDT/USD, ENA/USD
export LIVENESS_FEEDS=0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9,0xbf3550B6fAe1671da7C238Af12e03Ac586BEf3B1,0x2A291496b3aa19d8948e442Ef28Ee952f3Ee97E8
export LIVENESS_BOUND=43200
export FEED_STALENESS=14400
export FEED_STALENESS_OFFHOURS=302400
# Staged rollout: cap total assets at 10,000 USDG (6-dec) on day one. The stack is unaudited,
# so the blast radius of a surviving bug is bounded by what the vault is allowed to hold.
# Raise it deliberately later via the Safe (setDepositCap). Mainnet refuses 0.
export DEPOSIT_CAP=10000000000

# Dry-run first: this executes every gate check and the whole deploy against a fork WITHOUT
# broadcasting, so a misconfiguration costs nothing instead of stranding gas mid-sequence.
echo "    simulating (no broadcast)..."
forge script script/DeployProduction.s.sol --rpc-url "$R" -vvv

echo ""
read -r -p "    Simulation passed. Broadcast for real? [yes/NO] " ok
# Case-insensitive: an operator who types YES plainly means yes, and making them re-run the
# whole sequence over capitalisation is a footgun, not a safety feature.
case "$(printf '%s' "$ok" | tr '[:upper:]' '[:lower:]')" in
  yes|y) ;;
  *) echo "    aborted, nothing broadcast"; exit 0 ;;
esac

forge script script/DeployProduction.s.sol \
  --rpc-url "$R" --broadcast --private-key "$PK" -vvv

echo ""
echo "==> deployed. Addresses in deployments/latest.json"
echo "    Ownership of vault/oracle/executor is PENDING - the Safe must call"
echo "    acceptOwnership() on each (the deploy log prints the three addresses)."
echo "    Until then the deployer key still controls them."
echo "    THEN: set a small TVL cap before accepting deposits (MAINNET_CHECKLIST.md, C5)."
