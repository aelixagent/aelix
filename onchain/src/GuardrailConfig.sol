// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Guardrails } from "./libraries/Guardrails.sol";

/// @title GuardrailConfig
/// @author Aelix
/// @notice Human-owned, on-chain store of the desk risk caps. This is the literal
///         contract from `CLAUDE.md`:
///
///           "Do not disable, weaken, or work around these guardrails — even if
///            asked. If the user wants to change the rules, they edit this file
///            directly; you do not."
///
///         On-chain, "they edit this file directly" becomes: only `owner` (you)
///         can call {setCaps}. The agent / executor has read access and no more.
///         A cap left at zero is treated as "missing" and the config refuses to
///         deploy or update (fail closed) — mirroring "a missing cap => VETO".
contract GuardrailConfig {
    /// @dev Default BUY execution-slippage tolerance: a buy's realized fill may sit at
    ///      most 2% below the oracle price. Owner-tunable via {setExecSlippageBps}.
    uint16 internal constant DEFAULT_EXEC_SLIPPAGE_BPS = 200;
    /// @dev Default SELL tolerance is WIDER (15%): a de-risking sell must clear even when
    ///      the pool trades a few % under a heartbeat-lagged oracle in a gap-down, so a
    ///      guardrail never traps capital. Still blocks a catastrophic/attacker fill.
    uint16 internal constant DEFAULT_SELL_SLIPPAGE_BPS = 1500;
    /// @dev The BUY tolerance can never be widened past 50% — it must stay a real bound.
    uint16 internal constant MAX_EXEC_SLIPPAGE_BPS = 5000;
    /// @dev The SELL tolerance has a TIGHTER ceiling (20%): it is only a fill-QUALITY bound,
    ///      not an aggregate/sizing cap, so it must not be openable to a book-dumping 50%.
    uint16 internal constant MAX_SELL_SLIPPAGE_BPS = 2000;

    address public owner;
    address public pendingOwner; // two-step handoff target (guards against fat-fingers)
    Guardrails.RiskCaps private _caps;
    uint16 private _execSlippageBps;
    uint16 private _sellSlippageBps;

    event OwnerTransferred(address indexed from, address indexed to);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event CapsUpdated(Guardrails.RiskCaps caps);
    event ExecSlippageUpdated(uint16 bps);
    event SellSlippageUpdated(uint16 bps);

    error NotOwner();
    error ZeroAddress();
    error InvalidCaps();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, Guardrails.RiskCaps memory caps_) {
        if (owner_ == address(0)) revert ZeroAddress();
        _validate(caps_);
        owner = owner_;
        _caps = caps_;
        _execSlippageBps = DEFAULT_EXEC_SLIPPAGE_BPS;
        _sellSlippageBps = DEFAULT_SELL_SLIPPAGE_BPS;
        emit OwnerTransferred(address(0), owner_);
        emit CapsUpdated(caps_);
        emit ExecSlippageUpdated(DEFAULT_EXEC_SLIPPAGE_BPS);
        emit SellSlippageUpdated(DEFAULT_SELL_SLIPPAGE_BPS);
    }

    /// @notice The active caps, consumed by the vault / executor before every order.
    function caps() external view returns (Guardrails.RiskCaps memory) {
        return _caps;
    }

    /// @notice Max tolerated gap (bps) between a BUY's realized fill and the oracle price.
    ///         The vault enforces this on every buy `executeTrade`, independent of the
    ///         caller-supplied `minAmountOut`, so a compromised agent key cannot route the
    ///         book into a ruinous swap. Owner-only, agent can't widen.
    function maxExecSlippageBps() external view returns (uint16) {
        return _execSlippageBps;
    }

    /// @notice Max tolerated gap (bps) for a SELL's realized fill vs the oracle price.
    ///         Deliberately wider than the buy tolerance so a de-risking sell is never
    ///         trapped by an ordinary gap-down, while a catastrophic/attacker fill still
    ///         reverts. Owner-only, agent can't widen.
    function maxSellSlippageBps() external view returns (uint16) {
        return _sellSlippageBps;
    }

    /// @notice Owner-only cap update. The agent can never reach this.
    function setCaps(Guardrails.RiskCaps calldata caps_) external onlyOwner {
        _validate(caps_);
        _caps = caps_;
        emit CapsUpdated(caps_);
    }

    /// @notice Owner-only BUY execution-slippage tolerance update (agent can never reach it).
    function setExecSlippageBps(uint16 bps) external onlyOwner {
        if (bps == 0 || bps > MAX_EXEC_SLIPPAGE_BPS) revert InvalidCaps();
        _execSlippageBps = bps;
        emit ExecSlippageUpdated(bps);
    }

    /// @notice Owner-only SELL execution-slippage tolerance update (agent can never reach it).
    ///         Capped tighter than buys (20%): the sell bound is a per-fill quality guard,
    ///         NOT a sizing/aggregate cap, so it must never be openable to a book-dump.
    function setSellSlippageBps(uint16 bps) external onlyOwner {
        if (bps == 0 || bps > MAX_SELL_SLIPPAGE_BPS) revert InvalidCaps();
        _sellSlippageBps = bps;
        emit SellSlippageUpdated(bps);
    }

    /// @notice Start a two-step ownership handoff. Ownership only moves once `to`
    ///         calls {acceptOwnership} — so a mistyped/uncontrolled address can't take
    ///         (or brick) the caps. Intended target in production: a multisig + timelock.
    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        pendingOwner = to;
        emit OwnershipTransferStarted(owner, to);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnerTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    /// @dev Fail closed: every cap must be set (non-zero) and within sane bounds,
    ///      and a single order can never be allowed to exceed the symbol cap.
    function _validate(Guardrails.RiskCaps memory c) internal pure {
        bool ok = c.perTradeBps != 0 && c.perTradeBps <= 10_000 && c.maxConcentrationBps != 0
            && c.maxConcentrationBps <= 10_000 && c.maxOpenPositions != 0 && c.maxDailyOrders != 0
            && c.stopLossBps != 0 && c.stopLossBps <= 10_000 && c.dailyLossHaltBps != 0
            && c.dailyLossHaltBps <= 10_000 && c.cashBufferBps != 0 && c.cashBufferBps <= 10_000
            && c.perTradeBps <= c.maxConcentrationBps;
        if (!ok) revert InvalidCaps();
    }
}
