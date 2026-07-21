// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { Guardrails } from "./libraries/Guardrails.sol";
import { GuardrailConfig } from "./GuardrailConfig.sol";
import { IPriceOracle, ISwapAdapter } from "./interfaces/IVaultPeriphery.sol";

/// @title RWAVault
/// @author Aelix
/// @notice A non-custodial, AI-managed ERC-4626 vault for tokenized real-world
///         assets (Robinhood Chain Stock Tokens). Depositors provide USDG and hold
///         vault shares; the desk `manager` rebalances the book — but EVERY trade
///         is checked against {GuardrailConfig} at the custody layer, so the caps
///         in `CLAUDE.md` / `strategies/README.md` cannot be bypassed even by a
///         fully-compromised manager key.
///
/// @dev    - `asset()` is USDG (the accounting/stable leg). `totalAssets()` is the
///           full portfolio value: USDG cash + every allowlisted Stock Token priced
///           by the oracle. Share price therefore tracks the whole book.
///         - Standard ERC-4626 withdrawals are served from USDG cash; `maxWithdraw`
///           / `maxRedeem` are capped to that liquidity so the invariants hold. The
///           always-solvent escape hatch is {redeemInKind}: pro-rata USDG + tokens.
///         - Valuation is decimal-robust: `positionValue` divides by 10**decimals and
///           relies on the oracle returning USDG-native units, so non-18-decimal USDG
///           (e.g. 6-dec Paxos USDG) and Stock Tokens are valued correctly.
///         - Every trade's realized fill is bounded to the oracle price
///           ({GuardrailConfig.maxExecSlippageBps}) so a compromised manager cannot
///           route the book into a ruinous swap, regardless of the order's `minAmountOut`.
contract RWAVault is ERC4626, Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;
    uint256 private constant PPS_SCALE = 1e18; // fixed-point scale for price-per-share

    /// @dev One rebalance instruction from the desk.
    struct TradeOrder {
        address stockToken; //     allowlisted Stock Token leg
        bool isBuy; //             true: USDG -> stock; false: stock -> USDG
        uint256 amountIn; //       isBuy: USDG spent; sell: Stock Token sold
        uint256 minAmountOut; //   slippage floor (adapter must meet or exceed)
        uint256 stopPriceE18; //   required for buys: a real stop below market
        bool leftSideException; // approved left-side ladder add? (see strategy file)
    }

    GuardrailConfig public guardrailConfig;
    IPriceOracle public oracle;
    ISwapAdapter public swapAdapter;
    address public manager;

    address[] private _allowed;
    mapping(address => bool) public isAllowed;
    mapping(address => uint8) public tokenDecimals; // cached decimals of each Stock Token
    mapping(address => uint256) public costBasisUsdg; // net USDG invested per token
    mapping(address => uint256) public stopPriceE18; //  last stop set per token

    uint8 public ordersToday;
    uint256 public currentDay;
    uint256 public dayStartPps; // price-per-share at day start — the flow-invariant halt baseline
    uint256 public lastPps; // last observed price-per-share; carried into the next day's baseline
    uint256 public haltedDay; // day index for which trading is latched-halted

    event ManagerSet(address indexed manager);
    event OracleSet(address indexed oracle);
    event SwapAdapterSet(address indexed adapter);
    event GuardrailConfigSet(address indexed config);
    event TokenAllowed(address indexed token);
    event TokenDisallowed(address indexed token);
    event TradeExecuted(
        address indexed token, bool isBuy, uint256 amountIn, uint256 amountOut, uint8 ordersToday
    );
    event RedeemedInKind(address indexed owner, address indexed receiver, uint256 shares);
    event Halted(uint256 indexed day);

    error NotManager();
    error TokenNotAllowed();
    error ZeroAmount();
    error InsufficientCash();
    error InsufficientPosition();
    error Slippage();
    error ExecSlippage();
    error StillHeld();
    error FeedDown();
    error GuardrailViolation(Guardrails.Violation violation);

    modifier onlyManager() {
        if (msg.sender != manager) revert NotManager();
        _;
    }

    constructor(
        IERC20 usdg,
        string memory name_,
        string memory symbol_,
        address owner_,
        GuardrailConfig config_,
        IPriceOracle oracle_,
        ISwapAdapter adapter_,
        address manager_
    ) ERC20(name_, symbol_) ERC4626(usdg) Ownable(owner_) {
        guardrailConfig = config_;
        oracle = oracle_;
        swapAdapter = adapter_;
        manager = manager_;
    }

    // =============================================================== admin (human owner)

    function setManager(address m) external onlyOwner {
        manager = m;
        emit ManagerSet(m);
    }

    function setOracle(IPriceOracle o) external onlyOwner {
        oracle = o;
        emit OracleSet(address(o));
    }

    function setSwapAdapter(ISwapAdapter a) external onlyOwner {
        swapAdapter = a;
        emit SwapAdapterSet(address(a));
    }

    function setGuardrailConfig(GuardrailConfig c) external onlyOwner {
        guardrailConfig = c;
        emit GuardrailConfigSet(address(c));
    }

    /// @notice Emergency circuit breaker: freezes new deposits/mints and trading. The
    ///         exit side (`withdraw` / `redeem` / `redeemInKind`) stays OPEN, so a pause
    ///         can never trap capital. Owner-only (put behind a multisig/timelock in prod).
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---- deposit side is pausable; the exit side deliberately is not ----

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        return super.mint(shares, receiver);
    }

    /// @dev Exit paths are NOT pausable (never trap capital) but ARE reentrancy-guarded,
    ///      so a malicious asset/hook token cannot reenter mid-withdrawal (LOW-1).
    function withdraw(uint256 assets, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return super.withdraw(assets, receiver, owner_);
    }

    function redeem(uint256 shares, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return super.redeem(shares, receiver, owner_);
    }

    function maxDeposit(address receiver) public view override returns (uint256) {
        return paused() ? 0 : super.maxDeposit(receiver);
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return paused() ? 0 : super.maxMint(receiver);
    }

    function allowToken(address token) external onlyOwner {
        if (!isAllowed[token]) {
            // Require a working price feed up front (real oracle reverts on a missing/
            // stale feed) so a token can never be listed before it can be valued.
            oracle.price(token);
            isAllowed[token] = true;
            tokenDecimals[token] = IERC20Metadata(token).decimals();
            _allowed.push(token);
            emit TokenAllowed(token);
        }
    }

    /// @dev A token can only be removed once fully sold (no dangling value).
    function disallowToken(address token) external onlyOwner {
        if (!isAllowed[token]) return;
        if (IERC20(token).balanceOf(address(this)) != 0) revert StillHeld();
        isAllowed[token] = false;
        uint256 len = _allowed.length;
        for (uint256 i; i < len; ++i) {
            if (_allowed[i] == token) {
                _allowed[i] = _allowed[len - 1];
                _allowed.pop();
                break;
            }
        }
        emit TokenDisallowed(token);
    }

    // =============================================================== valuation / views

    function allowedTokens() external view returns (address[] memory) {
        return _allowed;
    }

    function _price(address token) internal view returns (uint256) {
        return oracle.price(token);
    }

    /// @dev `_price` returns the USDG-native value of ONE WHOLE token, so we divide
    ///      by 10**tokenDecimals to value an arbitrary balance (decimal-robust).
    ///      Valuation fails OPEN (unlike trading, which fails closed): an empty leg is
    ///      skipped without touching the oracle, and if a non-empty leg's feed is
    ///      dead/stale/reverting we exclude it (value 0) instead of letting one bad
    ///      feed brick every NAV-dependent path. So NAV survives a dead feed on ANY
    ///      balance — including a 1-wei dust donation of an allowlisted token (H2).
    ///      Excluding a live holding UNDERstates NAV (conservative: withdrawers can
    ///      never over-draw), and {redeemInKind} still returns the real token pro-rata.
    function positionValue(address token) public view returns (uint256) {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal == 0) return 0;
        try oracle.price(token) returns (uint256 p) {
            return (bal * p) / (10 ** tokenDecimals[token]);
        } catch {
            return 0;
        }
    }

    /// @notice Full portfolio value in USDG: cash + every Stock Token holding.
    function navUsdg() public view returns (uint256 nav) {
        nav = IERC20(asset()).balanceOf(address(this));
        uint256 len = _allowed.length;
        for (uint256 i; i < len; ++i) {
            nav += positionValue(_allowed[i]);
        }
    }

    function openPositions() public view returns (uint256 n) {
        uint256 len = _allowed.length;
        for (uint256 i; i < len; ++i) {
            if (IERC20(_allowed[i]).balanceOf(address(this)) > 0) ++n;
        }
    }

    function isUnderwater(address token) public view returns (bool) {
        if (IERC20(token).balanceOf(address(this)) == 0) return false;
        return positionValue(token) < costBasisUsdg[token];
    }

    /// @dev True if any token the vault INTENTIONALLY holds (cost basis > 0, non-zero
    ///      balance) currently has an unpriceable feed. positionValue() fails OPEN for
    ///      the NAV *view* (dust-resilient), but the share-BACKING NAV must fail CLOSED
    ///      for a material holding: otherwise a depositor could mint shares against an
    ///      understated NAV and extract the difference via the oracle-free {redeemInKind}
    ///      (H2 mint-side theft). A pure donation/dust leg has costBasis == 0 and is
    ///      correctly ignored here, so it can never brick the share paths.
    function _materialFeedDown() internal view returns (bool) {
        uint256 len = _allowed.length;
        for (uint256 i; i < len; ++i) {
            address t = _allowed[i];
            if (costBasisUsdg[t] == 0) continue; // donation/dust — never bought
            if (IERC20(t).balanceOf(address(this)) == 0) continue;
            try oracle.price(t) returns (uint256) { }
                catch {
                return true;
            }
        }
        return false;
    }

    /// @notice ERC-4626 hook: total value backing the shares. Fails CLOSED (reverts) if a
    ///         material holding can't be priced, so shares are never minted/burned against
    ///         a silently-understated NAV. The always-solvent {redeemInKind} exit stays
    ///         open regardless (it reads raw balances, never the oracle).
    function totalAssets() public view override returns (uint256) {
        if (_materialFeedDown()) revert FeedDown();
        return navUsdg();
    }

    /// @dev Price-per-share = NAV / shares (scaled). Invariant to deposits/withdrawals
    ///      (they mint/burn shares at exactly this ratio), so it is the correct anchor
    ///      for a daily-loss halt that must ignore capital flows and react only to real
    ///      P&L (trade losses + overnight gaps). Returns 0 for an empty vault.
    function _pps() internal view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 0;
        return (navUsdg() * PPS_SCALE) / supply;
    }

    /// @dev The day-start price-per-share that a state-changing call would use — mirrors
    ///      {_refreshDay} so a VIEW (previewTrade) computes the SAME baseline executeTrade
    ///      will, even on the first interaction of a new day (QW fix: preview and execute
    ///      must not disagree across a day boundary).
    function _effectiveDayStartPps() internal view returns (uint256) {
        // forge-lint: disable-next-line(block-timestamp) — day-bucket granularity only
        if (block.timestamp / 1 days != currentDay) {
            return lastPps != 0 ? lastPps : _pps();
        }
        return dayStartPps;
    }

    /// @dev The day-start price-per-share re-expressed at the CURRENT share supply —
    ///      i.e. what the book would be worth now had per-share value not moved since
    ///      day start. The halt compares live NAV against THIS, not a raw stored NAV,
    ///      which is what makes it immune to deposits (M1 fix).
    function _baselineNav() internal view returns (uint256) {
        return (_effectiveDayStartPps() * totalSupply()) / PPS_SCALE;
    }

    function _dayPnl(uint256 nav) internal view returns (int256) {
        if (_effectiveDayStartPps() == 0) return int256(0);
        // forge-lint: disable-next-line(unsafe-typecast) — NAV in USDG is << int256 max
        return int256(nav) - int256(_baselineNav());
    }

    /// @notice Build the guardrail context for an order (used by preview + execute).
    function _context(TradeOrder memory o)
        internal
        view
        returns (Guardrails.TradeContext memory c)
    {
        uint256 nav = navUsdg();
        uint256 cash = IERC20(asset()).balanceOf(address(this));
        c.isBuy = o.isBuy;
        c.nav = nav;
        c.dayPnl = _dayPnl(nav);
        c.ordersToday = ordersToday;
        // haltedDay == 0 is the "never halted" sentinel; guard against it colliding
        // with day 0 on local/genesis chains (real chains have large timestamps).
        // forge-lint: disable-next-line(block-timestamp) — day-bucket granularity only
        c.dailyHalted = (haltedDay != 0 && haltedDay == block.timestamp / 1 days);

        if (o.isBuy) {
            uint256 pv = positionValue(o.stockToken);
            c.tradeNotional = o.amountIn; // USDG spent
            c.cashAfter = cash >= o.amountIn ? cash - o.amountIn : 0;
            c.positionValueAfter = pv + o.amountIn; // oracle-priced execution ≈ +amountIn
            c.openPositionsAfter = uint8(openPositions() + (pv == 0 ? 1 : 0));
            c.positionIsUnderwater = isUnderwater(o.stockToken);
            c.leftSideException = o.leftSideException;
            c.hasStop = o.stopPriceE18 > 0 && o.stopPriceE18 < _price(o.stockToken);
        } else {
            uint256 notional =
                (o.amountIn * _price(o.stockToken)) / (10 ** tokenDecimals[o.stockToken]);
            c.tradeNotional = notional;
            c.cashAfter = cash + notional;
            // remaining fields default to 0/false — irrelevant for a de-risking sell
        }
    }

    /// @notice Dry-run the guardrails for an order without executing. This is the
    ///         on-chain analogue of CLAUDE.md's "present a preview, then get
    ///         approval": the desk/UI can show exactly which rule an order would
    ///         hit (or `None`) before anyone signs.
    function previewTrade(TradeOrder calldata o) external view returns (Guardrails.Violation) {
        // Static guardrail preview: surfaces the DETERMINISTIC reverts executeTrade would
        // hit for this order, in the same precedence, before anyone signs. Distinct
        // sentinels so a UI never reads "None" (allowed) for an order that is guaranteed
        // to revert. Fill-DEPENDENT reverts (Slippage / ExecSlippage / post-trade
        // Concentration) cannot be known without executing and are intentionally out of
        // scope here — the preview models the book, not the AMM.
        if (paused()) return Guardrails.Violation.Paused;
        if (!isAllowed[o.stockToken]) return Guardrails.Violation.NotAllowed;
        if (o.amountIn == 0) return Guardrails.Violation.ZeroAmount;
        if (!o.isBuy && IERC20(o.stockToken).balanceOf(address(this)) < o.amountIn) {
            return Guardrails.Violation.InsufficientPosition;
        }
        return Guardrails.evaluate(guardrailConfig.caps(), _context(o));
    }

    /// @notice USDG notional of an order (buy: cash spent; sell: oracle value of the
    ///         Stock Token sold). Used by the session-key layer to size delegations.
    function tradeNotionalUsdg(TradeOrder calldata o) external view returns (uint256) {
        if (o.isBuy) return o.amountIn;
        return (o.amountIn * _price(o.stockToken)) / (10 ** tokenDecimals[o.stockToken]);
    }

    // =============================================================== manager trading

    /// @dev Bound a realized fill to the oracle price. Independent of the caller's
    ///      `minAmountOut` (which the agent controls), so a compromised manager cannot
    ///      route the vault into a ruinous swap via a thin/attacker pool. Tolerances are
    ///      owner-set in {GuardrailConfig}; the agent can never widen them.
    ///
    ///      H1 fix: buys use the TIGHT tolerance, sells a WIDER one. A de-risking sell
    ///      must not revert just because the pool legitimately trades a few % under a
    ///      heartbeat-lagged oracle during a gap-down (that would trap capital exactly
    ///      when exiting matters most). The wide sell bound still reverts a catastrophic
    ///      / attacker fill, so "sells never trap capital" holds for ordinary moves
    ///      while the anti-drain guarantee survives for egregious ones.
    function _enforceExecBound(address token, uint256 amountIn, uint256 amountOut, bool isBuy)
        internal
        view
    {
        uint256 slip =
            isBuy ? guardrailConfig.maxExecSlippageBps() : guardrailConfig.maxSellSlippageBps();
        uint256 price = _price(token); // USDG-native value of one whole token
        uint256 expected = isBuy
            ? (amountIn * (10 ** tokenDecimals[token])) / price  // stock units for amountIn USDG
            : (amountIn * price) / (10 ** tokenDecimals[token]); // USDG for amountIn stock
        if (amountOut < (expected * (BPS - slip)) / BPS) revert ExecSlippage();
    }

    function _refreshDay() internal {
        uint256 today = block.timestamp / 1 days;
        if (today != currentDay) {
            currentDay = today;
            ordersToday = 0;
            // M1 (fixed): anchor to the prior day's last-observed price-per-share, which
            // is invariant to deposits/withdrawals. An overnight/weekend drawdown is
            // still counted (per-share value moved), but ordinary share flows can neither
            // defeat (net inflow) nor spuriously trip (net outflow) the daily-loss halt.
            // Falls back to the live pps only on the very first interaction.
            dayStartPps = lastPps != 0 ? lastPps : _pps();
        }
    }

    /// @notice Execute one guardrail-checked rebalance. Reverts with the specific
    ///         {Guardrails.Violation} if the order breaks a cap.
    function executeTrade(TradeOrder calldata o)
        external
        onlyManager
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        if (!isAllowed[o.stockToken]) revert TokenNotAllowed();
        if (o.amountIn == 0) revert ZeroAmount();
        _refreshDay();

        Guardrails.TradeContext memory c = _context(o);
        // Halt applies live via day P&L inside evaluate() AND via the persistent
        // latch flag in the context. We cannot write the latch here: a violating
        // order reverts, which would roll the write back. It is committed instead
        // by {latchHalt} / {_maybeLatch} on non-reverting paths.
        Guardrails.Violation v = Guardrails.evaluate(guardrailConfig.caps(), c);
        if (v != Guardrails.Violation.None) revert GuardrailViolation(v);

        if (o.isBuy) {
            IERC20 usdg = IERC20(asset());
            if (usdg.balanceOf(address(this)) < o.amountIn) revert InsufficientCash();
            usdg.forceApprove(address(swapAdapter), o.amountIn);
            amountOut = swapAdapter.swap(
                address(usdg), o.stockToken, o.amountIn, o.minAmountOut, address(this)
            );
            if (amountOut < o.minAmountOut) revert Slippage();
            _enforceExecBound(o.stockToken, o.amountIn, amountOut, true);
            costBasisUsdg[o.stockToken] += o.amountIn;
            stopPriceE18[o.stockToken] = o.stopPriceE18;
            // M4: re-check concentration against the ACTUAL position acquired (oracle-
            // valued), not the pre-trade `pv + amountIn` estimate — a favorable fill
            // can't push the symbol past the cap.
            if (
                positionValue(o.stockToken) * BPS
                    > uint256(guardrailConfig.caps().maxConcentrationBps) * navUsdg()
            ) revert GuardrailViolation(Guardrails.Violation.Concentration);
        } else {
            IERC20 token = IERC20(o.stockToken);
            uint256 qtyBefore = token.balanceOf(address(this));
            if (qtyBefore < o.amountIn) revert InsufficientPosition();
            token.forceApprove(address(swapAdapter), o.amountIn);
            amountOut = swapAdapter.swap(
                o.stockToken, address(asset()), o.amountIn, o.minAmountOut, address(this)
            );
            if (amountOut < o.minAmountOut) revert Slippage();
            _enforceExecBound(o.stockToken, o.amountIn, amountOut, false);
            uint256 cb = costBasisUsdg[o.stockToken];
            costBasisUsdg[o.stockToken] = cb - (cb * o.amountIn) / qtyBefore;
        }

        ordersToday += 1;
        _maybeLatch(); // a successful trade during a drawdown persists the halt
        lastPps = _pps(); // record close-of-activity price-per-share for the next day's baseline
        emit TradeExecuted(o.stockToken, o.isBuy, o.amountIn, amountOut, ordersToday);
    }

    /// @notice Permissionlessly latch the daily-loss halt if the desk is currently
    ///         down >= the halt threshold. Persists "stop trading for the rest of
    ///         the day" even if NAV later recovers. Live day-P&L halting always
    ///         applies too, via {Guardrails.evaluate}.
    function latchHalt() external {
        _refreshDay();
        _maybeLatch();
        lastPps = _pps();
    }

    function _maybeLatch() internal {
        if (dayStartPps == 0) return;
        uint256 nav = navUsdg();
        uint256 baseline = _baselineNav();
        if (nav >= baseline) return;
        uint256 loss = baseline - nav;
        if (loss * 10_000 >= uint256(guardrailConfig.caps().dailyLossHaltBps) * nav) {
            uint256 today = block.timestamp / 1 days;
            if (haltedDay != today) {
                haltedDay = today;
                emit Halted(today);
            }
        }
    }

    // =============================================================== redemptions

    /// @dev Standard ERC-4626 withdrawals are capped to USDG cash liquidity.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        uint256 byShares = super.maxWithdraw(owner_);
        uint256 liquidity = IERC20(asset()).balanceOf(address(this));
        return Math.min(byShares, liquidity);
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 liquidity = IERC20(asset()).balanceOf(address(this));
        uint256 sharesForLiquidity = convertToShares(liquidity);
        return Math.min(balanceOf(owner_), sharesForLiquidity);
    }

    /// @notice Always-solvent exit: burn `shares` and receive a pro-rata slice of
    ///         USDG cash AND every Stock Token holding. Never forces the desk to
    ///         sell, and cannot fail for lack of cash.
    function redeemInKind(uint256 shares, address receiver) external nonReentrant {
        if (shares == 0) revert ZeroAmount();
        uint256 supply = totalSupply();
        _burn(msg.sender, shares); // reverts if caller lacks the shares

        IERC20 usdg = IERC20(asset());
        uint256 usdgOut = (usdg.balanceOf(address(this)) * shares) / supply;

        uint256 len = _allowed.length;
        uint256[] memory amts = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            amts[i] = (IERC20(_allowed[i]).balanceOf(address(this)) * shares) / supply;
        }

        if (usdgOut > 0) usdg.safeTransfer(receiver, usdgOut);
        for (uint256 i; i < len; ++i) {
            uint256 cb = costBasisUsdg[_allowed[i]];
            if (cb > 0) costBasisUsdg[_allowed[i]] = cb - (cb * shares) / supply;
            if (amts[i] > 0) IERC20(_allowed[i]).safeTransfer(receiver, amts[i]);
        }
        emit RedeemedInKind(msg.sender, receiver, shares);
    }
}
