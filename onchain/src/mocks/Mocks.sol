// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPriceOracle, ISwapAdapter } from "../../src/interfaces/IVaultPeriphery.sol";
import { IAggregatorV3 } from "../../src/interfaces/IAggregatorV3.sol";

/// @dev Mintable 18-decimal ERC20 for tests.
contract MockERC20 is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) { }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// @dev Mintable ERC20 with configurable decimals (for decimal-robustness tests).
contract MockERC20D is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// @dev Settable price oracle. `price` = USDG value of one whole token, 1e18-scaled.
///      Can be toggled to revert per-token to simulate a stale/missing feed (fail-closed
///      production oracles revert; this lets tests exercise the vault's NAV resilience).
contract MockOracle is IPriceOracle {
    mapping(address => uint256) public priceOf;
    mapping(address => bool) public willRevert;

    error FeedDown();

    function setPrice(address token, uint256 p) external {
        priceOf[token] = p;
    }

    function setRevert(address token, bool r) external {
        willRevert[token] = r;
    }

    function price(address token) external view returns (uint256) {
        if (willRevert[token]) revert FeedDown();
        return priceOf[token];
    }
}

/// @dev Settable Chainlink AggregatorV3 mock.
contract MockAggregator is IAggregatorV3 {
    uint8 public decimals;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public roundId = 1;
    uint80 public answeredInRound = 1;

    constructor(uint8 d, int256 a) {
        decimals = d;
        answer = a;
        startedAt = 1;
        updatedAt = block.timestamp;
    }

    function set(int256 a, uint256 updatedAt_) external {
        answer = a;
        updatedAt = updatedAt_;
    }

    function setRounds(uint80 rid, uint80 answeredIn) external {
        roundId = rid;
        answeredInRound = answeredIn;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}

/// @dev Settable Chainlink L2 Sequencer Uptime Feed mock (answer 0=up, 1=down).
contract MockSequencer is IAggregatorV3 {
    int256 public answer; // 0 = up
    uint256 public startedAt;

    constructor(int256 a, uint256 startedAt_) {
        answer = a;
        startedAt = startedAt_;
    }

    function set(int256 a, uint256 startedAt_) external {
        answer = a;
        startedAt = startedAt_;
    }

    function decimals() external pure returns (uint8) {
        return 0;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, startedAt, startedAt, 1);
    }
}

/// @dev Uniswap-V2-style router mock. Fixed end-to-end `rate` (out = in*rate/1e18),
///      records the last path so tests can assert direct vs hop routing. Pre-fund
///      it with the output token.
contract MockV2Router {
    uint256 public rate = 1e18; // out per in, 1e18-scaled
    uint256 public lastPathLength;
    address public lastFirst;
    address public lastLast;

    function setRate(uint256 r) external {
        rate = r;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        require(IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn), "xferFrom");
        uint256 out = (amountIn * rate) / 1e18;
        require(out >= amountOutMin, "INSUFFICIENT_OUTPUT_AMOUNT");
        lastPathLength = path.length;
        lastFirst = path[0];
        lastLast = path[path.length - 1];
        require(IERC20(path[path.length - 1]).transfer(to, out), "xfer");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = out;
    }
}

/// @dev Oracle-priced swap adapter. Must be pre-funded with both legs. Converts at
///      the oracle price with an optional slippage haircut (in bps).
contract MockSwapAdapter is ISwapAdapter {
    IPriceOracle public immutable oracle;
    uint256 public slippageBps; // applied to output

    constructor(IPriceOracle o) {
        oracle = o;
    }

    function setSlippage(uint256 bps) external {
        slippageBps = bps;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        external
        returns (uint256 out)
    {
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "xferFrom");

        uint256 pIn = oracle.price(tokenIn); // 0 means "this leg is USDG (unit)"
        uint256 pOut = oracle.price(tokenOut);

        if (pIn == 0) {
            // USDG -> stock: qtyOut = amountIn / priceStock
            out = (amountIn * 1e18) / pOut;
        } else {
            // stock -> USDG: usdgOut = amountIn * priceStock
            out = (amountIn * pIn) / 1e18;
        }
        out = out - (out * slippageBps) / 10_000;
        require(out >= minOut, "adapter: slippage");
        require(IERC20(tokenOut).transfer(to, out), "xfer");
    }
}
