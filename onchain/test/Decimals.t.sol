// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { Guardrails } from "../src/libraries/Guardrails.sol";
import { IPriceOracle, ISwapAdapter } from "../src/interfaces/IVaultPeriphery.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockERC20D, MockOracle, MockSwapAdapter } from "../src/mocks/Mocks.sol";

/// @notice Proves the vault values correctly when USDG is NOT 18 decimals (e.g. 6)
///         and the Stock Token is NOT 18 decimals (e.g. 8). Robinhood Chain USDG may
///         well be 6-decimal, so this must hold before mainnet.
contract DecimalsTest is Test {
    MockERC20D usdg; // 6 decimals
    MockERC20D stk; //  8 decimals
    MockOracle oracle;
    MockSwapAdapter adapter;
    GuardrailConfig cfg;
    RWAVault vault;

    address HUMAN = address(0xB00D);
    address ALICE = address(0xA11CE);

    function setUp() public {
        vm.warp(2_000_000_000);
        usdg = new MockERC20D("USD Global", "USDG", 6);
        stk = new MockERC20D("Stock Token", "vSTK", 8);
        oracle = new MockOracle();
        // ONE whole token worth 50 USDG => 50 in USDG-native (6-dec) units = 50e6.
        oracle.setPrice(address(stk), 50e6);
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
        vm.prank(HUMAN);
        vault.allowToken(address(stk));
    }

    function test_cachesTokenDecimals() public view {
        assertEq(vault.tokenDecimals(address(stk)), 8);
    }

    function test_positionValue_mixedDecimals() public {
        // 2 whole tokens (8-dec) => 2e8 smallest units, at 50 USDG each = 100 USDG (6-dec).
        stk.mint(address(vault), 2e8);
        assertEq(vault.positionValue(address(stk)), 100e6);
    }

    function test_nav_mixedDecimals() public {
        stk.mint(address(vault), 2e8); // 100 USDG worth
        usdg.mint(address(vault), 500e6); // 500 USDG cash
        assertEq(vault.navUsdg(), 600e6);
    }

    function test_deposit_6decAsset_sharesMatch() public {
        usdg.mint(ALICE, 1000e6);
        vm.startPrank(ALICE);
        usdg.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(1000e6, ALICE);
        vm.stopPrank();

        assertEq(shares, 1000e6); // 1:1 into an empty vault
        assertEq(vault.totalAssets(), 1000e6);
        assertEq(vault.navUsdg(), 1000e6);
    }

    function test_sharePrice_reflectsAppreciation_mixedDecimals() public {
        // Deposit 1000 USDG, then the desk holds 400 USDG of stock that doubles.
        usdg.mint(ALICE, 1000e6);
        vm.startPrank(ALICE);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(1000e6, ALICE);
        vm.stopPrank();

        // Simulate 600 cash + 8 tokens (=400 USDG) held by the vault.
        // (Move 400 USDG out of the vault's cash to mimic it being spent on stock.)
        vm.prank(address(vault));
        require(usdg.transfer(address(0xdead), 400e6), "x");
        stk.mint(address(vault), 8e8); // 8 tokens * 50 = 400 USDG
        assertEq(vault.navUsdg(), 1000e6); // 600 cash + 400 stock

        oracle.setPrice(address(stk), 100e6); // token doubles -> stock now 800 USDG
        assertEq(vault.navUsdg(), 1400e6); // 600 + 800
        // Alice's shares now worth ~1400 USDG (share price up 40%); 1-wei ERC4626 rounding.
        assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(ALICE)), 1400e6, 2);
    }
}
