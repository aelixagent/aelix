// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import { IAggregatorV3 } from "../src/interfaces/IAggregatorV3.sol";
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
///           FEED_STALENESS   in-session heartbeat sec (default 3600) — trade path
///           FEED_STALENESS_OFFHOURS  valuation bound  (default 302400 = 3.5d) — NAV path,
///                            must cover a weekend + holiday on a 24/5 equity feed
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
        uint32 offHoursStaleness;
        address owner;
        address agent;
    }

    /// @dev Robinhood Chain MAINNET — where real funds live. Deploys here are gated.
    uint256 internal constant MAINNET_CHAIN_ID = 4663;
    /// @dev Placeholder periphery: valid only for local simulation / an unconfigured run.
    ///      A mainnet deploy that still points at these must fail (see {_assertMainnetSafe}).
    address internal constant PLACEHOLDER_USDG = 0x1111111111111111111111111111111111111111;
    address internal constant PLACEHOLDER_ROUTER = 0x2222222222222222222222222222222222222222;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        Cfg memory c;
        c.usdg = vm.envOr("USDG", PLACEHOLDER_USDG);
        // Read decimals LIVE from the token — the canonical Robinhood Chain USDG is
        // 6-dec, but a 18-dec look-alike ("Global Dollar") exists at a different
        // address (a 1e12 accounting trap). Never trust the env/symbol; read on-chain.
        c.usdgDecimals = _readDecimals(c.usdg, uint8(vm.envOr("USDG_DECIMALS", uint256(6))));
        c.router = vm.envOr("ROUTER", PLACEHOLDER_ROUTER);
        c.hop = vm.envOr("HOP_TOKEN", address(0));
        c.sequencerFeed = vm.envOr("SEQUENCER_FEED", address(0));
        c.grace = vm.envOr("SEQUENCER_GRACE", uint256(3600));
        c.stocks = vm.envOr("STOCKS", ",", new address[](0));
        c.feeds = vm.envOr("FEEDS", ",", new address[](0));
        c.staleness = uint32(vm.envOr("FEED_STALENESS", uint256(3600)));
        // 3.5 days: long enough for a Fri-close -> Tue-open gap (weekend + holiday) on a
        // 24/5 tokenized-equity feed, short enough to still fail closed on a dead feed.
        c.offHoursStaleness = uint32(vm.envOr("FEED_STALENESS_OFFHOURS", uint256(302_400)));
        // Ownership goes to OWNER (intended to be a multisig/timelock — see the NatSpec).
        // If OWNER is unset we fall back to the deployer EOA but LOUDLY warn: a single hot
        // key owning the whole stack is not an acceptable production posture.
        address ownerEnv = vm.envOr("OWNER", address(0));
        if (ownerEnv == address(0)) {
            c.owner = deployer;
            console2.log(
                "WARNING: OWNER unset - deployer EOA will own ALL contracts. Set OWNER to a multisig/timelock for production."
            );
        } else {
            c.owner = ownerEnv;
        }
        c.agent = vm.envOr("AGENT", deployer);
        require(c.stocks.length == c.feeds.length, "STOCKS/FEEDS length mismatch");

        // Refuse an unsafe posture on MAINNET (hard revert, not a console warning).
        _assertMainnetSafe(block.chainid, c, ownerEnv, deployer);

        console2.log("chainId", block.chainid); // 46630 testnet, 4663 mainnet
        console2.log("USDG decimals (live)", c.usdgDecimals);

        vm.startBroadcast(pk);
        Stack memory s = _deploy(c);
        _wire(s, c);
        vm.stopBroadcast();

        _report(s, c);
        _persist(s);
    }

    /// @dev Refuse an UNSAFE deploy on Robinhood Chain mainnet (real funds). Each posture
    ///      below is acceptable for a testnet preview but must never reach mainnet. On any
    ///      non-mainnet chain this is a no-op so the preview flow stays lenient.
    ///
    ///      `view`, not `pure`: several checks probe live chain state (does the address hold
    ///      code, does the feed answer). An address typo that silently deploys a vault
    ///      pointed at an empty address is exactly the class of mistake worth spending gas
    ///      to prevent.
    function _assertMainnetSafe(uint256 chainId, Cfg memory c, address ownerEnv, address deployer)
        internal
        view
    {
        if (chainId != MAINNET_CHAIN_ID) return;

        // --- Ownership: a hot EOA must never own the stack -----------------------------
        require(ownerEnv != address(0), "MAINNET: set OWNER to a multisig/timelock");
        // The old check accepted any non-zero address, so a plain EOA passed a require
        // whose message said "multisig". A Safe/timelock is a contract; enforce that.
        require(ownerEnv.code.length > 0, "MAINNET: OWNER must be a contract (multisig/timelock), not an EOA");
        require(ownerEnv != deployer, "MAINNET: OWNER must not be the deployer key");

        // --- Agent key: scoped, and never the deployer ---------------------------------
        // AGENT defaults to `deployer`. On mainnet that would hand the desk's hot trading
        // key the same key that deployed the stack. Must be set explicitly and distinctly.
        require(c.agent != deployer, "MAINNET: set AGENT to a dedicated key, not the deployer");
        require(c.agent != ownerEnv, "MAINNET: AGENT must not be the owner multisig");

        // --- Sequencer uptime feed: present AND actually answering ---------------------
        require(c.sequencerFeed != address(0), "MAINNET: set SEQUENCER_FEED (L2 uptime)");
        require(c.sequencerFeed.code.length > 0, "MAINNET: SEQUENCER_FEED has no code");
        (, int256 seqAnswer, uint256 seqStartedAt,,) =
            IAggregatorV3(c.sequencerFeed).latestRoundData();
        require(seqStartedAt != 0, "MAINNET: SEQUENCER_FEED round uninitialized");
        require(seqAnswer == 0, "MAINNET: sequencer reported DOWN, refusing to deploy");
        require(c.grace >= 1800, "MAINNET: SEQUENCER_GRACE too short (>= 1800s)");

        // --- USDG: the documented look-alike trap -------------------------------------
        require(c.usdg != PLACEHOLDER_USDG, "MAINNET: set real USDG");
        require(c.usdg.code.length > 0, "MAINNET: USDG has no code");
        // A look-alike 18-decimal "Global Dollar" USDG exists. `usdgDecimals` is read live
        // from the token, so pinning it to 6 here rejects the impostor by construction —
        // the symbol is never trusted.
        require(c.usdgDecimals == 6, "MAINNET: USDG decimals != 6, wrong token (18-dec look-alike?)");

        // --- Router -------------------------------------------------------------------
        require(c.router != PLACEHOLDER_ROUTER, "MAINNET: set real ROUTER");
        require(c.router.code.length > 0, "MAINNET: ROUTER has no code");
        if (c.hop != address(0)) {
            require(c.hop.code.length > 0, "MAINNET: HOP_TOKEN has no code");
        }

        // --- Stock tokens and their feeds ---------------------------------------------
        require(c.stocks.length > 0, "MAINNET: STOCKS/FEEDS required");
        for (uint256 i; i < c.stocks.length; ++i) {
            require(c.stocks[i] != address(0), "MAINNET: zero Stock Token");
            require(c.stocks[i].code.length > 0, "MAINNET: Stock Token has no code");
            require(c.feeds[i] != address(0), "MAINNET: zero feed");
            require(c.feeds[i].code.length > 0, "MAINNET: feed has no code");
            require(c.stocks[i] != c.usdg, "MAINNET: USDG listed as a Stock Token");
            // A feed wired to the wrong token silently misprices a whole position; a
            // duplicate entry means one of the intended tokens is missing its own feed.
            for (uint256 j; j < i; ++j) {
                require(c.stocks[i] != c.stocks[j], "MAINNET: duplicate Stock Token");
                require(c.feeds[i] != c.feeds[j], "MAINNET: duplicate feed (wrong token wired?)");
            }
            // The feed must answer with a positive, initialized round before we trust it.
            (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(c.feeds[i]).latestRoundData();
            require(answer > 0, "MAINNET: feed answer <= 0");
            require(updatedAt != 0, "MAINNET: feed round uninitialized");
        }

        // --- Staleness bounds ---------------------------------------------------------
        require(c.staleness >= 60, "MAINNET: FEED_STALENESS too short");
        require(c.offHoursStaleness >= c.staleness, "MAINNET: off-hours bound < session bound");
        // The off-hours bound is the window in which the vault will mint and redeem against
        // a price held over a closed session. It must cover a weekend + holiday but must not
        // become an open-ended licence to transact on a dead feed.
        require(c.offHoursStaleness <= 7 days, "MAINNET: FEED_STALENESS_OFFHOURS too permissive (<= 7d)");
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
            s.oracle.setFeed(c.stocks[i], c.feeds[i], c.staleness, c.offHoursStaleness);
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
