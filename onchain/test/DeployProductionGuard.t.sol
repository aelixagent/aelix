// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { DeployProduction } from "../script/DeployProduction.s.sol";
import { MockAggregator } from "../src/mocks/Mocks.sol";

/// @dev Exposes the internal mainnet-safety gate for direct unit testing.
contract Harness is DeployProduction {
    function check(uint256 chainId, DeployProduction.Cfg memory c, address ownerEnv, address deployer)
        external
        view
    {
        _assertMainnetSafe(chainId, c, ownerEnv, deployer);
    }
}

/// @dev Minimal contract used wherever the gate only requires "this address holds code"
///      (owner multisig, USDG, router, Stock Token).
contract Dummy { }

/// @notice Regression tests for the deploy-time mainnet safety gate. An unsafe posture must
///         HARD revert on mainnet (4663) yet stay lenient on the testnet preview (46630).
///
///         The gate is deliberately strict about things that are individually survivable but
///         catastrophic in combination: an EOA owner, the deployer key doubling as owner or
///         agent, a sequencer feed that is down, the 18-decimal USDG look-alike, an address
///         typo pointing at empty space, a feed wired to the wrong token, and an off-hours
///         staleness bound wide enough to transact on a dead feed.
contract DeployProductionGuardTest is Test {
    Harness h;

    uint256 constant MAINNET = 4663;
    uint256 constant TESTNET = 46630;

    address DEPLOYER = address(uint160(9001));

    address owner_;
    address usdg_;
    address router_;
    address stock_;
    address agent_ = address(uint160(1007));
    MockAggregator seq_;
    MockAggregator feed_;
    /// @dev 24/7 crypto feeds standing in as chain-liveness witnesses.
    MockAggregator cryptoA_;
    MockAggregator cryptoB_;

    function setUp() public {
        h = new Harness();
        owner_ = address(new Dummy());
        usdg_ = address(new Dummy());
        router_ = address(new Dummy());
        stock_ = address(new Dummy());

        // Sequencer uptime feed: answer 0 == up, initialized round.
        seq_ = new MockAggregator(8, 0);
        seq_.set(0, block.timestamp);

        // Stock Token price feed: positive, initialized.
        feed_ = new MockAggregator(8, 50e8);
        feed_.set(50e8, block.timestamp);

        // 24/7 crypto liveness witnesses, fresh at deploy time.
        cryptoA_ = new MockAggregator(8, 3000e8);
        cryptoA_.set(3000e8, block.timestamp);
        cryptoB_ = new MockAggregator(8, 1e8);
        cryptoB_.set(1e8, block.timestamp);
    }

    function _safeCfg() internal view returns (DeployProduction.Cfg memory c) {
        address[] memory stocks = new address[](1);
        stocks[0] = stock_;
        address[] memory feeds = new address[](1);
        feeds[0] = address(feed_);
        address[] memory refs = new address[](2);
        refs[0] = address(cryptoA_);
        refs[1] = address(cryptoB_);
        c = DeployProduction.Cfg({
            usdg: usdg_,
            usdgDecimals: 6,
            router: router_,
            hop: address(0),
            sequencerFeed: address(seq_),
            grace: 3600,
            livenessRefs: refs,
            livenessBound: 43_200,
            stocks: stocks,
            feeds: feeds,
            staleness: 3600,
            offHoursStaleness: 302_400,
            depositCap: 10_000e6,
            owner: owner_,
            deployer: DEPLOYER,
            agent: agent_
        });
    }

    function _expect(string memory reason, DeployProduction.Cfg memory c) internal {
        vm.expectRevert(bytes(reason));
        h.check(MAINNET, c, c.owner, DEPLOYER);
    }

    /// On the testnet preview, even a fully-placeholder / EOA-owned config is allowed.
    function test_testnet_isLenient() public view {
        DeployProduction.Cfg memory c; // all-zero / placeholder-equivalent
        h.check(TESTNET, c, address(0), DEPLOYER); // no revert
    }

    /// A correctly-configured mainnet deploy passes the gate.
    function test_mainnet_acceptsSafeConfig() public view {
        h.check(MAINNET, _safeCfg(), owner_, DEPLOYER); // no revert
    }

    // ------------------------------------------------------------------------ ownership

    function test_mainnet_requiresOwner() public {
        DeployProduction.Cfg memory c = _safeCfg();
        vm.expectRevert(bytes("MAINNET: set OWNER to a multisig/timelock"));
        h.check(MAINNET, c, address(0), DEPLOYER);
    }

    /// The old gate accepted any non-zero owner, so a hot EOA passed a require whose message
    /// promised a multisig. A Safe/timelock is a contract; an EOA must now be rejected.
    function test_mainnet_rejectsEoaOwner() public {
        DeployProduction.Cfg memory c = _safeCfg();
        address eoa = address(uint160(4242)); // no code
        c.owner = eoa;
        vm.expectRevert(
            bytes("MAINNET: OWNER must be a contract (multisig/timelock), not an EOA")
        );
        h.check(MAINNET, c, eoa, DEPLOYER);
    }

    function test_mainnet_rejectsDeployerAsOwner() public {
        DeployProduction.Cfg memory c = _safeCfg();
        // Give the deployer address code so it clears the contract check and reaches this one.
        vm.etch(DEPLOYER, hex"00");
        c.owner = DEPLOYER;
        vm.expectRevert(bytes("MAINNET: OWNER must not be the deployer key"));
        h.check(MAINNET, c, DEPLOYER, DEPLOYER);
    }

    // ---------------------------------------------------------------------- agent key

    /// AGENT defaults to the deployer. On mainnet that hands the desk's hot trading key the
    /// same key that deployed the stack.
    function test_mainnet_rejectsDeployerAsAgent() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.agent = DEPLOYER;
        _expect("MAINNET: set AGENT to a dedicated key, not the deployer", c);
    }

    function test_mainnet_rejectsOwnerAsAgent() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.agent = owner_;
        _expect("MAINNET: AGENT must not be the owner multisig", c);
    }

    // ------------------------------------------------------------------ sequencer feed

    /// Robinhood Chain publishes no Chainlink sequencer uptime feed, so requiring one
    /// outright made mainnet undeployable. A 24/7 liveness quorum is an accepted substitute.
    function test_mainnet_acceptsQuorumWithoutSequencerFeed() public view {
        DeployProduction.Cfg memory c = _safeCfg();
        c.sequencerFeed = address(0);
        h.check(MAINNET, c, owner_, DEPLOYER); // no revert
    }

    /// What must never be allowed is NEITHER mechanism.
    function test_mainnet_rejectsNoLivenessMechanismAtAll() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.sequencerFeed = address(0);
        c.livenessRefs = new address[](0);
        _expect("MAINNET: set SEQUENCER_FEED or LIVENESS_FEEDS", c);
    }

    // ---------------------------------------------------------------- liveness quorum

    /// One witness is not a quorum: a single quiet feed must not be able to halt the vault.
    function test_mainnet_rejectsSingleLivenessRef() public {
        DeployProduction.Cfg memory c = _safeCfg();
        address[] memory refs = new address[](1);
        refs[0] = address(cryptoA_);
        c.livenessRefs = refs;
        c.sequencerFeed = address(0);
        _expect("MAINNET: LIVENESS_FEEDS needs >= 2 refs", c);
    }

    function test_mainnet_rejectsDuplicateLivenessRef() public {
        DeployProduction.Cfg memory c = _safeCfg();
        address[] memory refs = new address[](2);
        refs[0] = address(cryptoA_);
        refs[1] = address(cryptoA_);
        c.livenessRefs = refs;
        _expect("MAINNET: duplicate liveness ref", c);
    }

    /// An equity feed is not an independent witness — it goes stale with the market it
    /// prices, which is exactly the condition the quorum exists to distinguish.
    function test_mainnet_rejectsEquityFeedAsLivenessRef() public {
        DeployProduction.Cfg memory c = _safeCfg();
        address[] memory refs = new address[](2);
        refs[0] = address(cryptoA_);
        refs[1] = address(feed_); // the Stock Token's own feed
        c.livenessRefs = refs;
        _expect("MAINNET: liveness ref must not be an equity feed", c);
    }

    /// ALL refs stale means either the wrong kind of feed was supplied (equity feeds, which
    /// would halt the vault every weekend) or the chain is unhealthy. Deploying into that
    /// produces a vault that fails closed from block one.
    function test_mainnet_rejectsWhenNoLivenessRefIsFresh() public {
        DeployProduction.Cfg memory c = _safeCfg();
        vm.warp(block.timestamp + 2 days);
        _expect(
            "MAINNET: no liveness ref is fresh (equity feeds used as 24/7 refs, or chain stalled)",
            c
        );
    }

    /// But ONE quiet ref must NOT block the deploy: the runtime quorum needs only a single
    /// live witness, so the gate must not be stricter than the contract it is protecting.
    function test_mainnet_acceptsOneQuietLivenessRef() public {
        vm.warp(10 days); // room to age a feed backwards
        DeployProduction.Cfg memory c = _safeCfg();
        cryptoA_.set(3000e8, block.timestamp - 20 hours); // quiet, past the 12h bound
        cryptoB_.set(1e8, block.timestamp - 10 minutes); // still live
        h.check(MAINNET, c, owner_, DEPLOYER); // no revert
    }

    function test_mainnet_rejectsCodelessLivenessRef() public {
        DeployProduction.Cfg memory c = _safeCfg();
        address[] memory refs = new address[](2);
        refs[0] = address(cryptoA_);
        refs[1] = address(uint160(8892));
        c.livenessRefs = refs;
        _expect("MAINNET: liveness ref has no code", c);
    }

    function test_mainnet_rejectsShortLivenessBound() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.livenessBound = 600;
        _expect("MAINNET: LIVENESS_BOUND too short (>= 3600s)", c);
    }

    function test_mainnet_rejectsPermissiveLivenessBound() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.livenessBound = uint32(3 days);
        _expect("MAINNET: LIVENESS_BOUND too permissive (<= 1d)", c);
    }

    function test_mainnet_rejectsCodelessSequencerFeed() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.sequencerFeed = address(uint160(7777)); // typo'd address, no code
        _expect("MAINNET: SEQUENCER_FEED has no code", c);
    }

    function test_mainnet_rejectsUninitializedSequencerRound() public {
        DeployProduction.Cfg memory c = _safeCfg();
        seq_.setStartedAt(0);
        _expect("MAINNET: SEQUENCER_FEED round uninitialized", c);
    }

    /// Deploying while the sequencer is down would wire a stack whose oracle fails closed
    /// from block one, and hides whether the feed is even correct.
    function test_mainnet_refusesWhileSequencerDown() public {
        DeployProduction.Cfg memory c = _safeCfg();
        seq_.set(1, block.timestamp); // 1 == down
        _expect("MAINNET: sequencer reported DOWN, refusing to deploy", c);
    }

    function test_mainnet_rejectsShortGrace() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.grace = 60;
        _expect("MAINNET: SEQUENCER_GRACE too short (>= 1800s)", c);
    }

    // -------------------------------------------------------------------------- USDG

    function test_mainnet_rejectsPlaceholderUsdg() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.usdg = 0x1111111111111111111111111111111111111111;
        _expect("MAINNET: set real USDG", c);
    }

    function test_mainnet_rejectsCodelessUsdg() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.usdg = address(uint160(8888));
        _expect("MAINNET: USDG has no code", c);
    }

    /// The documented trap: an 18-decimal "Global Dollar" USDG look-alike. `usdgDecimals` is
    /// read live from the token, so pinning it to 6 rejects the impostor without ever
    /// trusting the symbol.
    function test_mainnet_rejects18DecimalUsdgLookalike() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.usdgDecimals = 18;
        _expect("MAINNET: USDG decimals != 6, wrong token (18-dec look-alike?)", c);
    }

    // ------------------------------------------------------------------------ router

    function test_mainnet_rejectsPlaceholderRouter() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.router = 0x2222222222222222222222222222222222222222;
        _expect("MAINNET: set real ROUTER", c);
    }

    function test_mainnet_rejectsCodelessRouter() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.router = address(uint160(8889));
        _expect("MAINNET: ROUTER has no code", c);
    }

    function test_mainnet_rejectsCodelessHop() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.hop = address(uint160(8890));
        _expect("MAINNET: HOP_TOKEN has no code", c);
    }

    // ------------------------------------------------------------- stocks and feeds

    function test_mainnet_requiresStocks() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.stocks = new address[](0);
        c.feeds = new address[](0);
        _expect("MAINNET: STOCKS/FEEDS required", c);
    }

    function test_mainnet_rejectsCodelessStockToken() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.stocks[0] = address(uint160(8891));
        _expect("MAINNET: Stock Token has no code", c);
    }

    function test_mainnet_rejectsUsdgAsStockToken() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.stocks[0] = c.usdg;
        _expect("MAINNET: USDG listed as a Stock Token", c);
    }

    /// A duplicated feed across two tokens means one token is priced by the other's feed —
    /// a whole position silently mispriced.
    function test_mainnet_rejectsDuplicateFeed() public {
        DeployProduction.Cfg memory c = _safeCfg();
        address[] memory stocks = new address[](2);
        stocks[0] = stock_;
        stocks[1] = address(new Dummy());
        address[] memory feeds = new address[](2);
        feeds[0] = address(feed_);
        feeds[1] = address(feed_); // same feed twice
        c.stocks = stocks;
        c.feeds = feeds;
        _expect("MAINNET: duplicate feed (wrong token wired?)", c);
    }

    function test_mainnet_rejectsDuplicateStockToken() public {
        DeployProduction.Cfg memory c = _safeCfg();
        MockAggregator second = new MockAggregator(8, 60e8);
        second.set(60e8, block.timestamp);
        address[] memory stocks = new address[](2);
        stocks[0] = stock_;
        stocks[1] = stock_; // same token twice
        address[] memory feeds = new address[](2);
        feeds[0] = address(feed_);
        feeds[1] = address(second);
        c.stocks = stocks;
        c.feeds = feeds;
        _expect("MAINNET: duplicate Stock Token", c);
    }

    function test_mainnet_rejectsNonPositiveFeedAnswer() public {
        DeployProduction.Cfg memory c = _safeCfg();
        feed_.set(0, block.timestamp);
        _expect("MAINNET: feed answer <= 0", c);
    }

    function test_mainnet_rejectsUninitializedFeedRound() public {
        DeployProduction.Cfg memory c = _safeCfg();
        feed_.set(50e8, 0);
        _expect("MAINNET: feed round uninitialized", c);
    }

    // -------------------------------------------------------------- staleness bounds

    /// An unaudited vault must not be able to accept unbounded deposits. The checklist used to
    /// instruct "set a small TVL cap" while no cap mechanism existed at all — now it exists,
    /// is applied during _wire, and launching uncapped is refused outright.
    function test_mainnet_rejectsUncappedLaunch() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.depositCap = 0;
        _expect("MAINNET: set DEPOSIT_CAP (staged rollout; 0 = uncapped is refused)", c);
    }

    function test_mainnet_rejectsShortSessionStaleness() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.staleness = 30;
        _expect("MAINNET: FEED_STALENESS too short (>= 3600s)", c);
    }

    function test_mainnet_rejectsInvertedStalenessBounds() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.staleness = 7200;
        c.offHoursStaleness = 3600; // below the session bound
        _expect("MAINNET: off-hours bound < session bound", c);
    }

    /// Live mainnet feeds were measured at 24.6h-28.9h old on a Saturday. A valuation bound
    /// under 3 days breaks NAV, deposits and redemptions every weekend.
    function test_mainnet_rejectsOffHoursBoundThatCannotSurviveAWeekend() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.offHoursStaleness = uint32(2 days);
        _expect("MAINNET: FEED_STALENESS_OFFHOURS too short (>= 3d, must survive a weekend)", c);
    }

    /// The off-hours bound is the window in which the vault mints and redeems against a held
    /// price. Unbounded, it becomes a licence to transact on a dead feed.
    function test_mainnet_rejectsOverPermissiveOffHoursBound() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.offHoursStaleness = uint32(30 days);
        _expect("MAINNET: FEED_STALENESS_OFFHOURS too permissive (<= 7d)", c);
    }
}
