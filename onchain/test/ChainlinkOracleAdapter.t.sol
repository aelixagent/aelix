// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { ChainlinkOracleAdapter } from "../src/ChainlinkOracleAdapter.sol";
import { MockAggregator, MockSequencer } from "../src/mocks/Mocks.sol";

contract ChainlinkOracleAdapterTest is Test {
    address HUMAN = address(0xB00D);
    address STK = address(0x570C); // a stock token address (only used as a key)

    function setUp() public {
        vm.warp(2_000_000_000);
    }

    function _adapter(uint8 usdgDec, address seq, uint256 grace)
        internal
        returns (ChainlinkOracleAdapter)
    {
        return new ChainlinkOracleAdapter(usdgDec, seq, grace, HUMAN);
    }

    // ------------------------------------------------------------------ conversion

    function test_price_converts_feed8_to_usdg6() public {
        ChainlinkOracleAdapter a = _adapter(6, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8); // $50.00, 8-dec feed
        feed.set(50e8, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600);
        // USDG-native (6-dec) value of one whole token = 50e6
        assertEq(a.price(STK), 50e6);
    }

    function test_price_converts_feed8_to_usdg18() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600);
        assertEq(a.price(STK), 50e18);
    }

    // ------------------------------------------------------------------ fail-closed

    function test_noFeed_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        vm.expectRevert(ChainlinkOracleAdapter.NoFeed.selector);
        a.price(STK);
    }

    function test_stalePrice_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp - 2 hours); // older than 1h heartbeat
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 1 hours);
        vm.expectRevert(ChainlinkOracleAdapter.StalePrice.selector);
        a.price(STK);
    }

    function test_freshPrice_atHeartbeatEdge_ok() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp - 1 hours); // exactly at the edge
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 1 hours);
        assertEq(a.price(STK), 50e18);
    }

    function test_badPrice_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 0);
        feed.set(0, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600);
        vm.expectRevert(ChainlinkOracleAdapter.BadPrice.selector);
        a.price(STK);
    }

    function test_incompleteRound_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        feed.setRounds(5, 4); // answeredInRound < roundId
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600);
        vm.expectRevert(ChainlinkOracleAdapter.StalePrice.selector);
        a.price(STK);
    }

    // ------------------------------------------------------------------ L2 sequencer

    function test_sequencerDown_reverts() public {
        MockSequencer seq = new MockSequencer(1, block.timestamp - 1 hours); // down
        ChainlinkOracleAdapter a = _adapter(18, address(seq), 1 hours);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600);
        vm.expectRevert(ChainlinkOracleAdapter.SequencerDown.selector);
        a.price(STK);
    }

    function test_sequencerGracePeriod_reverts() public {
        MockSequencer seq = new MockSequencer(0, block.timestamp - 10 minutes); // up 10m ago
        ChainlinkOracleAdapter a = _adapter(18, address(seq), 1 hours); // 1h grace
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600);
        vm.expectRevert(ChainlinkOracleAdapter.GracePeriodNotOver.selector);
        a.price(STK);
    }

    function test_sequencerUp_afterGrace_ok() public {
        MockSequencer seq = new MockSequencer(0, block.timestamp - 2 hours); // up 2h ago
        ChainlinkOracleAdapter a = _adapter(18, address(seq), 1 hours);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600);
        assertEq(a.price(STK), 50e18);
    }

    // ------------------------------------------------------------------ access

    function test_setFeed_onlyOwner() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        vm.expectRevert();
        a.setFeed(STK, address(feed), 3600); // not the owner
    }
}
