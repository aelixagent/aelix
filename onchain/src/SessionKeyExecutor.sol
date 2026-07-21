// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { RWAVault } from "./RWAVault.sol";

/// @title SessionKeyExecutor
/// @author Aelix
/// @notice The authorization layer between the AI desk and the vault. It is set as
///         the vault's `manager`, and the human owner delegates trading to agent
///         keys through revocable, expiring, tightly-scoped "sessions" — the same
///         DESIGN INTENT as ERC-4337 session keys (scoped, revocable, expiring
///         delegation), implemented here directly at the contract layer over plain
///         EOA agent keys. It does NOT use the ERC-4337 EntryPoint/UserOperation
///         machinery; pairing it with a 4337 smart account is an optional deployment
///         choice, not a property of this contract.
///
/// @dev    Defense in depth, two independent layers:
///           1. This executor: per-agent scoping — expiry, per-trade notional cap,
///              cumulative notional cap, max trade count, token allowlist, side
///              (buy/sell) permission. Revocable instantly by the owner.
///           2. {RWAVault}: the hard, non-bypassable CLAUDE.md risk caps.
///         A trade the vault rejects reverts the whole call, so a rejected order
///         consumes NONE of the session budget.
contract SessionKeyExecutor is Ownable2Step, ReentrancyGuard {
    struct Session {
        bool active;
        uint64 expiry; //               unix ts after which the key is dead
        uint256 maxNotionalPerTrade; // tighter-than-vault per-order cap (USDG)
        uint32 maxTrades; //            cumulative order count allowed
        uint32 tradesUsed;
        uint256 maxCumNotional; //      cumulative notional budget (USDG)
        uint256 cumNotionalUsed;
        bool buysAllowed;
        bool sellsAllowed;
    }

    RWAVault public immutable vault;
    mapping(address => Session) public sessions;
    // M3: token scope is keyed by a per-agent grant nonce. Re-granting bumps the nonce,
    // so a previous grant's token allowlist auto-expires instead of lingering.
    mapping(address => uint256) public sessionNonce;
    mapping(address => mapping(uint256 => mapping(address => bool))) private _tokenAllowed;

    event SessionGranted(
        address indexed agent, uint64 expiry, uint256 maxPerTrade, uint32 maxTrades, uint256 maxCum
    );
    event SessionRevoked(address indexed agent);
    event TokenScopeSet(address indexed agent, address indexed token, bool allowed);
    event AgentTraded(
        address indexed agent,
        address indexed token,
        bool isBuy,
        uint256 notional,
        uint256 amountOut
    );

    error NoActiveSession();
    error SessionExpired();
    error PerTradeExceeded();
    error CumNotionalExceeded();
    error MaxTradesReached();
    error TokenNotInSession();
    error SideNotAllowed();

    constructor(RWAVault vault_, address owner_) Ownable(owner_) {
        vault = vault_;
    }

    // =============================================================== owner delegation

    function grantSession(
        address agent,
        uint64 expiry,
        uint256 maxNotionalPerTrade,
        uint32 maxTrades,
        uint256 maxCumNotional,
        bool buysAllowed,
        bool sellsAllowed,
        address[] calldata tokens
    ) external onlyOwner {
        uint256 nonce = ++sessionNonce[agent]; // invalidates any prior grant's token scope
        sessions[agent] = Session({
            active: true,
            expiry: expiry,
            maxNotionalPerTrade: maxNotionalPerTrade,
            maxTrades: maxTrades,
            tradesUsed: 0,
            maxCumNotional: maxCumNotional,
            cumNotionalUsed: 0,
            buysAllowed: buysAllowed,
            sellsAllowed: sellsAllowed
        });
        for (uint256 i; i < tokens.length; ++i) {
            _tokenAllowed[agent][nonce][tokens[i]] = true;
            emit TokenScopeSet(agent, tokens[i], true);
        }
        emit SessionGranted(agent, expiry, maxNotionalPerTrade, maxTrades, maxCumNotional);
    }

    function revokeSession(address agent) external onlyOwner {
        sessions[agent].active = false;
        emit SessionRevoked(agent);
    }

    function setTokenAllowed(address agent, address token, bool allowed) external onlyOwner {
        _tokenAllowed[agent][sessionNonce[agent]][token] = allowed;
        emit TokenScopeSet(agent, token, allowed);
    }

    /// @notice Whether `token` is in `agent`'s CURRENT session scope (latest grant only).
    function tokenAllowed(address agent, address token) public view returns (bool) {
        return _tokenAllowed[agent][sessionNonce[agent]][token];
    }

    // =============================================================== agent trading

    /// @notice Called by an agent session key. Enforces the session scope, then
    ///         forwards to the vault (which re-applies the hard guardrails).
    function trade(RWAVault.TradeOrder calldata o)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        Session storage s = sessions[msg.sender];
        if (!s.active) revert NoActiveSession();
        // forge-lint: disable-next-line(block-timestamp) — expiry is day+ scale; validator drift is negligible
        if (block.timestamp > s.expiry) revert SessionExpired();
        if (s.tradesUsed >= s.maxTrades) revert MaxTradesReached();
        if (o.isBuy && !s.buysAllowed) revert SideNotAllowed();
        if (!o.isBuy && !s.sellsAllowed) revert SideNotAllowed();
        if (!_tokenAllowed[msg.sender][sessionNonce[msg.sender]][o.stockToken]) {
            revert TokenNotInSession();
        }

        uint256 notional = vault.tradeNotionalUsdg(o);
        if (notional > s.maxNotionalPerTrade) revert PerTradeExceeded();
        if (s.cumNotionalUsed + notional > s.maxCumNotional) revert CumNotionalExceeded();

        // Reserve budget BEFORE the external call. If the vault reverts on a hard
        // guardrail, the whole tx reverts and these writes roll back — so rejected
        // trades cost nothing.
        s.tradesUsed += 1;
        s.cumNotionalUsed += notional;

        amountOut = vault.executeTrade(o);
        emit AgentTraded(msg.sender, o.stockToken, o.isBuy, notional, amountOut);
    }

    // =============================================================== views

    function remainingTrades(address agent) external view returns (uint256) {
        Session storage s = sessions[agent];
        return s.maxTrades > s.tradesUsed ? s.maxTrades - s.tradesUsed : 0;
    }

    function remainingNotional(address agent) external view returns (uint256) {
        Session storage s = sessions[agent];
        return s.maxCumNotional > s.cumNotionalUsed ? s.maxCumNotional - s.cumNotionalUsed : 0;
    }

    function isLive(address agent) external view returns (bool) {
        Session storage s = sessions[agent];
        // forge-lint: disable-next-line(block-timestamp) — view helper; expiry is day+ scale
        return s.active && block.timestamp <= s.expiry && s.tradesUsed < s.maxTrades;
    }
}
