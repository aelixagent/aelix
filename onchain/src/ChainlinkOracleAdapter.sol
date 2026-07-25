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
        /// @dev Freshness bound for the TRADE path. Should track the feed's in-session
        ///      heartbeat — a trade must execute against a live price or not at all.
        uint32 sessionStaleness;
        /// @dev Freshness bound for the VALUATION path (NAV / deposit / redeem). Wider,
        ///      because a 24/5 feed legitimately holds its last price through a closed
        ///      session without a heartbeat. Must cover the longest expected close
        ///      (a weekend plus a Monday holiday ≈ 72h) with headroom, while still
        ///      failing closed on a feed that has genuinely died.
        uint32 offHoursStaleness;
    }

    uint8 public immutable usdgDecimals;
    /// @dev Chainlink L2 Sequencer Uptime Feed (address(0) to disable — e.g. on L1/local).
    IAggregatorV3 public immutable sequencerUptimeFeed;
    uint256 public immutable sequencerGracePeriod;

    mapping(address => Feed) public feeds;
    /// @dev Owner circuit breaker per token, retained as a manual backstop. The PRIMARY
    ///      corporate-action guard is now the issuer's own `oraclePaused()` flag, read
    ///      live in {_read} — Robinhood pauses a Stock Token's oracle while a split or
    ///      other corporate action is processed and its multiplier is updated, and
    ///      integrators are told to treat that as "price temporarily unavailable".
    ///      This mapping covers anything the issuer flag does not (e.g. a feed the owner
    ///      distrusts for another reason). When either trips, {price} fails closed, so
    ///      NAV and every mint/redeem revert; `redeemInKind` (oracle-free, pro-rata)
    ///      still exits.
    mapping(address => bool) public feedFrozen;

    event FeedSet(
        address indexed token, address aggregator, uint32 sessionStaleness, uint32 offHoursStaleness
    );
    event FeedFreezeSet(address indexed token, bool frozen);

    error NoFeed();
    error FeedFrozen();
    error BadPrice();
    error StalePrice();
    error SequencerDown();
    error GracePeriodNotOver();
    /// @notice A staleness bound of 0 would silently disable the freshness guard — forbidden.
    error ZeroStaleness();
    /// @notice offHoursStaleness must be >= sessionStaleness; the valuation bound is the
    ///         looser of the two by construction.
    error BadStalenessOrder();
    /// @notice The aggregator reported an implausible decimals value.
    error BadFeedDecimals();
    /// @notice The issuer paused this token's oracle for a corporate action. Per Robinhood
    ///         Chain guidance this means "price temporarily unavailable" — not zero, and
    ///         not a stale price to transact against.
    error OraclePausedByIssuer();

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
    /// @param sessionStaleness Max round age (seconds) before {priceForTrade} reverts —
    ///        set from the feed's in-session heartbeat.
    /// @param offHoursStaleness Max round age before {price} reverts. Must be >=
    ///        `sessionStaleness` and should exceed the longest market close, because a
    ///        24/5 feed publishes no heartbeat while the session is shut.
    /// @dev   Both MUST be non-zero: a 0 would silently disable the freshness guard the
    ///        vault relies on to fail closed on a stalled feed.
    function setFeed(
        address token,
        address aggregator,
        uint32 sessionStaleness,
        uint32 offHoursStaleness
    ) external onlyOwner {
        if (sessionStaleness == 0 || offHoursStaleness == 0) revert ZeroStaleness();
        if (offHoursStaleness < sessionStaleness) revert BadStalenessOrder();
        uint8 fd = IAggregatorV3(aggregator).decimals();
        // A feed with 0 or >18 decimals is not a sane price feed (Chainlink USD feeds are
        // typically 8-dec). Reject it rather than compute a nonsensical scaling in {price}.
        if (fd == 0 || fd > 18) revert BadFeedDecimals();
        feeds[token] = Feed({
            aggregator: IAggregatorV3(aggregator),
            feedDecimals: fd,
            sessionStaleness: sessionStaleness,
            offHoursStaleness: offHoursStaleness
        });
        emit FeedSet(token, aggregator, sessionStaleness, offHoursStaleness);
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

    /// @notice Read the issuer's own corporate-action pause flag on the Stock Token.
    /// @dev    Low-level staticcall, not `try/catch`: a token that does not implement
    ///         `oraclePaused()` may return empty or undecodable data, which `try/catch`
    ///         would NOT catch. Absent or malformed => treated as "not paused", so mock
    ///         and non-Robinhood tokens keep working; a clean `true` fails closed.
    function _checkIssuerPause(address token) internal view {
        (bool ok, bytes memory ret) =
            token.staticcall(abi.encodeWithSignature("oraclePaused()"));
        if (ok && ret.length == 32 && abi.decode(ret, (bool))) revert OraclePausedByIssuer();
    }

    /// @dev Shared read path. `staleness` is the caller's freshness budget — tight for
    ///      execution, wide for valuation. Every other guard is identical, so a trade and
    ///      a NAV read can never disagree about whether a feed is usable for any reason
    ///      other than age.
    ///
    ///      Note the returned answer is the feed's **Total Return Value**: Robinhood's
    ///      Chainlink feeds combine the underlying equity price with the multiplier read
    ///      from the token contract. A split therefore moves price and multiplier together
    ///      and leaves this series continuous — there is no separate multiplier to apply
    ///      here, and NAV, stop-loss reference levels and PerfScore all inherit the same
    ///      basis by reading through this adapter.
    function _read(address token, uint32 staleness) internal view returns (uint256) {
        _checkSequencer();

        Feed memory f = feeds[token];
        if (address(f.aggregator) == address(0)) revert NoFeed();
        // Owner backstop, then the issuer's live corporate-action flag — both fail closed.
        if (feedFrozen[token]) revert FeedFrozen();
        _checkIssuerPause(token);

        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            f.aggregator.latestRoundData();

        if (answer <= 0) revert BadPrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (updatedAt == 0) revert StalePrice();
        // Both bounds are guaranteed non-zero at registration ({setFeed} rejects 0); the
        // `!= 0` here is a defensive belt-and-braces so an unset feed never skips the check.
        // forge-lint: disable-next-line(block-timestamp) — heartbeat freshness check
        if (staleness != 0 && block.timestamp - updatedAt > staleness) {
            revert StalePrice();
        }

        // USDG-native value of ONE WHOLE token = answer * 10^usdgDecimals / 10^feedDecimals.
        // forge-lint: disable-next-line(unsafe-typecast) — answer > 0 checked above
        return (uint256(answer) * (10 ** usdgDecimals)) / (10 ** f.feedDecimals);
    }

    /// @inheritdoc IPriceOracle
    function price(address token) external view returns (uint256) {
        return _read(token, feeds[token].offHoursStaleness);
    }

    /// @inheritdoc IPriceOracle
    function priceForTrade(address token) external view returns (uint256) {
        return _read(token, feeds[token].sessionStaleness);
    }
}
