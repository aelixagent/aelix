// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { DeployProduction } from "../script/DeployProduction.s.sol";

/// @dev Exposes the internal mainnet-safety gate for direct unit testing.
contract Harness is DeployProduction {
    function check(uint256 chainId, DeployProduction.Cfg memory c, address ownerEnv)
        external
        pure
    {
        _assertMainnetSafe(chainId, c, ownerEnv);
    }
}

/// @notice Regression tests for the deploy-time mainnet safety gate: an unsafe posture
///         (EOA owner / no sequencer feed / placeholder periphery / no stocks) must HARD
///         revert on mainnet (4663) yet stay lenient on the testnet preview (46630).
contract DeployProductionGuardTest is Test {
    Harness h;

    uint256 constant MAINNET = 4663;
    uint256 constant TESTNET = 46630;

    // Distinct, nonzero, non-placeholder synthetic addresses (guard only checks != 0 /
    // != placeholder), built via uint160 casts to sidestep checksum literals.
    address constant SAFE_USDG = address(uint160(1001));
    address constant SAFE_ROUTER = address(uint160(1002));
    address constant SAFE_SEQ = address(uint160(1003));
    address constant SAFE_OWNER = address(uint160(1004));

    function setUp() public {
        h = new Harness();
    }

    function _safeCfg() internal pure returns (DeployProduction.Cfg memory c) {
        address[] memory stocks = new address[](1);
        stocks[0] = address(uint160(1005));
        address[] memory feeds = new address[](1);
        feeds[0] = address(uint160(1006));
        c = DeployProduction.Cfg({
            usdg: SAFE_USDG,
            usdgDecimals: 6,
            router: SAFE_ROUTER,
            hop: address(0),
            sequencerFeed: SAFE_SEQ,
            grace: 3600,
            stocks: stocks,
            feeds: feeds,
            staleness: 3600,
            owner: SAFE_OWNER,
            agent: address(uint160(1007))
        });
    }

    /// On the testnet preview, even a fully-placeholder / EOA-owned config is allowed.
    function test_testnet_isLenient() public view {
        DeployProduction.Cfg memory c; // all-zero / placeholder-equivalent
        h.check(TESTNET, c, address(0)); // no revert
    }

    /// A correctly-configured mainnet deploy passes the gate.
    function test_mainnet_acceptsSafeConfig() public view {
        h.check(MAINNET, _safeCfg(), SAFE_OWNER); // no revert
    }

    function test_mainnet_requiresOwner() public {
        DeployProduction.Cfg memory c = _safeCfg();
        vm.expectRevert(bytes("MAINNET: set OWNER to a multisig/timelock"));
        h.check(MAINNET, c, address(0));
    }

    function test_mainnet_requiresSequencerFeed() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.sequencerFeed = address(0);
        vm.expectRevert(bytes("MAINNET: set SEQUENCER_FEED (L2 uptime)"));
        h.check(MAINNET, c, SAFE_OWNER);
    }

    function test_mainnet_rejectsPlaceholderUsdg() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.usdg = 0x1111111111111111111111111111111111111111;
        vm.expectRevert(bytes("MAINNET: set real USDG"));
        h.check(MAINNET, c, SAFE_OWNER);
    }

    function test_mainnet_rejectsPlaceholderRouter() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.router = 0x2222222222222222222222222222222222222222;
        vm.expectRevert(bytes("MAINNET: set real ROUTER"));
        h.check(MAINNET, c, SAFE_OWNER);
    }

    function test_mainnet_requiresStocks() public {
        DeployProduction.Cfg memory c = _safeCfg();
        c.stocks = new address[](0);
        vm.expectRevert(bytes("MAINNET: STOCKS/FEEDS required"));
        h.check(MAINNET, c, SAFE_OWNER);
    }
}
