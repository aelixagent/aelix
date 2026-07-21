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

    event FeedSet(address indexed token, address aggregator, uint32 maxStaleness);

    error NoFeed();
    error BadPrice();
    error StalePrice();
    error SequencerDown();
    error GracePeriodNotOver();

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
    /// @param maxStaleness Max age (seconds) of a round before {price} reverts.
    function setFeed(address token, address aggregator, uint32 maxStaleness) external onlyOwner {
        uint8 fd = IAggregatorV3(aggregator).decimals();
        feeds[token] = Feed({
            aggregator: IAggregatorV3(aggregator), feedDecimals: fd, maxStaleness: maxStaleness
        });
        emit FeedSet(token, aggregator, maxStaleness);
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

        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            f.aggregator.latestRoundData();

        if (answer <= 0) revert BadPrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (updatedAt == 0) revert StalePrice();
        // maxStaleness == 0 disables the age check (e.g. local/testnet feeds).
        // forge-lint: disable-next-line(block-timestamp) — heartbeat freshness check
        if (f.maxStaleness != 0 && block.timestamp - updatedAt > f.maxStaleness) {
            revert StalePrice();
        }

        // USDG-native value of ONE WHOLE token = answer * 10^usdgDecimals / 10^feedDecimals.
        // forge-lint: disable-next-line(unsafe-typecast) — answer > 0 checked above
        return (uint256(answer) * (10 ** usdgDecimals)) / (10 ** f.feedDecimals);
    }
}
