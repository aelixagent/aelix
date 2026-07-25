// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { ChainlinkOracleAdapter } from "../src/ChainlinkOracleAdapter.sol";
import { MockAggregator, MockSequencer, MockPausableStockToken } from "../src/mocks/Mocks.sol";

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
        a.setFeed(STK, address(feed), 3600, 302_400);
        // USDG-native (6-dec) value of one whole token = 50e6
        assertEq(a.price(STK), 50e6);
    }

    function test_price_converts_feed8_to_usdg18() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600, 302_400);
        assertEq(a.price(STK), 50e18);
    }

    // ------------------------------------------------------------------ fail-closed

    function test_noFeed_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        vm.expectRevert(ChainlinkOracleAdapter.NoFeed.selector);
        a.price(STK);
    }

    /// Past the in-session heartbeat but inside the off-hours bound: this is the ordinary
    /// weekend state of a 24/5 tokenized-equity feed. Valuation must keep working (else the
    /// vault freezes every night), while execution must fail closed.
    function test_heldClosedSessionPrice_valuesButCannotTrade() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp - 2 days); // Fri close, read on Sunday
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 1 hours, 302_400);

        assertEq(a.price(STK), 50e18); // NAV / deposit / redeem still priced
        vm.expectRevert(ChainlinkOracleAdapter.StalePrice.selector);
        a.priceForTrade(STK); // but no trade against a held price
    }

    /// Beyond even the off-hours bound the feed is presumed dead, and BOTH paths fail closed.
    function test_stalePrice_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp - 5 days); // older than the 3.5d valuation bound
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 1 hours, 302_400);
        vm.expectRevert(ChainlinkOracleAdapter.StalePrice.selector);
        a.price(STK);
        vm.expectRevert(ChainlinkOracleAdapter.StalePrice.selector);
        a.priceForTrade(STK);
    }

    /// The issuer's own `oraclePaused()` flag on the Stock Token fails both paths closed,
    /// per Robinhood Chain guidance to treat a paused oracle as "price unavailable".
    function test_issuerOraclePause_failsClosed() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        MockPausableStockToken tok = new MockPausableStockToken();
        vm.prank(HUMAN);
        a.setFeed(address(tok), address(feed), 1 hours, 302_400);
        assertEq(a.price(address(tok)), 50e18); // unpaused: normal

        tok.setOraclePaused(true);
        vm.expectRevert(ChainlinkOracleAdapter.OraclePausedByIssuer.selector);
        a.price(address(tok));
        vm.expectRevert(ChainlinkOracleAdapter.OraclePausedByIssuer.selector);
        a.priceForTrade(address(tok));

        tok.setOraclePaused(false);
        assertEq(a.price(address(tok)), 50e18); // restored after the corporate action
    }

    /// A token with no `oraclePaused()` must not be bricked by the probe: the low-level
    /// staticcall returns empty/undecodable data and is treated as "not paused".
    function test_tokenWithoutOraclePaused_stillPrices() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 1 hours, 302_400);
        assertEq(a.price(STK), 50e18);
        assertEq(a.priceForTrade(STK), 50e18);
    }

    function test_setFeed_offHoursBelowSession_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        vm.prank(HUMAN);
        vm.expectRevert(ChainlinkOracleAdapter.BadStalenessOrder.selector);
        a.setFeed(STK, address(feed), 2 hours, 1 hours);
    }

    function test_freshPrice_atHeartbeatEdge_ok() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp - 1 hours); // exactly at the edge
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 1 hours, 302_400);
        assertEq(a.price(STK), 50e18);
    }

    // ---------------------------------------------- corporate-action circuit breaker

    /// Owner can freeze a token's price for a split / corporate action: price() then fails
    /// closed (NAV, and every mint/redeem, reverts), and unfreezing restores it.
    function test_freezeFeed_failsClosed_thenUnfreeze() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 1 hours, 302_400);
        assertEq(a.price(STK), 50e18); // priced normally

        vm.prank(HUMAN);
        a.setFeedFrozen(STK, true);
        vm.expectRevert(ChainlinkOracleAdapter.FeedFrozen.selector);
        a.price(STK); // frozen -> fail closed

        vm.prank(HUMAN);
        a.setFeedFrozen(STK, false);
        assertEq(a.price(STK), 50e18); // restored after the event
    }

    /// The circuit breaker is owner-only; the agent can never trip or clear it.
    function test_freezeFeed_ownerOnly() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        vm.expectRevert(); // Ownable: caller is not the owner
        a.setFeedFrozen(STK, true);
    }

    function test_badPrice_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 0);
        feed.set(0, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600, 302_400);
        vm.expectRevert(ChainlinkOracleAdapter.BadPrice.selector);
        a.price(STK);
    }

    function test_incompleteRound_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        feed.setRounds(5, 4); // answeredInRound < roundId
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600, 302_400);
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
        a.setFeed(STK, address(feed), 3600, 302_400);
        vm.expectRevert(ChainlinkOracleAdapter.SequencerDown.selector);
        a.price(STK);
    }

    function test_sequencerGracePeriod_reverts() public {
        MockSequencer seq = new MockSequencer(0, block.timestamp - 10 minutes); // up 10m ago
        ChainlinkOracleAdapter a = _adapter(18, address(seq), 1 hours); // 1h grace
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600, 302_400);
        vm.expectRevert(ChainlinkOracleAdapter.GracePeriodNotOver.selector);
        a.price(STK);
    }

    function test_sequencerUp_afterGrace_ok() public {
        MockSequencer seq = new MockSequencer(0, block.timestamp - 2 hours); // up 2h ago
        ChainlinkOracleAdapter a = _adapter(18, address(seq), 1 hours);
        MockAggregator feed = new MockAggregator(8, 50e8);
        feed.set(50e8, block.timestamp);
        vm.prank(HUMAN);
        a.setFeed(STK, address(feed), 3600, 302_400);
        assertEq(a.price(STK), 50e18);
    }

    // ------------------------------------------------------------------ access

    function test_setFeed_onlyOwner() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        vm.expectRevert();
        a.setFeed(STK, address(feed), 3600, 302_400); // not the owner
    }

    // ------------------------------------------------------------------ setFeed validation

    function test_setFeed_zeroStaleness_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(8, 50e8);
        vm.prank(HUMAN);
        vm.expectRevert(ChainlinkOracleAdapter.ZeroStaleness.selector);
        a.setFeed(STK, address(feed), 0, 302_400); // 0 would silently disable the freshness guard
    }

    function test_setFeed_zeroFeedDecimals_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(0, 50e8); // implausible 0-dec feed
        vm.prank(HUMAN);
        vm.expectRevert(ChainlinkOracleAdapter.BadFeedDecimals.selector);
        a.setFeed(STK, address(feed), 3600, 302_400);
    }

    function test_setFeed_tooManyFeedDecimals_reverts() public {
        ChainlinkOracleAdapter a = _adapter(18, address(0), 0);
        MockAggregator feed = new MockAggregator(19, 50e8); // > 18 decimals
        vm.prank(HUMAN);
        vm.expectRevert(ChainlinkOracleAdapter.BadFeedDecimals.selector);
        a.setFeed(STK, address(feed), 3600, 302_400);
    }
}
