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

    /// @notice Seconds added to `block.timestamp` to form the router swap deadline. A real,
    ///         short deadline bounds how long a signed/pending swap can sit in the mempool
    ///         before it must be re-quoted — passing `block.timestamp` alone effectively
    ///         disables the router's deadline protection.
    uint256 public deadlineBuffer;

    /// @dev Hard bounds on {deadlineBuffer}: long enough to survive normal block latency,
    ///      short enough that the deadline still means something (a huge buffer is no
    ///      protection at all).
    uint256 public constant MIN_DEADLINE_BUFFER = 30; //     30 seconds
    uint256 public constant MAX_DEADLINE_BUFFER = 3600; //   1 hour

    event RouterSet(address indexed router);
    event HopTokenSet(address indexed hop);
    event DeadlineBufferSet(uint256 buffer);

    error InsufficientOutput();
    error BadDeadlineBuffer();

    constructor(address router_, address hopToken_, address owner_) Ownable(owner_) {
        router = IUniswapV2Router(router_);
        hopToken = hopToken_;
        deadlineBuffer = 300; // 5 minutes — sane default within the allowed bounds
    }

    function setRouter(address r) external onlyOwner {
        router = IUniswapV2Router(r);
        emit RouterSet(r);
    }

    /// @notice Set the swap deadline buffer (seconds), bounded to [MIN, MAX].
    function setDeadlineBuffer(uint256 buffer) external onlyOwner {
        if (buffer < MIN_DEADLINE_BUFFER || buffer > MAX_DEADLINE_BUFFER) {
            revert BadDeadlineBuffer();
        }
        deadlineBuffer = buffer;
        emit DeadlineBufferSet(buffer);
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

        // forge-lint: disable-next-line(block-timestamp) — a short, bounded deadline is the
        // intended router protection; block.timestamp alone would disable it.
        uint256 deadline = block.timestamp + deadlineBuffer;
        uint256[] memory amounts =
            router.swapExactTokensForTokens(amountIn, minOut, path, to, deadline);
        // Zero any residual allowance (e.g. if the router pulled less than amountIn, as a
        // fee-on-transfer tokenIn could cause) so no standing approval lingers (LOW-3).
        IERC20(tokenIn).forceApprove(address(router), 0);
        amountOut = amounts[amounts.length - 1];
        if (amountOut < minOut) revert InsufficientOutput();
    }
}
