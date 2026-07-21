// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { RWAVault } from "../../src/RWAVault.sol";
import { GuardrailConfig } from "../../src/GuardrailConfig.sol";
import { Guardrails } from "../../src/libraries/Guardrails.sol";
import { IPriceOracle, ISwapAdapter } from "../../src/interfaces/IVaultPeriphery.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockERC20, MockOracle, MockSwapAdapter } from "../../src/mocks/Mocks.sol";
import { Handler } from "./Handler.sol";

/// @notice Stateful fuzzing: no matter what sequence of deposits, withdrawals, and
///         guardrail-checked trades the desk runs, the vault stays internally
///         consistent and solvent for every share.
contract VaultInvariantTest is Test {
    MockERC20 usdg;
    MockERC20 stk;
    MockOracle oracle;
    MockSwapAdapter adapter;
    GuardrailConfig cfg;
    RWAVault vault;
    Handler handler;

    address HUMAN = address(0xB00D);

    function setUp() public {
        vm.warp(2_000_000_000);
        usdg = new MockERC20("USDG", "USDG");
        stk = new MockERC20("Stock", "vSTK");
        oracle = new MockOracle();
        oracle.setPrice(address(stk), 50e18);
        adapter = new MockSwapAdapter(oracle);
        cfg = new GuardrailConfig(
            HUMAN,
            Guardrails.RiskCaps({
                perTradeBps: 1500,
                maxConcentrationBps: 2500,
                maxOpenPositions: 6,
                maxDailyOrders: 4,
                stopLossBps: 800,
                dailyLossHaltBps: 500,
                cashBufferBps: 1000
            })
        );
        vault = new RWAVault(
            IERC20(address(usdg)),
            "Aelix RWA Vault",
            "vAELIX",
            HUMAN,
            cfg,
            IPriceOracle(address(oracle)),
            ISwapAdapter(address(adapter)),
            address(0)
        );

        handler = new Handler(vault, usdg, stk, oracle, adapter);

        vm.startPrank(HUMAN);
        vault.allowToken(address(stk));
        vault.setManager(address(handler)); // the handler drives trading
        vm.stopPrank();

        // Deep swap liquidity.
        usdg.mint(address(adapter), 1e30);
        stk.mint(address(adapter), 1e30);

        targetContract(address(handler));
    }

    /// NAV is exactly cash + the value of the single held Stock Token — accounting
    /// never drifts under any action sequence.
    function invariant_accountingConsistent() public view {
        uint256 nav = vault.navUsdg();
        uint256 recomputed = usdg.balanceOf(address(vault)) + vault.positionValue(address(stk));
        assertEq(nav, recomputed);
    }

    /// Shares are never left backed by nothing (classic ERC4626 inflation footgun).
    function invariant_noSharesWithoutAssets() public view {
        if (vault.totalSupply() > 0) {
            assertGt(vault.totalAssets(), 0);
        }
    }

    /// The total value redeemable by all shareholders never exceeds the vault's
    /// assets — i.e. the vault is always solvent for every share it has minted.
    function invariant_solventForAllHolders() public view {
        uint256 claims;
        for (uint256 i; i < handler.actorCount(); ++i) {
            claims += vault.convertToAssets(vault.balanceOf(handler.actors(i)));
        }
        // convertToAssets rounds down, so the sum can never exceed totalAssets.
        assertLe(claims, vault.totalAssets() + 3);
    }

    /// The desk can never open more distinct positions than the cap allows.
    function invariant_openPositionsWithinCap() public view {
        assertLe(vault.openPositions(), cfg.caps().maxOpenPositions);
    }
}
