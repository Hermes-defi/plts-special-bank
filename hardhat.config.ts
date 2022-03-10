require('dotenv').config({path: '.env'});

import 'dotenv/config';
import {HardhatUserConfig} from 'hardhat/types';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import "@nomiclabs/hardhat-waffle";

// import 'hardhat-gas-reporter';
// import 'hardhat-spdx-license-identifier';
// import 'hardhat-contract-sizer';
// import '@nomiclabs/hardhat-etherscan';


const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.6.12',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
        },
      },
    ],
  },
  networks: {
    // hardhat: {
    //   blockGasLimit: 12_450_000,
    //   hardfork: "london"
    // },
    localhost: {
      url: 'http://localhost:8545',
    },
    mainnet: {
      url: `https://rpc.hermesdefi.io/`,
      accounts: [`${process.env.PRIVATE_KEY}`]
    },
    testnet: {
      url: `https://api.s0.b.hmny.io`,
      accounts: [`${process.env.PRIVATE_KEY}`]
    },
  },
  paths: {
    sources: 'contracts',
  },
  mocha: {
    timeout: 0,
  },
  // etherscan: {
  //   apiKey: `${process.env.API_KEY}`
  // }
};

export default config;
