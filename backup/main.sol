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

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// import "hardhat/console.sol";
import "./swap/interfaces/IUniswapV2Router02.sol";
import "./swap/interfaces/IUniswapV2Factory.sol";
import "./swap/interfaces/IUniswapV2Pair.sol";

contract Main is Ownable, ERC20("Bank Share", "BSHARE") {
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. Rewards to distribute per block.
        uint256 lastRewardBlock;  // Last block number that Rewards distribution occurs.
        uint256 accRewardTokenPerShare; // Accumulated Rewards per share, times 1e30. See below.
    }

    // The stake token
    IERC20 public wone;

    // The reward token
    IERC20 public plts;

    // The token to be paid after period ends
    IERC20 public hermes;

    // The token that will receive admin liquidity
    IUniswapV2Pair public lp;

    // Reward tokens created per block.
    uint256 public rewardPerBlock;

    // Keep track of number of tokens staked in case the contract earns reflect fees
    uint256 public totalStaked = 0;

    // Info of each pool.
    PoolInfo public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping (address => UserInfo) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 private totalAllocPoint = 1000;
    // The block number when Reward mining starts.
    uint256 public startBlock;
    // The block number when mining ends.
    uint256 public rewardEndBlock;

    event Deposit(address indexed user, uint256 amount);
    event DepositRewards(uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event WithdrawReward(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event SkimStakeTokenFees(address indexed user, uint256 amount);
    event LogUpdatePool(uint256 rewardEndBlock, uint256 rewardPerBlock);
    event EmergencyRewardWithdraw(address indexed user, uint256 amount);
    event EmergencySweepWithdraw(address indexed user, IERC20 indexed token, uint256 amount);

    // admin will unlock withdraw after adding liquidity
    bool public withdrawLocked = true;

    IUniswapV2Router02 router;
    IUniswapV2Factory factory;

    constructor(
        address _wone,
        address _plts,
        address _hermes,
        address _router,
        uint256 _rewardPerBlock,
        uint256 _startBlock,
        uint256 _rewardEndBlock
    ) public
    {
        wone = IERC20(_wone);
        plts = IERC20(_plts);
        hermes = IERC20(_hermes);

        rewardPerBlock = _rewardPerBlock;
        startBlock = _startBlock;
        rewardEndBlock = _rewardEndBlock;

        router = IUniswapV2Router02(_router);
        factory = IUniswapV2Factory(router.factory());
        lp = IUniswapV2Pair(factory.getPair(_wone, _hermes));
        if( address(lp) == address(0) ){
            lp = IUniswapV2Pair(factory.createPair(_wone, _hermes));
        }

        // staking pool
        poolInfo = PoolInfo({
        lpToken: wone,
        allocPoint: 1000,
        lastRewardBlock: startBlock,
        accRewardTokenPerShare: 0
        });

        adminSwapContract = msg.sender;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        if (_to <= rewardEndBlock) {
            return _to - _from;
        } else if (_from >= rewardEndBlock) {
            return 0;
        } else {
            return rewardEndBlock - _from;
        }
    }

    /// @param  _rewardEndBlock The block when rewards will end
    function setBonusEndBlock(uint256 _rewardEndBlock) external onlyOwner {
        require(_rewardEndBlock > rewardEndBlock, 'new bonus end block must be greater than current');
        rewardEndBlock = _rewardEndBlock;
        emit LogUpdatePool(rewardEndBlock, rewardPerBlock);
    }

    // View function to see pending Reward on frontend.
    function pendingReward(address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        uint256 accRewardTokenPerShare = poolInfo.accRewardTokenPerShare;
        if (block.number > poolInfo.lastRewardBlock && totalStaked != 0) {
            uint256 multiplier = getMultiplier(poolInfo.lastRewardBlock, block.number);
            uint256 tokenReward = multiplier * rewardPerBlock * poolInfo.allocPoint / totalAllocPoint;
            accRewardTokenPerShare = accRewardTokenPerShare + (tokenReward * 1e30 / totalStaked);
        }
        return user.amount * accRewardTokenPerShare / 1e30 - user.rewardDebt;
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool() public {
        if (block.number <= poolInfo.lastRewardBlock) {
            return;
        }
        if (totalStaked == 0) {
            poolInfo.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(poolInfo.lastRewardBlock, block.number);
        uint256 tokenReward = multiplier * rewardPerBlock * poolInfo.allocPoint / totalAllocPoint;
        poolInfo.accRewardTokenPerShare = poolInfo.accRewardTokenPerShare + (tokenReward * 1e30 / totalStaked);
        poolInfo.lastRewardBlock = block.number;
    }


    /// Deposit staking token into the contract to earn rewards.
    /// @dev Since this contract needs to be supplied with rewards we are
    ///  sending the balance of the contract if the pending rewards are higher
    /// @param _amount The amount of staking tokens to deposit
    function deposit(uint256 _amount) public {

        // prevent user depositing after contract ended distribution
        require( withdrawLocked , "deposit locked" );

        UserInfo storage user = userInfo[msg.sender];
        uint256 finalDepositAmount = 0;
        updatePool();
        if (user.amount > 0) {
            uint256 pending = user.amount * poolInfo.accRewardTokenPerShare / 1e30 - user.rewardDebt;
            if(pending > 0) {
                uint256 currentRewardBalance = rewardBalance();
                if(currentRewardBalance > 0) {
                    if(pending > currentRewardBalance) {
                        safeTransferReward(address(msg.sender), currentRewardBalance);
                    } else {
                        safeTransferReward(address(msg.sender), pending);
                    }
                }
            }
        }
        if (_amount > 0) {
            uint256 preStakeBalance = wone.balanceOf(address(this));
            poolInfo.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            finalDepositAmount = wone.balanceOf(address(this)) - preStakeBalance;
            user.amount = user.amount + finalDepositAmount;
            _mint(msg.sender, finalDepositAmount);
            totalStaked = totalStaked + finalDepositAmount;
        }
        user.rewardDebt = user.amount * poolInfo.accRewardTokenPerShare / 1e30;

        emit Deposit(msg.sender, finalDepositAmount);
    }

    /// Withdraw rewards and/or staked tokens. Pass a 0 amount to withdraw only rewards
    /// @param _amount The amount of staking tokens to withdraw
    function withdraw(uint256 _amount) public {
        require( ! withdrawLocked , "withdraw locked" );
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool();
        uint256 pending = user.amount * poolInfo.accRewardTokenPerShare / 1e30 - user.rewardDebt;
        if(pending > 0) {
            uint256 currentRewardBalance = rewardBalance();
            if(currentRewardBalance > 0) {
                if(pending > currentRewardBalance) {
                    safeTransferReward(address(msg.sender), currentRewardBalance);
                } else {
                    safeTransferReward(address(msg.sender), pending);
                }
            }
        }
        if(_amount > 0) {

            uint256 bonds = lp.balanceOf(address(this));
            uint256 BSHARE = ( bonds * _amount) / totalSupply();
            // console.log("bonds=%d BSHARE=%d _amount=%d", bonds/1e18, BSHARE/1e18, _amount/1e18);
            _burn(msg.sender, _amount);
            lp.transfer(address(msg.sender), BSHARE);

            totalStaked = totalStaked - _amount;
            user.amount = user.amount - _amount;

        }

        user.rewardDebt = user.amount * poolInfo.accRewardTokenPerShare / 1e30;

        emit Withdraw(msg.sender, _amount);
    }

    /// Obtain the reward balance of this contract
    /// @return wei balace of conract
    function rewardBalance() public view returns (uint256) {
        return plts.balanceOf(address(this));
    }

    // Deposit Rewards into contract
    function depositRewards(uint256 _amount) external {
        require(_amount > 0, 'Deposit value must be greater than 0.');
        plts.safeTransferFrom(address(msg.sender), address(this), _amount);
        emit DepositRewards(_amount);
    }

    /// @param _to address to send reward token to
    /// @param _amount value of reward token to transfer
    function safeTransferReward(address _to, uint256 _amount) internal {
        plts.safeTransfer(_to, _amount);
    }

    /// @dev Obtain the stake balance of this contract
    function totalStakeTokenBalance() public view returns (uint256) {
        return wone.balanceOf(address(this));
    }

    /// @dev Obtain the stake token fees (if any) earned by reflect token
    function getStakeTokenFeeBalance() public view returns (uint256) {
        return wone.balanceOf(address(this)) - totalStaked;
    }

    /* Admin Functions */

    /// @param _rewardPerBlock The amount of reward tokens to be given per block
    function setRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
        rewardPerBlock = _rewardPerBlock;
        emit LogUpdatePool(rewardEndBlock, rewardPerBlock);
    }

    function withdrawReward() public{
        UserInfo storage user = userInfo[msg.sender];
        updatePool();
        uint256 pending = user.amount * poolInfo.accRewardTokenPerShare / 1e30 - user.rewardDebt;
        if(pending > 0) {
            uint256 currentRewardBalance = rewardBalance();
            if(currentRewardBalance > 0) {
                if(pending > currentRewardBalance) {
                    safeTransferReward(address(msg.sender), currentRewardBalance);
                } else {
                    safeTransferReward(address(msg.sender), pending);
                }
            }
        }
        user.rewardDebt = user.amount * poolInfo.accRewardTokenPerShare / 1e30;
        emit WithdrawReward(msg.sender, pending);
    }

    function getTimestamp() public view returns(uint256){
        return block.timestamp;
    }
    function setWithdrawStatus(bool _status) public onlyOwner{
        withdrawLocked = _status;
    }

    address adminSwapContract;
    function setAdminSwap(address _contract) public onlyOwner{
        adminSwapContract = _contract;
    }

    function adminSwap() external {
        require( adminSwapContract == msg.sender, "!adminSwapContract");
        uint woneFullBalance = wone.balanceOf(address(this));
        require(woneFullBalance > 0, "!woneFullBalance");
        uint woneHalfBalance = woneFullBalance/2;
        swapTokens(woneHalfBalance);
        addLiquidity();
        withdrawLocked = false;
    }

    function swapTokens(uint256 woneAmount) private {
        address[] memory path = new address[](2);
        path[0] = address(wone);
        path[1] = address(hermes);
        wone.approve(address(router), woneAmount);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            woneAmount, 0, path, address(this), block.timestamp+60);
    }

    function addLiquidity() private {
        uint256 woneAmount = wone.balanceOf(address(this));
        uint256 hermesAmount  = hermes.balanceOf(address(this));
        wone.approve(address(router), woneAmount);
        hermes.approve(address(router), hermesAmount);
        router.addLiquidity(address(wone), address(hermes), woneAmount, hermesAmount, 0, 0, address(this), block.timestamp+60);
    }
}
