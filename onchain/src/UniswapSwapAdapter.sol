// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ISwapAdapter } from "./interfaces/IVaultPeriphery.sol";

/// @notice Uniswap-V2-style router (Pleiades is API-compatible on Robinhood Chain).
interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @title UniswapSwapAdapter
/// @author Aelix
/// @notice Production {ISwapAdapter} over a Uniswap-V2-style router on Robinhood
///         Chain (Uniswap / Pleiades). The narrow, typed surface means the vault's
///         `manager` can only ever route a swap through this fixed router — never an
///         arbitrary contract call. Slippage is enforced by the caller-supplied
///         `minOut` (the router reverts, and we re-check).
///
/// @dev    For a V3 (concentrated-liquidity) deployment, swap this for a variant
///         that calls `exactInputSingle`/`exactInput`; the vault interface is
///         unchanged. `hopToken` routes through an intermediary (e.g. WETH/USDG)
///         when there is no direct pool for the pair.
contract UniswapSwapAdapter is ISwapAdapter, Ownable2Step {
    using SafeERC20 for IERC20;

    IUniswapV2Router public router;
    address public hopToken; // optional intermediary; address(0) = direct pools only

    event RouterSet(address indexed router);
    event HopTokenSet(address indexed hop);

    error InsufficientOutput();

    constructor(address router_, address hopToken_, address owner_) Ownable(owner_) {
        router = IUniswapV2Router(router_);
        hopToken = hopToken_;
    }

    function setRouter(address r) external onlyOwner {
        router = IUniswapV2Router(r);
        emit RouterSet(r);
    }

    function setHopToken(address h) external onlyOwner {
        hopToken = h;
        emit HopTokenSet(h);
    }

    /// @inheritdoc ISwapAdapter
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        external
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(router), amountIn);

        address[] memory path;
        if (hopToken != address(0) && tokenIn != hopToken && tokenOut != hopToken) {
            path = new address[](3);
            path[0] = tokenIn;
            path[1] = hopToken;
            path[2] = tokenOut;
        } else {
            path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;
        }

        uint256[] memory amounts =
            router.swapExactTokensForTokens(amountIn, minOut, path, to, block.timestamp);
        // Zero any residual allowance (e.g. if the router pulled less than amountIn, as a
        // fee-on-transfer tokenIn could cause) so no standing approval lingers (LOW-3).
        IERC20(tokenIn).forceApprove(address(router), 0);
        amountOut = amounts[amounts.length - 1];
        if (amountOut < minOut) revert InsufficientOutput();
    }
}
