import { ethers } from "hardhat";
import { expect } from "chai";

function toWei(v: string): string {
    return ethers.utils.parseUnits(v, 18).toString();
}

function fromWei(v: string): string {
    return ethers.utils.formatUnits(v, 18).toString();
}

async function getBlock() {
    return await ethers.provider.getBlockNumber();
}
// sushi harmony router addr: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

describe("admin", () => {
    let weth: any, factory: any, router: any;
    let dev: string, user1: string, user2: string, user3: string, feeAddress: string, reserve: string;
    let DEV: any, USER1: any, USER2: any, USER3: any;
    let main: any, plts: any, hermes: any, liquidity: any, lp: any, admin: any;
    before("deploy contracts", async () => {
        const [_dev, _user1, _user2, _user3, _feeAddress, _reserve] = await ethers.getSigners();
        DEV = _dev;
        USER1 = _user1;
        USER2 = _user2;
        USER3 = _user3;

        dev = _dev.address;
        user1 = USER1.address;
        user2 = USER2.address;
        user3 = USER3.address;
        feeAddress = _feeAddress.address;
        reserve = _reserve.address;

        const _WTEST = await ethers.getContractFactory("WTEST");
        const _UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair");
        const _UniswapV2Router02 = await ethers.getContractFactory("UniswapV2Router02");
        const _main = await ethers.getContractFactory("Main");
        const _admin = await ethers.getContractFactory("Admin");
        const _FaucetERC20 = await ethers.getContractFactory("Token");

        weth = await _WTEST.deploy();
        router = await _UniswapV2Router02.attach("0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506");

        plts = await _FaucetERC20.deploy("Reward Token", "Reward");
        hermes = await _FaucetERC20.deploy("Bond Token", "Bond");
        liquidity = await _FaucetERC20.deploy("Liquidity Token", "LQY");

        const pltsPerBlock = toWei('1');
        const currentBlock = await getBlock();
        const endBlock = currentBlock + 10;
        const startBlock = currentBlock; // 7
        const pltsEndBlock = endBlock; // 17

        // deploy main contract
        main = await _main.deploy(
            weth.address, plts.address, hermes.address, router.address,
            pltsPerBlock, startBlock, pltsEndBlock);
        // fund main contract with rewards 
        await plts.mint(main.address, toWei('100'));

        const lpAddress = await main.lp();
        lp = _UniswapV2Pair.attach(lpAddress);

        // deploy admin contract 
        admin = await _admin.deploy(main.address,
            weth.address, plts.address,
            hermes.address, router.address);

        // fund user accounts with WETH
        await weth.mint(user1, toWei('100'));
        await weth.mint(user2, toWei('100'));
        await weth.mint(user3, toWei('100'));

        await weth.connect(USER1).approve(main.address, toWei('100'));
        await weth.connect(USER2).approve(main.address, toWei('100'));
        await weth.connect(USER3).approve(main.address, toWei('100'));

        const expectedBalAfterDeposit = ethers.utils.parseEther('300');
        await main.connect(USER1).deposit(toWei('100'))
        await main.connect(USER2).deposit(toWei('100'))
        await main.connect(USER3).deposit(toWei('100'))

        const mainContractBalance = (await weth.balanceOf(main.address));
        expect(mainContractBalance).to.be.eq(expectedBalAfterDeposit);
    });

    context("run", () => {

        it("Dev should receive LPtoken after executing run", async () => {

            let balanceOfLp = (await lp.balanceOf(main.address)).toString();
            expect(balanceOfLp).to.be.eq('0')

            // simulate admin liquidity add
            await main.setAdminSwap(admin.address);
            const _300k = toWei('300000');
            await weth.mint(dev, _300k);
            await hermes.mint(dev, _300k);
            await weth.approve(admin.address, _300k);
            await hermes.approve(admin.address, _300k);

            await admin.run(_300k, _300k);
            const mainBalanceOfLp = ethers.utils.formatEther((await lp.balanceOf(main.address)).toString())

            // 50% of amount added less fee
            expect(Number(mainBalanceOfLp)).to.be.within(149, 150);

            const devBalanceOfLp = fromWei((await lp.balanceOf(dev)).toString());
            // 100% in lp units
            expect(Number(devBalanceOfLp)).to.be.within(299999, 300000)

            const adminBalanceOfLp = (await lp.balanceOf(admin.address)).toString();
            // 100% in lp units
            expect(adminBalanceOfLp).to.be.eq('0')

        });
    });


});
