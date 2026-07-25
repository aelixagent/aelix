// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { VmSafe } from "forge-std/Vm.sol";
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
///           SEQUENCER_FEED   Chainlink L2 uptime feed (default 0 = disabled; RH Chain
///                            publishes none as of 2026-07-25)
///           SEQUENCER_GRACE  seconds                 (default 3600)
///           LIVENESS_FEEDS   comma-sep 24/7 CRYPTO feeds used as chain-liveness
///                            witnesses; stands in for the missing sequencer feed.
///                            Mainnet requires SEQUENCER_FEED or >=2 of these.
///           LIVENESS_BOUND   seconds                 (default 43200 = 12h)
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
        address[] livenessRefs;
        uint32 livenessBound;
        address[] stocks;
        address[] feeds;
        uint32 staleness;
        uint32 offHoursStaleness;
        /// @dev Total-assets ceiling in USDG native units. 0 == uncapped (refused on mainnet).
        uint256 depositCap;
        address owner;
        /// @dev The broadcasting key. Temporarily owns the contracts that {_wire} configures,
        ///      because only this account can sign during the broadcast. See {_deploy}.
        address deployer;
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
        // 24/7 crypto feeds acting as chain-liveness witnesses. See ChainlinkOracleAdapter.
        c.livenessRefs = vm.envOr("LIVENESS_FEEDS", ",", new address[](0));
        c.livenessBound = uint32(vm.envOr("LIVENESS_BOUND", uint256(43_200))); // 12h
        c.grace = vm.envOr("SEQUENCER_GRACE", uint256(3600));
        c.stocks = vm.envOr("STOCKS", ",", new address[](0));
        c.feeds = vm.envOr("FEEDS", ",", new address[](0));
        // Calibrated against the LIVE mainnet feeds (verified 2026-07-25): every Robinhood
        // equity feed publishes with heartbeat 86400s (24h) and a 0.5% deviation trigger,
        // 8 decimals. In-session a liquid name crosses 0.5% within minutes, so 4h is a
        // generous execution bound that still refuses a feed which has gone quiet. A 1h
        // bound (the previous default) is BELOW the feed's own heartbeat guarantee and
        // would reject legitimately quiet names.
        c.staleness = uint32(vm.envOr("FEED_STALENESS", uint256(14_400)));
        // 3.5 days: covers a Fri-close -> Tue-open gap (weekend + holiday). Measured on
        // mainnet on a Saturday, live feed ages were 24.6h-28.9h — already past the 24h
        // heartbeat — so the valuation bound must be multi-day or NAV breaks every weekend.
        c.offHoursStaleness = uint32(vm.envOr("FEED_STALENESS_OFFHOURS", uint256(302_400)));
        // Default 10,000 USDG (6-dec). An unaudited vault gets a bounded blast radius by
        // default; raising it is a deliberate owner action, not the absence of one.
        c.depositCap = vm.envOr("DEPOSIT_CAP", uint256(10_000e6));
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
        c.deployer = deployer;
        c.agent = vm.envOr("AGENT", deployer);
        require(c.stocks.length == c.feeds.length, "STOCKS/FEEDS length mismatch");

        // Refuse an unsafe posture on MAINNET (hard revert, not a console warning).
        _assertMainnetSafe(block.chainid, c, ownerEnv, deployer);

        console2.log("chainId", block.chainid); // 46630 testnet, 4663 mainnet
        console2.log("USDG decimals (live)", c.usdgDecimals);

        vm.startBroadcast(pk);
        Stack memory s = _deploy(c);
        _wire(s, c);
        _handover(s, c);
        vm.stopBroadcast();

        _report(s, c);
        _persist(s, c);
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

        // --- Chain-liveness: a sequencer feed OR a 24/7 quorum, never neither ----------
        // Robinhood Chain publishes no Chainlink sequencer uptime feed (verified
        // 2026-07-25: 56 feeds in the directory, zero uptime entries), so requiring one
        // outright made a mainnet deploy impossible. Instead, demand at least one working
        // liveness mechanism. Silently allowing neither is the one thing forbidden.
        bool haveSeq = c.sequencerFeed != address(0);
        bool haveQuorum = c.livenessRefs.length > 0;
        require(haveSeq || haveQuorum, "MAINNET: set SEQUENCER_FEED or LIVENESS_FEEDS");

        if (haveSeq) {
            require(c.sequencerFeed.code.length > 0, "MAINNET: SEQUENCER_FEED has no code");
            (, int256 seqAnswer, uint256 seqStartedAt,,) =
                IAggregatorV3(c.sequencerFeed).latestRoundData();
            require(seqStartedAt != 0, "MAINNET: SEQUENCER_FEED round uninitialized");
            require(seqAnswer == 0, "MAINNET: sequencer reported DOWN, refusing to deploy");
            require(c.grace >= 1800, "MAINNET: SEQUENCER_GRACE too short (>= 1800s)");
        }

        if (haveQuorum) {
            // More than one witness: a single quiet feed must not be able to halt the vault.
            require(c.livenessRefs.length >= 2, "MAINNET: LIVENESS_FEEDS needs >= 2 refs");
            require(c.livenessBound >= 3600, "MAINNET: LIVENESS_BOUND too short (>= 3600s)");
            require(c.livenessBound <= 1 days, "MAINNET: LIVENESS_BOUND too permissive (<= 1d)");
            // Freshness must match the RUNTIME quorum rule, which needs only ONE live
            // witness (ChainlinkOracleAdapter._checkLiveness returns on the first fresh ref).
            // Requiring every ref fresh here was strictly stricter than the contract itself,
            // so one quiet-but-healthy feed would refuse a deploy the vault would have run
            // fine with. Count instead, and demand at least one.
            uint256 fresh;
            for (uint256 i; i < c.livenessRefs.length; ++i) {
                address r = c.livenessRefs[i];
                require(r.code.length > 0, "MAINNET: liveness ref has no code");
                (, int256 a,, uint256 u,) = IAggregatorV3(r).latestRoundData();
                require(a > 0 && u != 0, "MAINNET: liveness ref not answering");
                if (block.timestamp - u <= c.livenessBound) ++fresh;
                for (uint256 j; j < i; ++j) {
                    require(r != c.livenessRefs[j], "MAINNET: duplicate liveness ref");
                }
                // A liveness ref that is also a position's price feed is not an independent
                // witness — it goes stale with the market it prices.
                for (uint256 j; j < c.feeds.length; ++j) {
                    require(r != c.feeds[j], "MAINNET: liveness ref must not be an equity feed");
                }
            }
            // Zero fresh witnesses means the vault would fail closed from block one — either
            // 24/5 equity feeds were passed as 24/7 refs, or the chain really is stalled.
            // Either way, do not deploy into it.
            require(
                fresh > 0,
                "MAINNET: no liveness ref is fresh (equity feeds used as 24/7 refs, or chain stalled)"
            );
        }

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
        // Live mainnet feeds publish on a 24h heartbeat / 0.5% deviation. A bound under an
        // hour would reject a quiet-but-healthy feed and brick the trade path.
        // An unaudited vault must launch with a bounded ceiling. The checklist used to say
        // "set a small TVL cap" while no such mechanism existed; now it exists and is enforced.
        require(c.depositCap > 0, "MAINNET: set DEPOSIT_CAP (staged rollout; 0 = uncapped is refused)");

        require(c.staleness >= 3600, "MAINNET: FEED_STALENESS too short (>= 3600s)");
        require(c.offHoursStaleness >= c.staleness, "MAINNET: off-hours bound < session bound");
        // Measured on a Saturday, live feed ages already exceeded 24h. Anything under 3 days
        // means NAV, deposits and redemptions break every weekend.
        require(c.offHoursStaleness >= 3 days, "MAINNET: FEED_STALENESS_OFFHOURS too short (>= 3d, must survive a weekend)");
        // The off-hours bound is the window in which the vault will mint and redeem against
        // a price held over a closed session. It must cover a weekend + holiday but must not
        // become an open-ended licence to transact on a dead feed.
        require(c.offHoursStaleness <= 7 days, "MAINNET: FEED_STALENESS_OFFHOURS too permissive (<= 7d)");
    }

    /// @dev Ownership during deploy is deliberately split.
    ///
    ///      `_wire` must call onlyOwner functions (`setManager`, `setLiveness`, `setFeed`,
    ///      `allowToken`, `grantSession`) and the only account that can sign during
    ///      `vm.startBroadcast` is the DEPLOYER. Constructing those three contracts already
    ///      owned by the multisig makes every wiring call revert — after eight contract
    ///      deployments have already been paid for. So vault / oracle / executor are born
    ///      deployer-owned, wired, then handed over in {_handover}.
    ///
    ///      GuardrailConfig and the swap adapter are never touched by `_wire`, so they are
    ///      born owned by the multisig and never pass through deployer control at all —
    ///      which matters most for GuardrailConfig, the contract holding the risk caps.
    function _deploy(Cfg memory c) internal returns (Stack memory s) {
        s.cfg = new GuardrailConfig(c.owner, _caps());
        s.registry = new DeskRegistry();
        s.perf = new PerfScore(s.registry);
        s.oracle =
            new ChainlinkOracleAdapter(c.usdgDecimals, c.sequencerFeed, c.grace, c.deployer);
        s.swap = new UniswapSwapAdapter(c.router, c.hop, c.owner);
        s.vault = new RWAVault(
            IERC20(c.usdg),
            "Aelix RWA Vault",
            "vAELIX",
            c.deployer,
            s.cfg,
            s.oracle,
            s.swap,
            address(0)
        );
        s.exec = new SessionKeyExecutor(s.vault, c.deployer);
        s.save = new AelixAutosave(s.vault);
    }

    /// @dev Hand the three wired contracts to the multisig. All are `Ownable2Step`, so this
    ///      only STARTS the transfer: the deployer stays owner until the Safe calls
    ///      `acceptOwnership()` on each. That is a feature, not a gap — a typo'd OWNER cannot
    ///      lock the stack away from you. But the handover is NOT complete until those three
    ///      acceptances land, and {_report} prints the exact calls.
    function _handover(Stack memory s, Cfg memory c) internal {
        if (c.owner == c.deployer) return; // preview/testnet run: nothing to hand over
        s.vault.transferOwnership(c.owner);
        s.oracle.transferOwnership(c.owner);
        s.exec.transferOwnership(c.owner);
    }

    function _wire(Stack memory s, Cfg memory c) internal {
        s.vault.setManager(address(s.exec));
        // Staged rollout, applied at deploy rather than left as a manual follow-up: an
        // unaudited vault must not be able to accept unbounded deposits, and a checklist item
        // is not a control. Set DEPOSIT_CAP=0 to launch uncapped (mainnet refuses that).
        if (c.depositCap > 0) {
            s.vault.setDepositCap(c.depositCap);
        }
        if (c.livenessRefs.length > 0) {
            s.oracle.setLiveness(c.livenessRefs, c.livenessBound);
        }
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

    function _report(Stack memory s, Cfg memory c) internal view {
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
        console2.log("deposit cap (USDG)", c.depositCap);
        console2.log("=======================================================");

        if (c.owner == c.deployer) return;
        // The handover is HALF DONE at this point. Ownable2Step means the deployer still owns
        // vault/oracle/executor until the multisig accepts. Until these three land, the hot
        // deploy key retains control of the stack — this is the single most important
        // post-deploy step, so print it as an explicit checklist rather than burying it.
        console2.log("");
        console2.log("!! ACTION REQUIRED - ownership transfer is PENDING, not complete !!");
        console2.log("The deployer still owns vault/oracle/executor until the Safe calls");
        console2.log("acceptOwnership() on each. Execute these THREE txs from the Safe:");
        console2.log("  1. acceptOwnership() on RWAVault        ", address(s.vault));
        console2.log("  2. acceptOwnership() on ChainlinkOracle ", address(s.oracle));
        console2.log("  3. acceptOwnership() on SessionKeyExec  ", address(s.exec));
        console2.log("Then confirm owner() == the Safe on all three, and retire the deployer key.");
        console2.log("GuardrailConfig and UniswapSwapAdapter are ALREADY owned by the Safe.");
        console2.log("=======================================================");
    }

    /// @dev Writes the address book the dashboard/bridge reads.
    ///      Skipped on a simulation-only run: `forge script` without `--broadcast` still
    ///      executes everything, so persisting there would overwrite `latest.json` with
    ///      addresses that were never deployed — including on the dry-run that the operator
    ///      then declines. The dashboard would point at contracts that do not exist.
    function _persist(Stack memory s, Cfg memory c) internal {
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            console2.log("(simulation) deployments/latest.json left untouched");
            return;
        }
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
        // bridge/index.mjs dereferences `usdg` unconditionally to read the vault's cash
        // balance; omitting it crashed the dashboard against a production deploy.
        vm.serializeAddress(o, "usdg", c.usdg);
        vm.serializeAddress(o, "owner", c.owner);
        vm.serializeAddress(o, "agent", c.agent);

        // `subject` MUST be subjectFor(attester, label), not the bare label.
        // DeskRegistry.attestSelf writes _selfLog[subjectFor(msg.sender, label)] and every
        // read resolves the same way, so storing the raw label points the dashboard at a
        // namespace no key can ever write to — the track record would sit at zero forever and
        // `bridge --attest` would reject every wallet. The attester is the AGENT: the deployer
        // key is retired right after handover, so it must not be the one bound here.
        bytes32 label = keccak256(abi.encodePacked("aelix-vault:", address(s.vault)));
        vm.serializeBytes32(o, "label", label);
        string memory out =
            vm.serializeBytes32(o, "subject", s.registry.subjectFor(c.agent, label));
        vm.writeJson(out, "./deployments/latest.json");
    }
}
