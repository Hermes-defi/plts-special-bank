import {formatUnits, parseUnits} from "@ethersproject/units/src.ts/index";

const {ethers} = require("hardhat");
const {solidity} = require("ethereum-waffle");
const {expect} = require("chai");
require("@nomiclabs/hardhat-web3");
import {ContractFactory, constants, utils, Contract, BigNumber} from 'ethers';
import {describe} from "mocha";

const chalk = require('chalk');

function toWei(v: string): string {
    return utils.parseUnits(v, 18).toString();
}

function fromWei(v: string): string {
    return utils.formatUnits(v, 18).toString();
}

function now(x: number) {
    let t = new Date().getTime() / 1000;
    t += x;
    return parseInt(t.toString());
}

async function getBlock() {
    return await ethers.provider.getBlockNumber();
}

describe("main", () => {
    let weth: any, factory: any, router: any;
    let dev: string, user1: string, user2: string, user3: string, feeAddress: string, reserve: string;
    let DEV: any, USER1: any, USER2: any, USER3: any;
    let main: any, plts: any, hermes: any, liquidity:any, lp:any, admin:any;
    beforeEach(async () => {
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
        const _UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
        const _UniswapV2Router02 = await ethers.getContractFactory("UniswapV2Router02");

        weth = await _WTEST.deploy();
        factory = await _UniswapV2Factory.deploy();
        router = await _UniswapV2Router02.deploy();
        const pairCodeHash = await factory.pairCodeHash();
        // console.log('pairCodeHash', pairCodeHash);
        await router.init(factory.address, weth.address);

        const _FaucetERC20 = await ethers.getContractFactory("Token");

        plts = await _FaucetERC20.deploy("Reward Token", "Reward");
        hermes = await _FaucetERC20.deploy("Bond Token", "Bond");
        liquidity = await _FaucetERC20.deploy("Liquidity Token", "LQY");

        const _main = await ethers.getContractFactory("Main");

        const pltsPerBlock = toWei('1');

        const currentBlock = await getBlock();
        const endBlock = currentBlock + 10;
        const startBlock = currentBlock; // 7
        const pltsEndBlock = endBlock; // 17

        main = await _main.deploy(
            weth.address, plts.address, hermes.address, router.address,
            pltsPerBlock, startBlock, pltsEndBlock);

        const lpAddress = await main.lp();
        lp = _UniswapV2Pair.attach( lpAddress );

        const _admin = await ethers.getContractFactory("Admin");
        admin = await _admin.deploy(main.address,
            weth.address, plts.address,
            hermes.address, router.address);

    });

    describe("admin", () => {
        it("run with 500k in deposits", async () => {
            await plts.mint(main.address, toWei('100'));

            await weth.mint(user1, toWei('200000'));
            await weth.mint(user2, toWei('200000'));
            await weth.mint(user3, toWei('100000'));

            await weth.connect(USER1).approve(main.address, toWei('200000'));
            await weth.connect(USER2).approve(main.address, toWei('200000'));
            await weth.connect(USER3).approve(main.address, toWei('200000'));

            await main.connect(USER1).deposit(toWei('200000'))
            await main.connect(USER2).deposit(toWei('200000'))
            await main.connect(USER3).deposit(toWei('100000'))

            const balanceOfMainDev = (await main.balanceOf(user1)).toString();
            expect( fromWei(balanceOfMainDev) ).to.be.eq('200000.0');

            await expect(
                main.withdraw(balanceOfMainDev)
            ).to.be.revertedWith('withdraw locked');

            await expect(
                main.connect(USER1).setWithdrawStatus(true)
            ).to.be.revertedWith('Ownable: caller is not the owner');

            await main.setWithdrawStatus(false);
            let balanceOfLp = (await lp.balanceOf( main.address)).toString();
            expect(balanceOfLp).to.be.eq('0')

            let balanceOfUst = fromWei( (await weth.balanceOf( main.address)).toString());
            expect(balanceOfUst).to.be.eq('500000.0')

            // simulate admin liquidity add
            await main.setAdminSwap( admin.address );
            const _250k = toWei('275000');
            await weth.mint(dev, _250k);
            await hermes.mint(dev, _250k);
            await weth.approve(admin.address, _250k);
            await hermes.approve(admin.address, _250k);

            await admin.run(_250k, _250k);
            balanceOfLp = fromWei( (await lp.balanceOf( main.address)).toString());
            // 50% of amount added less fee
            expect(balanceOfLp).to.be.eq('130952.38095238095238095');

            balanceOfLp = fromWei( (await lp.balanceOf( dev)).toString());
            // 100% in lp units
            expect(balanceOfLp).to.be.eq('274999.999999999999999');

            const reserves = await lp.getReserves();
            const reserve1 = parseFloat(fromWei(reserves[1]));
            const reserve2 = parseFloat(fromWei(reserves[0]));
            const price1 = reserve2 / reserve1;
            const price2 = reserve1 / reserve2;
            console.log(price1, price2)

        });


        it("run with 250k in deposits", async () => {
            await plts.mint(main.address, toWei('100'));

            await weth.mint(user1, toWei('100000'));
            await weth.mint(user2, toWei('100000'));
            await weth.mint(user3, toWei('50000'));

            await weth.connect(USER1).approve(main.address, toWei('100000'));
            await weth.connect(USER2).approve(main.address, toWei('100000'));
            await weth.connect(USER3).approve(main.address, toWei('50000'));

            await main.connect(USER1).deposit(toWei('100000'))
            await main.connect(USER2).deposit(toWei('100000'))
            await main.connect(USER3).deposit(toWei('50000'))

            const balanceOfMainDev = (await main.balanceOf(user1)).toString();
            expect( fromWei(balanceOfMainDev) ).to.be.eq('100000.0');

            await expect(
                main.withdraw(balanceOfMainDev)
            ).to.be.revertedWith('withdraw locked');

            await expect(
                main.connect(USER1).setWithdrawStatus(true)
            ).to.be.revertedWith('Ownable: caller is not the owner');

            await main.setWithdrawStatus(false);
            let balanceOfLp = (await lp.balanceOf( main.address)).toString();
            expect(balanceOfLp).to.be.eq('0')

            let balanceOfUst = fromWei( (await weth.balanceOf( main.address)).toString());
            expect(balanceOfUst).to.be.eq('250000.0')

            // simulate admin liquidity add
            await main.setAdminSwap( admin.address );
            const _250k = toWei('275000');
            await weth.mint(dev, _250k);
            await hermes.mint(dev, _250k);
            await weth.approve(admin.address, _250k);
            await hermes.approve(admin.address, _250k);

            await admin.run(_250k, _250k);
            balanceOfLp = fromWei( (await lp.balanceOf( main.address)).toString());
            // 50% of amount added less fee
            expect(balanceOfLp).to.be.eq('85937.499999999999999998');

            balanceOfLp = fromWei( (await lp.balanceOf( dev)).toString());
            // 100% in lp units
            expect(balanceOfLp).to.be.eq('274999.999999999999999');

        });

    });


    describe("main", () => {

        it("test deposit and withdraw reward", async () => {
            await plts.mint(main.address, toWei('100'));
            await weth.mint(dev, toWei('100'));
            await weth.approve(main.address, toWei('100'));
            await main.deposit(toWei('100'))
            const balanceOfMainDev = (await main.balanceOf(dev)).toString();
            expect( fromWei(balanceOfMainDev) ).to.be.eq('100.0');

            // suppose the current block has a timestamp of 01:00 PM
            await ethers.provider.send("evm_increaseTime", [3600])
            await ethers.provider.send("evm_mine")

            await expect(
                main.withdraw(balanceOfMainDev)
            ).to.be.revertedWith('withdraw locked');

            await expect(
                main.connect(USER1).setWithdrawStatus(true)
            ).to.be.revertedWith('Ownable: caller is not the owner');

            await main.setWithdrawStatus(false);


            // await main.withdraw(balanceOfMainDev);
            await main.withdrawReward();

            const balanceOfPLTSDev = (await plts.balanceOf(dev)).toString();
            expect( fromWei(balanceOfPLTSDev) ).to.be.eq('4.0');

        });


        it("test deposit and bond withdraw", async () => {
            await plts.mint(main.address, toWei('100'));

            await weth.mint(dev, toWei('100'));
            await weth.mint(user1, toWei('100'));
            await weth.mint(user2, toWei('100'));
            await weth.mint(user3, toWei('100'));

            await weth.approve(main.address, toWei('100'));
            await weth.connect(USER1).approve(main.address, toWei('100'));
            await weth.connect(USER2).approve(main.address, toWei('100'));
            await weth.connect(USER3).approve(main.address, toWei('100'));

            await main.deposit(toWei('100'))
            await main.connect(USER1).deposit(toWei('100'))
            await main.connect(USER2).deposit(toWei('100'))
            await main.connect(USER3).deposit(toWei('100'))

            const balanceOfMainDev = (await main.balanceOf(dev)).toString();
            expect( fromWei(balanceOfMainDev) ).to.be.eq('100.0');

            await expect(
                main.withdraw(balanceOfMainDev)
            ).to.be.revertedWith('withdraw locked');

            await expect(
                main.connect(USER1).setWithdrawStatus(true)
            ).to.be.revertedWith('Ownable: caller is not the owner');

            await main.setWithdrawStatus(false);


            // simulate admin liquidity add
            const _1h = toWei('200');
            await weth.mint(dev, _1h);
            await hermes.mint(dev, _1h);
            await weth.approve(router.address, _1h);
            await hermes.approve(router.address, _1h);
            await router.addLiquidity(weth.address, hermes.address, _1h, _1h, 0, 0, reserve, now(3960));

            await main.adminSwap();
            const balanceOfLp = fromWei( (await lp.balanceOf( main.address)).toString());
            expect(balanceOfLp).to.be.eq('100.0')

            await main.withdraw( (await main.balanceOf(dev)).toString() );
            await main.connect(USER1).withdraw( (await main.balanceOf(user1)).toString() );
            await main.connect(USER2).withdraw( (await main.balanceOf(user2)).toString() );
            await main.connect(USER3).withdraw( (await main.balanceOf(user3)).toString() );

            expect( fromWei((await main.balanceOf(dev)).toString()) ).to.be.eq('0.0');
            expect( fromWei((await lp.balanceOf(dev)).toString()) ).to.be.eq('25.0');

            expect( fromWei((await main.balanceOf(user1)).toString()) ).to.be.eq('0.0');
            expect( fromWei((await lp.balanceOf(user1)).toString()) ).to.be.eq('25.0');

            expect( fromWei((await main.balanceOf(user2)).toString()) ).to.be.eq('0.0');
            expect( fromWei((await lp.balanceOf(user2)).toString()) ).to.be.eq('25.0');

            expect( fromWei((await main.balanceOf(user3)).toString()) ).to.be.eq('0.0');
            expect( fromWei((await lp.balanceOf(user3)).toString()) ).to.be.eq('25.0');


        });



        it("test swap and add liquidity", async () => {
            await plts.mint(main.address, toWei('100'));

            await weth.mint(dev, toWei('100'));
            await weth.mint(user1, toWei('100'));
            await weth.mint(user2, toWei('100'));
            await weth.mint(user3, toWei('100'));

            await weth.approve(main.address, toWei('100'));
            await weth.connect(USER1).approve(main.address, toWei('100'));
            await weth.connect(USER2).approve(main.address, toWei('100'));
            await weth.connect(USER3).approve(main.address, toWei('100'));

            await main.deposit(toWei('100'))
            await main.connect(USER1).deposit(toWei('100'))
            await main.connect(USER2).deposit(toWei('100'))
            await main.connect(USER3).deposit(toWei('100'))

            const balanceOfMainDev = (await main.balanceOf(dev)).toString();
            expect( fromWei(balanceOfMainDev) ).to.be.eq('100.0');

            await expect(
                main.withdraw(balanceOfMainDev)
            ).to.be.revertedWith('withdraw locked');

            await expect(
                main.connect(USER1).setWithdrawStatus(true)
            ).to.be.revertedWith('Ownable: caller is not the owner');

            await main.setWithdrawStatus(false);
            let balanceOfLp = (await lp.balanceOf( main.address)).toString();
            expect(balanceOfLp).to.be.eq('0')

            let balanceOfUst = fromWei( (await weth.balanceOf( main.address)).toString());
            expect(balanceOfUst).to.be.eq('400.0')

            // simulate admin liquidity add
            const _1h = toWei('100');
            await weth.mint(dev, _1h);
            await hermes.mint(dev, _1h);
            await weth.approve(router.address, _1h);
            await hermes.approve(router.address, _1h);
            await router.addLiquidity(weth.address, hermes.address, _1h, _1h, 0, 0, dev, now(4000));

            await main.adminSwap();
            balanceOfLp = fromWei( (await lp.balanceOf( main.address)).toString());
            expect(balanceOfLp).to.be.eq('66.666666666666666665')


        });


    });

});
