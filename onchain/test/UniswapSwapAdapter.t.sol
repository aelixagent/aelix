// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { UniswapSwapAdapter } from "../src/UniswapSwapAdapter.sol";
import { MockERC20, MockV2Router } from "../src/mocks/Mocks.sol";

contract UniswapSwapAdapterTest is Test {
    MockERC20 usdg;
    MockERC20 stk;
    MockERC20 weth;
    MockV2Router router;
    UniswapSwapAdapter adapter;

    address HUMAN = address(0xB00D);
    address VAULT = address(0x7A17); // acts as the caller (the vault)

    function setUp() public {
        usdg = new MockERC20("USDG", "USDG");
        stk = new MockERC20("Stock", "vSTK");
        weth = new MockERC20("Wrapped ETH", "WETH");
        router = new MockV2Router();
        adapter = new UniswapSwapAdapter(address(router), address(0), HUMAN);

        // Fund the router with output liquidity and the vault with input.
        stk.mint(address(router), 1_000_000e18);
        usdg.mint(address(router), 1_000_000e18);
        usdg.mint(VAULT, 10_000e18);
    }

    function _swap(address tin, address tout, uint256 amtIn, uint256 minOut)
        internal
        returns (uint256)
    {
        vm.startPrank(VAULT);
        usdg.approve(address(adapter), type(uint256).max);
        stk.approve(address(adapter), type(uint256).max);
        uint256 out = adapter.swap(tin, tout, amtIn, minOut, VAULT);
        vm.stopPrank();
        return out;
    }

    function test_directSwap_returnsOutputToRecipient() public {
        router.setRate(0.02e18); // 1 USDG -> 0.02 STK (i.e. $50/token)
        uint256 out = _swap(address(usdg), address(stk), 1000e18, 0);
        assertEq(out, 20e18); // 1000 * 0.02
        assertEq(stk.balanceOf(VAULT), 20e18);
        assertEq(router.lastPathLength(), 2); // direct path
    }

    function test_slippage_reverts_whenBelowMinOut() public {
        router.setRate(0.02e18);
        vm.startPrank(VAULT);
        usdg.approve(address(adapter), type(uint256).max);
        vm.expectRevert(); // router reverts INSUFFICIENT_OUTPUT_AMOUNT
        adapter.swap(address(usdg), address(stk), 1000e18, 25e18, VAULT); // want 25, get 20
        vm.stopPrank();
    }

    function test_hopRouting_usesThreeHopPath() public {
        vm.prank(HUMAN);
        adapter.setHopToken(address(weth));
        router.setRate(0.02e18);
        _swap(address(usdg), address(stk), 1000e18, 0);
        assertEq(router.lastPathLength(), 3); // tokenIn -> hop -> tokenOut
    }

    function test_hopSkipped_whenLegIsHop() public {
        vm.prank(HUMAN);
        adapter.setHopToken(address(usdg)); // hop == tokenIn, so no extra hop
        router.setRate(0.02e18);
        _swap(address(usdg), address(stk), 1000e18, 0);
        assertEq(router.lastPathLength(), 2);
    }

    function test_setRouter_onlyOwner() public {
        vm.prank(VAULT);
        vm.expectRevert();
        adapter.setRouter(address(0xdead));
    }
}
