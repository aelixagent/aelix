// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { DeployProduction } from "../script/DeployProduction.s.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { ChainlinkOracleAdapter } from "../src/ChainlinkOracleAdapter.sol";
import { SessionKeyExecutor } from "../src/SessionKeyExecutor.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { UniswapSwapAdapter } from "../src/UniswapSwapAdapter.sol";
import { MockERC20D, MockAggregator } from "../src/mocks/Mocks.sol";

/// @dev Exposes the deploy/wire/handover sequence so it can be exercised without broadcasting.
contract DeployHarness is DeployProduction {
    function deployWireHandover(DeployProduction.Cfg memory c)
        external
        returns (DeployProduction.Stack memory s)
    {
        s = _deploy(c);
        _wire(s, c);
        _handover(s, c);
    }
}

contract RouterStub {
    function factory() external view returns (address) {
        return address(this);
    }
}

/// @notice Regression test for the deploy-ownership ordering bug.
///
///         `_wire` configures the stack by calling onlyOwner functions, and during
///         `vm.startBroadcast` the only signer is the DEPLOYER. An earlier version constructed
///         vault / oracle / executor already owned by the multisig, so every wiring call
///         reverted — *after* eight contract deployments had been paid for. On a real mainnet
///         run that burns the gas and leaves an unusable, half-configured stack.
///
///         These tests pin the fix: wiring happens under deployer ownership, ownership is then
///         handed to the multisig via Ownable2Step (pending until accepted), and the two
///         contracts `_wire` never touches never pass through deployer control at all.
contract DeployHandoverTest is Test {
    DeployHarness h;

    address MULTISIG; // stands in for the Safe
    /// @dev In a real run `vm.startBroadcast` makes the deployer EOA the caller for every
    ///      construction and wiring call. Inside this harness that role is played by the
    ///      harness contract itself, so it is what `Cfg.deployer` must be set to.
    address DEPLOYER;
    address AGENT = address(uint160(0xA6E7A));

    MockERC20D usdg;
    MockERC20D stockA;
    MockERC20D stockB;
    MockAggregator feedA;
    MockAggregator feedB;
    MockAggregator cryptoA;
    MockAggregator cryptoB;
    address router;

    function setUp() public {
        vm.warp(2_000_000_000);
        h = new DeployHarness();
        DEPLOYER = address(h);
        MULTISIG = address(new RouterStub()); // any contract works as the "Safe"
        router = address(new RouterStub());

        usdg = new MockERC20D("Global Dollar", "USDG", 6);
        stockA = new MockERC20D("NVIDIA . Robinhood Token", "NVDA", 18);
        stockB = new MockERC20D("Apple . Robinhood Token", "AAPL", 18);

        feedA = new MockAggregator(8, 200e8);
        feedA.set(200e8, block.timestamp);
        feedB = new MockAggregator(8, 330e8);
        feedB.set(330e8, block.timestamp);
        cryptoA = new MockAggregator(8, 3000e8);
        cryptoA.set(3000e8, block.timestamp);
        cryptoB = new MockAggregator(8, 1e8);
        cryptoB.set(1e8, block.timestamp);
    }

    function _cfg() internal view returns (DeployProduction.Cfg memory c) {
        address[] memory stocks = new address[](2);
        stocks[0] = address(stockA);
        stocks[1] = address(stockB);
        address[] memory feeds = new address[](2);
        feeds[0] = address(feedA);
        feeds[1] = address(feedB);
        address[] memory refs = new address[](2);
        refs[0] = address(cryptoA);
        refs[1] = address(cryptoB);
        c = DeployProduction.Cfg({
            usdg: address(usdg),
            usdgDecimals: 6,
            router: router,
            hop: address(0),
            sequencerFeed: address(0),
            grace: 3600,
            livenessRefs: refs,
            livenessBound: 43_200,
            stocks: stocks,
            feeds: feeds,
            staleness: 14_400,
            offHoursStaleness: 302_400,
            depositCap: 10_000e6,
            owner: MULTISIG,
            deployer: DEPLOYER,
            agent: AGENT
        });
    }

    /// The whole sequence must complete as the deployer. Before the fix this reverted at the
    /// first onlyOwner call in `_wire`.
    function test_deployWireHandover_succeedsAsDeployer() public {
        DeployProduction.Stack memory s = h.deployWireHandover(_cfg());
        assertTrue(address(s.vault) != address(0));
    }

    /// The wiring must have actually taken effect — a deploy that "succeeds" but leaves the
    /// vault unconfigured is just as useless.
    function test_wiringActuallyApplied() public {
        DeployProduction.Stack memory s = h.deployWireHandover(_cfg());

        assertEq(s.vault.manager(), address(s.exec), "manager not set");
        assertEq(s.oracle.livenessRefsLength(), 2, "liveness refs not set");
        assertEq(s.oracle.livenessBound(), 43_200);
        // Feeds registered for both tokens, priced through the adapter.
        assertEq(s.oracle.price(address(stockA)), 200e6); // 6-dec USDG native
        assertEq(s.oracle.price(address(stockB)), 330e6);
        assertEq(s.vault.allowedTokens().length, 2, "tokens not allowlisted");
    }

    /// Ownable2Step: the transfer is STARTED, not finished. The deployer must still be owner
    /// so that a typo'd OWNER cannot lock the stack away, and the multisig must be pending.
    function test_handoverIsPendingNotComplete() public {
        DeployProduction.Stack memory s = h.deployWireHandover(_cfg());

        assertEq(s.vault.owner(), DEPLOYER, "vault owner moved too early");
        assertEq(s.oracle.owner(), DEPLOYER);
        assertEq(s.exec.owner(), DEPLOYER);
        assertEq(s.vault.pendingOwner(), MULTISIG, "vault handover not started");
        assertEq(s.oracle.pendingOwner(), MULTISIG);
        assertEq(s.exec.pendingOwner(), MULTISIG);
    }

    /// ...and once the multisig accepts, it owns all three and the deployer is out.
    function test_multisigAcceptanceCompletesHandover() public {
        DeployProduction.Stack memory s = h.deployWireHandover(_cfg());

        vm.startPrank(MULTISIG);
        s.vault.acceptOwnership();
        s.oracle.acceptOwnership();
        s.exec.acceptOwnership();
        vm.stopPrank();

        assertEq(s.vault.owner(), MULTISIG);
        assertEq(s.oracle.owner(), MULTISIG);
        assertEq(s.exec.owner(), MULTISIG);

        // The retired deployer must have no residual authority.
        vm.prank(DEPLOYER);
        vm.expectRevert();
        s.vault.allowToken(address(usdg));
    }

    /// GuardrailConfig holds the risk caps and the swap adapter routes the money, and `_wire`
    /// touches neither — so they must be born owned by the multisig and never spend a moment
    /// under the hot deploy key.
    function test_capsAndSwapNeverPassThroughDeployer() public {
        DeployProduction.Stack memory s = h.deployWireHandover(_cfg());

        assertEq(s.cfg.owner(), MULTISIG, "GuardrailConfig should skip the deployer entirely");
        assertEq(s.swap.owner(), MULTISIG, "swap adapter should skip the deployer entirely");
        assertEq(s.cfg.pendingOwner(), address(0), "no pending handoff should be needed");
    }

    /// The deposit cap must be live the moment the vault is, not left as a checklist item.
    function test_depositCapAppliedAtDeploy() public {
        DeployProduction.Stack memory s = h.deployWireHandover(_cfg());
        assertEq(s.vault.depositCap(), 10_000e6, "cap not applied during wiring");
        assertEq(s.vault.remainingCapacity(), 10_000e6, "empty vault should have full headroom");
        // ERC-4626 checks maxDeposit inside deposit(), so the cap has no bypass.
        assertEq(s.vault.maxDeposit(address(this)), 10_000e6);
    }

    /// The cap bounds real deposits, and bounds them by NAV rather than by a deposit count.
    function test_depositCapBoundsDepositsAndNeverTrapsExits() public {
        DeployProduction.Stack memory s = h.deployWireHandover(_cfg());

        usdg.mint(address(this), 20_000e6);
        usdg.approve(address(s.vault), type(uint256).max);

        s.vault.deposit(9_000e6, address(this));
        assertEq(s.vault.remainingCapacity(), 1_000e6);

        // Over the remaining headroom -> ERC-4626's own max check rejects it.
        vm.expectRevert();
        s.vault.deposit(2_000e6, address(this));

        s.vault.deposit(1_000e6, address(this)); // exactly to the cap is fine
        assertEq(s.vault.remainingCapacity(), 0);
        assertEq(s.vault.maxDeposit(address(this)), 0);

        // Lowering the cap below NAV must stop new money WITHOUT trapping existing capital.
        vm.prank(DEPLOYER);
        s.vault.setDepositCap(1e6);
        assertEq(s.vault.remainingCapacity(), 0);
        uint256 before = usdg.balanceOf(address(this));
        s.vault.withdraw(5_000e6, address(this), address(this));
        assertEq(usdg.balanceOf(address(this)) - before, 5_000e6, "exit must stay open");
    }

    /// A preview run where owner == deployer must not start a self-transfer.
    function test_ownerEqualsDeployer_noHandover() public {
        DeployProduction.Cfg memory c = _cfg();
        c.owner = DEPLOYER;
        DeployProduction.Stack memory s = h.deployWireHandover(c);

        assertEq(s.vault.owner(), DEPLOYER);
        assertEq(s.vault.pendingOwner(), address(0));
    }
}
