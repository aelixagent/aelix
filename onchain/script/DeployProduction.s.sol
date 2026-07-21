// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import { Guardrails } from "../src/libraries/Guardrails.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { DeskRegistry } from "../src/DeskRegistry.sol";
import { PerfScore } from "../src/PerfScore.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { SessionKeyExecutor } from "../src/SessionKeyExecutor.sol";
import { AelixAutosave } from "../src/AelixAutosave.sol";
import { ChainlinkOracleAdapter } from "../src/ChainlinkOracleAdapter.sol";
import { UniswapSwapAdapter } from "../src/UniswapSwapAdapter.sol";

/// @title DeployProduction — real Robinhood Chain deploy (no mocks, no seeding)
/// @notice Deploys the full Aelix stack against REAL periphery addresses supplied
///         via env, wires a Chainlink oracle feed per Stock Token, sets the executor
///         as the vault manager, and persists addresses for the bridge.
///
/// @dev    Env (see onchain/DEPLOY.md):
///           PRIVATE_KEY      deployer (also becomes owner unless OWNER set)
///           USDG             USDG token address
///           USDG_DECIMALS    e.g. 6 or 18            (default 6)
///           ROUTER           Uniswap/Pleiades V2 router
///           HOP_TOKEN        optional routing hop    (default 0)
///           SEQUENCER_FEED   Chainlink L2 uptime feed (default 0 = disabled)
///           SEQUENCER_GRACE  seconds                 (default 3600)
///           STOCKS           comma-sep Stock Token addresses
///           FEEDS            comma-sep Chainlink feeds (parallel to STOCKS)
///           FEED_STALENESS   heartbeat seconds        (default 3600)
///           AGENT            desk agent key (session)  (default deployer)
///
///         forge script script/DeployProduction.s.sol \
///           --rpc-url $RH_TESTNET_RPC --broadcast --private-key $PRIVATE_KEY
contract DeployProduction is Script {
    struct Stack {
        GuardrailConfig cfg;
        DeskRegistry registry;
        PerfScore perf;
        ChainlinkOracleAdapter oracle;
        UniswapSwapAdapter swap;
        RWAVault vault;
        SessionKeyExecutor exec;
        AelixAutosave save;
    }

    struct Cfg {
        address usdg;
        uint8 usdgDecimals;
        address router;
        address hop;
        address sequencerFeed;
        uint256 grace;
        address[] stocks;
        address[] feeds;
        uint32 staleness;
        address owner;
        address agent;
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        Cfg memory c;
        c.usdg = vm.envOr("USDG", address(0x1111111111111111111111111111111111111111));
        // Read decimals LIVE from the token — the canonical Robinhood Chain USDG is
        // 6-dec, but a 18-dec look-alike ("Global Dollar") exists at a different
        // address (a 1e12 accounting trap). Never trust the env/symbol; read on-chain.
        c.usdgDecimals = _readDecimals(c.usdg, uint8(vm.envOr("USDG_DECIMALS", uint256(6))));
        c.router = vm.envOr("ROUTER", address(0x2222222222222222222222222222222222222222));
        c.hop = vm.envOr("HOP_TOKEN", address(0));
        c.sequencerFeed = vm.envOr("SEQUENCER_FEED", address(0));
        c.grace = vm.envOr("SEQUENCER_GRACE", uint256(3600));
        c.stocks = vm.envOr("STOCKS", ",", new address[](0));
        c.feeds = vm.envOr("FEEDS", ",", new address[](0));
        c.staleness = uint32(vm.envOr("FEED_STALENESS", uint256(3600)));
        c.owner = deployer;
        c.agent = vm.envOr("AGENT", deployer);
        require(c.stocks.length == c.feeds.length, "STOCKS/FEEDS length mismatch");

        console2.log("chainId", block.chainid); // 46630 testnet, 4663 mainnet
        console2.log("USDG decimals (live)", c.usdgDecimals);

        vm.startBroadcast(pk);
        Stack memory s = _deploy(c);
        _wire(s, c);
        vm.stopBroadcast();

        _report(s, c);
        _persist(s);
    }

    function _deploy(Cfg memory c) internal returns (Stack memory s) {
        s.cfg = new GuardrailConfig(c.owner, _caps());
        s.registry = new DeskRegistry();
        s.perf = new PerfScore(s.registry);
        s.oracle = new ChainlinkOracleAdapter(c.usdgDecimals, c.sequencerFeed, c.grace, c.owner);
        s.swap = new UniswapSwapAdapter(c.router, c.hop, c.owner);
        s.vault = new RWAVault(
            IERC20(c.usdg),
            "Aelix RWA Vault",
            "vAELIX",
            c.owner,
            s.cfg,
            s.oracle,
            s.swap,
            address(0)
        );
        s.exec = new SessionKeyExecutor(s.vault, c.owner);
        s.save = new AelixAutosave(s.vault);
    }

    function _wire(Stack memory s, Cfg memory c) internal {
        s.vault.setManager(address(s.exec));
        for (uint256 i; i < c.stocks.length; ++i) {
            s.oracle.setFeed(c.stocks[i], c.feeds[i], c.staleness);
            s.vault.allowToken(c.stocks[i]);
        }
        if (c.stocks.length > 0) {
            s.exec
                .grantSession(
                    c.agent, uint64(block.timestamp + 30 days), 0, 0, 0, false, false, c.stocks
                );
            // NOTE: granted with zero caps/permissions as a placeholder — set real
            // per-agent limits with a follow-up grantSession once funded.
        }
    }

    /// @dev Read a token's decimals on-chain; fall back to `def` if it has no code
    ///      (e.g. local simulation with a placeholder address).
    function _readDecimals(address token, uint8 def) internal view returns (uint8) {
        if (token.code.length == 0) return def; // placeholder in local simulation
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            return d;
        } catch {
            return def;
        }
    }

    function _caps() internal pure returns (Guardrails.RiskCaps memory) {
        return Guardrails.RiskCaps({
            perTradeBps: 1500,
            maxConcentrationBps: 2500,
            maxOpenPositions: 6,
            maxDailyOrders: 4,
            stopLossBps: 800,
            dailyLossHaltBps: 500,
            cashBufferBps: 1000
        });
    }

    function _report(Stack memory s, Cfg memory c) internal pure {
        console2.log("=============== Aelix PRODUCTION deploy ===============");
        console2.log("owner            ", c.owner);
        console2.log("USDG             ", c.usdg);
        console2.log("router           ", c.router);
        console2.log("GuardrailConfig  ", address(s.cfg));
        console2.log("DeskRegistry     ", address(s.registry));
        console2.log("PerfScore        ", address(s.perf));
        console2.log("ChainlinkOracle  ", address(s.oracle));
        console2.log("UniswapSwap      ", address(s.swap));
        console2.log("RWAVault (vAELIX) ", address(s.vault));
        console2.log("SessionKeyExec   ", address(s.exec));
        console2.log("AelixAutosave   ", address(s.save));
        console2.log("stocks allowlisted", c.stocks.length);
        console2.log("=======================================================");
    }

    function _persist(Stack memory s) internal {
        string memory o = "aelix";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "guardrailConfig", address(s.cfg));
        vm.serializeAddress(o, "deskRegistry", address(s.registry));
        vm.serializeAddress(o, "perfScore", address(s.perf));
        vm.serializeAddress(o, "oracle", address(s.oracle));
        vm.serializeAddress(o, "swapAdapter", address(s.swap));
        vm.serializeAddress(o, "vault", address(s.vault));
        vm.serializeAddress(o, "executor", address(s.exec));
        vm.serializeAddress(o, "autosave", address(s.save));
        string memory out = vm.serializeBytes32(
            o, "subject", keccak256(abi.encodePacked("aelix-vault:", address(s.vault)))
        );
        vm.writeJson(out, "./deployments/latest.json");
    }
}
