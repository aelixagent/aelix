// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IPriceOracle } from "./interfaces/IVaultPeriphery.sol";
import { IAggregatorV3 } from "./interfaces/IAggregatorV3.sol";

/// @title ChainlinkOracleAdapter
/// @author Aelix
/// @notice Production {IPriceOracle} backed by Chainlink price feeds on Robinhood
///         Chain. Converts a TOKEN/USD feed into the "USDG-native value of one whole
///         token" the vault expects, and **fails closed** on any unsafe read:
///         - stale price (older than the feed's configured heartbeat),
///         - non-positive or incomplete round,
///         - L2 sequencer down or still inside the post-recovery grace window.
///
/// @dev    Assumes USDG ≈ 1 USD (Paxos USDG). If a USDG/USD feed is desired later,
///         multiply through it; for v1 the 1:1 peg is the documented assumption.
contract ChainlinkOracleAdapter is IPriceOracle, Ownable2Step {
    struct Feed {
        IAggregatorV3 aggregator;
        uint8 feedDecimals;
        uint32 maxStaleness; // seconds; 0 disables the staleness check for this feed
    }

    uint8 public immutable usdgDecimals;
    /// @dev Chainlink L2 Sequencer Uptime Feed (address(0) to disable — e.g. on L1/local).
    IAggregatorV3 public immutable sequencerUptimeFeed;
    uint256 public immutable sequencerGracePeriod;

    mapping(address => Feed) public feeds;
    /// @dev Owner circuit breaker per token. Chainlink's Robinhood feeds PAUSE during a
    ///      stock split / corporate action, and a split-aware price needs the ERC-8056
    ///      `uiMultiplier` (interface not yet published). Until then, the owner freezes the
    ///      affected token for the event window: {price} fails closed, so NAV — and every
    ///      mint/redeem that depends on it — reverts rather than transacting at a mispriced
    ///      raw feed. `redeemInKind` (oracle-free, pro-rata) still exits. Unfreeze once the
    ///      feed reflects the post-action price.
    mapping(address => bool) public feedFrozen;

    event FeedSet(address indexed token, address aggregator, uint32 maxStaleness);
    event FeedFreezeSet(address indexed token, bool frozen);

    error NoFeed();
    error FeedFrozen();
    error BadPrice();
    error StalePrice();
    error SequencerDown();
    error GracePeriodNotOver();
    /// @notice maxStaleness of 0 would silently disable the freshness guard — forbidden.
    error ZeroStaleness();
    /// @notice The aggregator reported an implausible decimals value.
    error BadFeedDecimals();

    constructor(
        uint8 usdgDecimals_,
        address sequencerUptimeFeed_,
        uint256 gracePeriod_,
        address owner_
    ) Ownable(owner_) {
        usdgDecimals = usdgDecimals_;
        sequencerUptimeFeed = IAggregatorV3(sequencerUptimeFeed_);
        sequencerGracePeriod = gracePeriod_;
    }

    /// @notice Register/replace the Chainlink feed for a Stock Token.
    /// @param maxStaleness Max age (seconds) of a round before {price} reverts. MUST be
    ///        non-zero: a 0 here would silently disable the freshness guard the vault
    ///        relies on to fail closed on a stalled feed.
    function setFeed(address token, address aggregator, uint32 maxStaleness) external onlyOwner {
        if (maxStaleness == 0) revert ZeroStaleness();
        uint8 fd = IAggregatorV3(aggregator).decimals();
        // A feed with 0 or >18 decimals is not a sane price feed (Chainlink USD feeds are
        // typically 8-dec). Reject it rather than compute a nonsensical scaling in {price}.
        if (fd == 0 || fd > 18) revert BadFeedDecimals();
        feeds[token] = Feed({
            aggregator: IAggregatorV3(aggregator), feedDecimals: fd, maxStaleness: maxStaleness
        });
        emit FeedSet(token, aggregator, maxStaleness);
    }

    /// @notice Owner circuit breaker: freeze/unfreeze a token's price. Use during a stock
    ///         split / corporate action (raw feed mispriced) so NAV fails closed for the
    ///         event window. Owner-only; the agent can never reach it.
    function setFeedFrozen(address token, bool frozen) external onlyOwner {
        feedFrozen[token] = frozen;
        emit FeedFreezeSet(token, frozen);
    }

    function _checkSequencer() internal view {
        if (address(sequencerUptimeFeed) == address(0)) return;
        (, int256 answer, uint256 startedAt,,) = sequencerUptimeFeed.latestRoundData();
        // Chainlink: answer == 0 => up, 1 => down.
        if (answer != 0) revert SequencerDown();
        // startedAt == 0 => the round is uninitialized/invalid; fail closed rather than
        // treating "now - 0" as a grace window that is trivially "long over" (LOW-5).
        if (startedAt == 0) revert SequencerDown();
        // forge-lint: disable-next-line(block-timestamp) — grace window is minutes-scale
        if (block.timestamp - startedAt <= sequencerGracePeriod) revert GracePeriodNotOver();
    }

    /// @inheritdoc IPriceOracle
    function price(address token) external view returns (uint256) {
        _checkSequencer();

        Feed memory f = feeds[token];
        if (address(f.aggregator) == address(0)) revert NoFeed();
        // Owner-tripped circuit breaker for corporate actions / splits — fail closed.
        if (feedFrozen[token]) revert FeedFrozen();

        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            f.aggregator.latestRoundData();

        if (answer <= 0) revert BadPrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (updatedAt == 0) revert StalePrice();
        // maxStaleness is guaranteed non-zero at registration ({setFeed} rejects 0); the
        // `!= 0` here is a defensive belt-and-braces so an unset feed never skips the check.
        // forge-lint: disable-next-line(block-timestamp) — heartbeat freshness check
        if (f.maxStaleness != 0 && block.timestamp - updatedAt > f.maxStaleness) {
            revert StalePrice();
        }

        // USDG-native value of ONE WHOLE token = answer * 10^usdgDecimals / 10^feedDecimals.
        // forge-lint: disable-next-line(unsafe-typecast) — answer > 0 checked above
        return (uint256(answer) * (10 ** usdgDecimals)) / (10 ** f.feedDecimals);
    }
}
