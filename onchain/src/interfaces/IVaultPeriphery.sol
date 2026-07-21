// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPriceOracle
/// @notice Minimal price feed the vault reads to value Stock Tokens in USDG terms.
///         In production this is an adapter over Robinhood Chain's Chainlink feeds
///         for Stock Tokens; in tests it is a settable mock.
/// @dev    `price` returns the value of ONE WHOLE token expressed in **USDG native
///         units** (i.e. scaled by USDG's decimals, not a hardcoded 1e18). The vault
///         then divides by 10**tokenDecimals to value an arbitrary balance, so both
///         non-18-decimal USDG and non-18-decimal Stock Tokens are handled.
///         Example: token worth 50 USDG, USDG has 18 decimals -> returns 50e18;
///         USDG has 6 decimals -> returns 50e6.
interface IPriceOracle {
    function price(address token) external view returns (uint256 priceE18);
}

/// @title ISwapAdapter
/// @notice Narrow, typed swap surface the vault is allowed to call. Using a fixed,
///         owner-set adapter (instead of arbitrary router calldata) means the
///         manager can never redirect a "swap" into an arbitrary contract call.
///         Production adapters wrap Uniswap / Pleiades / 1inch on Robinhood Chain.
interface ISwapAdapter {
    /// @notice Swap `amountIn` of `tokenIn` for at least `minOut` of `tokenOut`,
    ///         sending the output to `to`. Pulls `tokenIn` from msg.sender via
    ///         transferFrom (caller must approve first).
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        external
        returns (uint256 amountOut);
}
