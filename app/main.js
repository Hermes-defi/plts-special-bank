function fromWei(v) {
    return web3.utils.fromWei(v);
}
function toWei(v) {
    return web3.utils.toWei(v);
}
async function accountLoad() {
    if (window.ethereum) {
        const r = await window.ethereum.request({method: 'eth_requestAccounts'});
        web3 = new Web3(window.ethereum);
        account = r[0];
        return true;
    }
    return false;
}

async function load() {
    const enabled = await accountLoad();
    if (enabled) {
        $('#account').html('Your account: ' + account);
        wone = new web3.eth.Contract(abi_token, woneAddress);
        plts = new web3.eth.Contract(abi_token, pltsAddress);
        hermes = new web3.eth.Contract(abi_token, hermesAddress);
        main = new web3.eth.Contract(abi_main, mainAddress);
        admin = new web3.eth.Contract(abi_admin, adminAddress);



        const blockNumber = await web3.eth.getBlockNumber();
        $('#blockNumber').html('Current Block: ' + blockNumber);

        const pltsBalance = await plts.methods.balanceOf(account).call();
        $('#pltsBalance').html('My PTLS balance: ' + fromWei(pltsBalance));

        const hermesBalance = await hermes.methods.balanceOf(account).call();
        $('#hermesBalance').html('My Hermes balance: ' + fromWei(hermesBalance));
        $('#run_hrms').val(fromWei(hermesBalance));

        const pltsBalanceMain = await plts.methods.balanceOf(mainAddress).call();
        $('#pltsBalanceMain').html('farm PLTS balance: ' + fromWei(pltsBalanceMain));

        const startBlock = await main.methods.startBlock().call();
        const rewardEndBlock = await main.methods.rewardEndBlock().call();
        $('#startBlock').html('startBlock: ' + startBlock + ' (' + (blockNumber - startBlock) + ')');
        $('#rewardEndBlock').html('rewardEndBlock: ' + rewardEndBlock + ' (' + (rewardEndBlock - blockNumber) + ')');
        const rewardPerBlock = await main.methods.rewardPerBlock().call();

        $('#rewardPerBlock').html('Reward per block: ' + fromWei(rewardPerBlock));

        const mainLpAddress = await main.methods.lp().call();
        $('#mainLpAddress').html('LP: ' + mainLpAddress);

        lp = new web3.eth.Contract(abi_token, mainLpAddress);
        // const myLPBalance = await lp.methods.balanceOf(account).call();
        // $('#myLpBalance').html(fromWei(myLPBalance));



        const myStakedShares = await main.methods.balanceOf(account).call();
        $('#myStakedShares').html(fromWei(myStakedShares)+' BSHAREs');

        const totalStaked = await main.methods.totalStaked().call();
        $('#totalStaked').html('Total Staked: ' + fromWei(totalStaked)+' WONE');

        const myOneBalance = await wone.methods.balanceOf(account).call();
        $('#myOneBalance').html('My WONE balance: ' + fromWei(myOneBalance));
        $('#run_wone').val(fromWei(myOneBalance));

        const mainOneBalance = await wone.methods.balanceOf(mainAddress).call();
        $('#mainOneBalance').html('contract WONE balance: ' + fromWei(mainOneBalance));

        const allowance = await wone.methods.allowance(account, mainAddress).call();
        $('#allowance').html('Allowance: '+fromWei(allowance));
        if( allowance > 0 ){
            $('#allowance').css('color','blue')
            $('#stake').prop('disabled',false)
            $('#unstake').prop('disabled',false)
        }else{
            $('#allowance').css('color','red')
            $('#stake').prop('disabled',true)
            $('#unstake').prop('disabled',true)
        }

        const allowanceWoneAdmin = await wone.methods.allowance(account, adminAddress).call();
        $('#adminAllowanceWONE').html('Allowance WONE: '+fromWei(allowanceWoneAdmin));
        $('#adminAllowanceWONE').css('color', allowanceWoneAdmin>0 ? 'blue' : 'red')

        const allowanceHrmsAdmin = await hermes.methods.allowance(account, adminAddress).call();
        $('#adminAllowanceHRMS').html('Allowance HRMS: '+fromWei(allowanceHrmsAdmin));
        $('#adminAllowanceHRMS').css('color', allowanceHrmsAdmin>0 ? 'blue' : 'red')


        if( allowanceWoneAdmin > 0 && allowanceHrmsAdmin > 0 ){
            $('#adminRun').prop('disabled',false)
        }else{
            $('#adminRun').prop('disabled',true)
        }

        const adminOwner = await admin.methods.owner().call();
        $('#adminOwner').html(adminOwner);

        const withdrawLocked = await main.methods.withdrawLocked().call();
        $('#withdrawLocked').html(withdrawLocked ? 'Yes' : 'No');
        $('#withdrawLocked').css('color', withdrawLocked ? 'red' : 'blue')

        $('#hermes').val(hermesAddress);

        pendingReward();

    } else {
        alert('no web3 connection');
    }
}

async function pendingReward(){

    const reward = await main.methods.pendingReward(account).call();
    $('#pendingReward').html('Pending reward: '+fromWei(reward)+' PLTS');

    const pltsBalance2 = await plts.methods.balanceOf(account).call();
    $('#pltsBalance2').html('My PTLS balance: '+fromWei(pltsBalance2)+' PLTS');

    // console.log(reward, pltsBalance2)

}

async function onLoad(){
    load();
    setInterval(pendingReward, 10000);
}

async function approve_main(){
    const tx = await wone.methods.approve(mainAddress, toWei('9999999999999999')).send({from: account});
    console.log(tx)
    $('#tx').html(tx.transactionHash);
    await load();
}
async function stake(){
    const amount = toWei( $('#stake_unstake_amount').val() );
    try {
        await main.methods.deposit(amount).estimateGas({from: account},
            async function(error, gasAmount){
                if( error ){
                    alert( error.toString() );
                }else{
                    const tx = await main.methods.deposit(amount).send({from: account});
                    console.log(tx)
                    $('#tx').html(tx.transactionHash);
                    await load();
                }
            });
    } catch (e) {
        alert(e.toString());
    }
}

async function unstake(){
    const amount = toWei( $('#stake_unstake_amount').val() );
    try {
        await main.methods.withdraw(amount).estimateGas({from: account},
            async function(error, gasAmount){
                if( error ){
                    alert( error.toString() );
                }else{
                    const tx = await main.methods.withdraw(amount).send({from: account});
                    console.log(tx)
                    $('#tx').html(tx.transactionHash);
                    await load();
                }
            });
    } catch (e) {
        alert(e.toString());
    }
}

async function withdrawReward(){
    try {
        await main.methods.withdrawReward().estimateGas({from: account},
            async function(error, gasAmount){
                if( error ){
                    alert( error.toString() );
                }else{
                    const tx = await main.methods.withdrawReward().send({from: account});
                    console.log(tx)
                    $('#tx').html(tx.transactionHash);
                    await load();
                }
            });
    } catch (e) {
        alert(e.toString());
    }
}


async function run( _wone, _hrms){
    const woneAmount = toWei(_wone);
    const hrmsAmount = toWei(_hrms);
    try {
        await admin.methods.run(woneAmount, hrmsAmount).estimateGas({from: account},
            async function(error, gasAmount){
                if( error ){
                    alert( error.toString() );
                }else{
                    const tx = await admin.methods.run(woneAmount, hrmsAmount).send({from: account});
                    console.log(tx)
                    $('#tx').html(tx.transactionHash);
                    await load();
                }
            });
    } catch (e) {
        alert(e.toString());
    }
}

async function approve_by(ctx, to){
    const tx = await ctx.methods.approve(to, toWei('9999999999999999')).send({from: account});
    $('#tx').html(tx.transactionHash);
    await load();
}

async function setAdminSwap(){
    const tx = await main.methods.setAdminSwap(adminAddress).send({from: account});
    $('#tx').html(tx.transactionHash);
    await load();
}

async function transferOwnership(newOwner){
    const tx = await admin.methods.transferOwnership(newOwner).send({from: account});
    $('#tx').html(tx.transactionHash);
    await load();
}

async function adminInit(_hermes){
    const tx = await main.methods.adminInit(_hermes).send({from: account});
    $('#tx').html(tx.transactionHash);
    await load();
}
