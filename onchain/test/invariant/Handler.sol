// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { RWAVault } from "../../src/RWAVault.sol";
import { MockERC20, MockOracle, MockSwapAdapter } from "../../src/mocks/Mocks.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Drives the vault with bounded random actions for invariant testing. It IS
///         the vault manager, so it can trade; deposits/withdrawals go through a small
///         fixed set of actors whose share values the invariants sum.
contract Handler is Test {
    RWAVault public vault;
    MockERC20 public usdg;
    MockERC20 public stk;
    MockOracle public oracle;
    MockSwapAdapter public adapter;

    address[3] public actors = [address(0xA1), address(0xA2), address(0xA3)];

    constructor(RWAVault v, MockERC20 u, MockERC20 s, MockOracle o, MockSwapAdapter a) {
        vault = v;
        usdg = u;
        stk = s;
        oracle = o;
        adapter = a;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function deposit(uint256 amt, uint256 seed) public {
        amt = bound(amt, 1e6, 1_000e18);
        address a = _actor(seed);
        usdg.mint(a, amt);
        vm.startPrank(a);
        usdg.approve(address(vault), amt);
        vault.deposit(amt, a);
        vm.stopPrank();
    }

    function withdraw(uint256 amt, uint256 seed) public {
        address a = _actor(seed);
        uint256 max = vault.maxWithdraw(a);
        if (max == 0) return;
        amt = bound(amt, 1, max);
        vm.prank(a);
        vault.withdraw(amt, a, a);
    }

    function buy(uint256 amt) public {
        uint256 nav = vault.navUsdg();
        if (nav == 0) return;
        // Stay under the 15% per-trade cap so many buys actually go through.
        amt = bound(amt, 1e15, (nav * 14) / 100);
        uint256 price = oracle.priceOf(address(stk));
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: amt,
            minAmountOut: 0,
            stopPriceE18: (price * 90) / 100, // valid stop below market
            leftSideException: false
        });
        try vault.executeTrade(o) { } catch { }
    }

    function sell(uint256 amt) public {
        uint256 held = stk.balanceOf(address(vault));
        if (held == 0) return;
        amt = bound(amt, 1, held);
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: false,
            amountIn: amt,
            minAmountOut: 0,
            stopPriceE18: 0,
            leftSideException: false
        });
        try vault.executeTrade(o) { } catch { }
    }

    function newDay(uint256 jump) public {
        jump = bound(jump, 1 days, 3 days);
        vm.warp(block.timestamp + jump);
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }
}
