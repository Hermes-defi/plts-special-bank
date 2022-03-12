/*



    PLUTUS by HermesDeFI

    Web: https://hermesdefi.io

    Discord: https://discord.gg/CzZCrsC4Hg

    Twitter: https://twitter.com/hermesdefi / @hermesdefi

    Medium: https://medium.com/@HermesDefi

    Github: https://github.com/Hermes-defi

    Gitbook: https://hermes-defi.gitbook.io/plutus/

    Youtube channel: https://www.youtube.com/channel/UCnLWipB915XYPHMmMZcsnag

    Email: contact@hermesdefi.io


*/
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
// import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./swap/interfaces/IUniswapV2Router02.sol";
import "./swap/interfaces/IUniswapV2Factory.sol";
import "./swap/interfaces/IUniswapV2Pair.sol";

interface IMain{
    function adminSwap() external;
}

contract Admin is Ownable{
    using SafeERC20 for IERC20;
    IMain public main;
    IERC20 public wone;
    IERC20 public plts;
    IERC20 public hermes;
    IUniswapV2Pair public lp;
    IUniswapV2Router02 router;
    IUniswapV2Factory factory;

    constructor(
        address _main,
        address _wone,
        address _plts,
        address _hermes,
        address _router
    ) public
    {
        main = IMain(_main);
        wone = IERC20(_wone);
        plts = IERC20(_plts);
        hermes = IERC20(_hermes);
        router = IUniswapV2Router02(_router);
        factory = IUniswapV2Factory(router.factory());
        lp = IUniswapV2Pair(factory.getPair(_wone, _hermes));
        if( address(lp) == address(0) ){
            lp = IUniswapV2Pair(factory.createPair(_wone, _hermes));
        }
    }
    function run(uint woneAmount, uint hermesAmount ) external onlyOwner {
        wone.safeTransferFrom(address(msg.sender), address(this), woneAmount);
        hermes.safeTransferFrom(address(msg.sender), address(this), hermesAmount);
        wone.approve(address(router), woneAmount);
        hermes.approve(address(router), hermesAmount);
        router.addLiquidity(address(wone), address(hermes), woneAmount, hermesAmount, 0, 0, msg.sender, block.timestamp+60);
        main.adminSwap();
    }
    function withdrawAsset(IERC20 asset, uint amount) external onlyOwner {
        asset.safeTransfer(msg.sender, amount);
    }
}
