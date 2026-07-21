// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Guardrails } from "../src/libraries/Guardrails.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { DeskRegistry } from "../src/DeskRegistry.sol";
import { PerfScore } from "../src/PerfScore.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { SessionKeyExecutor } from "../src/SessionKeyExecutor.sol";
import { AelixAutosave } from "../src/AelixAutosave.sol";
import { IPriceOracle, ISwapAdapter } from "../src/interfaces/IVaultPeriphery.sol";
import { MockERC20, MockOracle, MockSwapAdapter } from "../src/mocks/Mocks.sol";

/// @title Deploy — full Aelix on-chain stack for Robinhood Chain (testnet demo)
/// @notice Deploys and fully wires all six contracts, then seeds a live demo:
///         a deposit, one guardrail-checked agent trade, and two desk-run
///         attestations — so the dashboard's on-chain panels light up immediately.
///
/// @dev    Periphery (USDG, a Stock Token, price oracle, swap adapter) is DEMO/mock
///         here. For a real deployment, point the vault at Robinhood Chain's USDG, a
///         Chainlink-backed oracle adapter, a Uniswap/Pleiades swap adapter, and a
///         real Stock Token.
///
///         Testnet:   forge script script/Deploy.s.sol \
///                      --rpc-url $RH_TESTNET_RPC --broadcast --private-key $PRIVATE_KEY
///         Local sim: forge script script/Deploy.s.sol
contract Deploy is Script {
    struct Stack {
        GuardrailConfig cfg;
        DeskRegistry registry;
        PerfScore perf;
        MockERC20 usdg;
        MockERC20 stk;
        MockOracle oracle;
        MockSwapAdapter adapter;
        RWAVault vault;
        SessionKeyExecutor exec;
        AelixAutosave save;
        address deployer; // attester of the seeded track record (self-namespace)
    }

    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address deployer = pk != 0 ? vm.addr(pk) : msg.sender;
        address agent = vm.envOr("AGENT", deployer);

        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        Stack memory s = _deploy(deployer);
        _wireAndSeed(s, deployer, agent);

        vm.stopBroadcast();
        _report(s);
        _persist(s);
    }

    /// @dev Write deployed addresses to deployments/latest.json for the bridge.
    function _persist(Stack memory s) internal {
        string memory o = "aelix";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "guardrailConfig", address(s.cfg));
        vm.serializeAddress(o, "deskRegistry", address(s.registry));
        vm.serializeAddress(o, "perfScore", address(s.perf));
        vm.serializeAddress(o, "vault", address(s.vault));
        vm.serializeAddress(o, "executor", address(s.exec));
        vm.serializeAddress(o, "autosave", address(s.save));
        vm.serializeAddress(o, "usdg", address(s.usdg));
        vm.serializeAddress(o, "stock", address(s.stk));
        vm.serializeAddress(o, "oracle", address(s.oracle));
        vm.serializeAddress(o, "swapAdapter", address(s.adapter));
        string memory out = vm.serializeBytes32(o, "subject", _subjectOf(s));
        vm.writeJson(out, "./deployments/latest.json");
    }

    function _defaultCaps() internal pure returns (Guardrails.RiskCaps memory) {
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

    function _deploy(address owner) internal returns (Stack memory s) {
        s.deployer = owner;
        s.cfg = new GuardrailConfig(owner, _defaultCaps());
        s.registry = new DeskRegistry();
        s.perf = new PerfScore(s.registry);

        // DEMO periphery — replace with real Robinhood Chain addresses in prod.
        s.usdg = new MockERC20("USD Global (demo)", "USDG");
        s.stk = new MockERC20("Aelix Demo Stock", "vNVDA");
        s.oracle = new MockOracle();
        s.oracle.setPrice(address(s.stk), 50e18);
        s.adapter = new MockSwapAdapter(s.oracle);

        s.vault = new RWAVault(
            IERC20(address(s.usdg)),
            "Aelix RWA Vault",
            "vAELIX",
            owner,
            s.cfg,
            IPriceOracle(address(s.oracle)),
            ISwapAdapter(address(s.adapter)),
            address(0)
        );
        s.exec = new SessionKeyExecutor(s.vault, owner);
        s.save = new AelixAutosave(s.vault);
    }

    function _wireAndSeed(Stack memory s, address deployer, address agent) internal {
        s.vault.allowToken(address(s.stk));
        s.vault.setManager(address(s.exec));

        address[] memory toks = new address[](1);
        toks[0] = address(s.stk);
        s.exec
            .grantSession(
                agent, uint64(block.timestamp + 30 days), 1500e18, 100, 50_000e18, true, true, toks
            );

        // Deep demo liquidity + a funded depositor.
        s.usdg.mint(address(s.adapter), 1_000_000e18);
        s.stk.mint(address(s.adapter), 1_000_000e18);
        s.usdg.mint(deployer, 10_000e18);
        s.usdg.approve(address(s.vault), type(uint256).max);
        s.vault.deposit(10_000e18, deployer);

        // One guardrail-checked buy via the session key (~10% of NAV).
        if (agent == deployer) {
            s.exec
                .trade(
                    RWAVault.TradeOrder({
                        stockToken: address(s.stk),
                        isBuy: true,
                        amountIn: 1000e18,
                        minAmountOut: 0,
                        stopPriceE18: 46e18,
                        leftSideException: false
                    })
                );
        }

        // Two desk-run attestations so PerfScore has a series. Seed via the SQUAT-PROOF
        // self-namespace (attestSelf) — canonical reads (PerfScore) only see the self-log
        // after M6, so a raw attest() here would be invisible to every consumer.
        bytes32 label = _label(address(s.vault));
        s.registry.attestSelf(label, 1, 10_000e18, int256(0), keccak256("run-1"), "");
        s.registry.attestSelf(label, 2, 10_250e18, int256(250e18), keccak256("run-2"), "");
    }

    function _label(address vault) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("aelix-vault:", vault));
    }

    /// @dev The canonical, squat-proof subject the deployer seeded — derived from the
    ///      attester address, matching what PerfScore/UI must query.
    function _subjectOf(Stack memory s) internal view returns (bytes32) {
        return s.registry.subjectFor(s.deployer, _label(address(s.vault)));
    }

    function _report(Stack memory s) internal view {
        (int256 tr, uint256 dd, uint256 n) = s.perf.headline(_subjectOf(s));
        console2.log("=============== Aelix on-chain stack ===============");
        console2.log("GuardrailConfig  ", address(s.cfg));
        console2.log("DeskRegistry     ", address(s.registry));
        console2.log("PerfScore        ", address(s.perf));
        console2.log("RWAVault (vAELIX) ", address(s.vault));
        console2.log("SessionKeyExec   ", address(s.exec));
        console2.log("AelixAutosave   ", address(s.save));
        console2.log("-- demo periphery (replace in prod) --");
        console2.log("USDG (demo)      ", address(s.usdg));
        console2.log("StockToken(demo) ", address(s.stk));
        console2.log("Oracle (demo)    ", address(s.oracle));
        console2.log("SwapAdapter(demo)", address(s.adapter));
        console2.log("-- live demo state --");
        console2.log("vault NAV (USDG) ", s.vault.navUsdg());
        console2.log("total shares     ", s.vault.totalSupply());
        console2.log("attestations     ", n);
        console2.log("totalReturn (bps)", tr);
        console2.log("maxDrawdown (bps)", dd);
        console2.log("=====================================================");
    }
}
