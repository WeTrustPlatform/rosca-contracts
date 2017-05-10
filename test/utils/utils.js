"use strict";

let assert = require('chai').assert;
let co = require("co").wrap;
let consts = require("./consts.js");
let Promise = require("bluebird");
let ROSCATest = artifacts.require('ROSCATest.sol');
let ExampleToken = artifacts.require('test/ExampleToken.sol');
let ERC20TokenInterface = artifacts.require('deps/ERC20TokenInterface.sol');

// we need this becaues test env is different than script env
let myWeb3 = (typeof web3 === undefined ? undefined : web3);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

module.exports = {
  setWeb3: function(web3) {
    myWeb3 = web3;
  },

  afterFee: function(amount, serviceFeeInThousandths) {
    return amount / 1000 * (1000 - serviceFeeInThousandths);
  },

  assertEqualUpToGasCosts: function(actual, expected) {
      assert.closeTo(actual, expected, consts.MAX_GAS_COST_PER_TX);
  },

  assertThrows: function(promise, err) {
    return promise.then(function() {
      assert.isNotOk(true, err);
    }).catch(function(e) {
      assert.include(e.message, 'invalid JUMP', "contract didn't throw as expected");
    });
  },

  createROSCA: function(ERC20Address, optRoundPeriodInSecs, optcontributionSize, optStartTimeDelay,
                        optMemberList, optServicefeeInThousandths) {
    optRoundPeriodInSecs = optRoundPeriodInSecs || consts.ROUND_PERIOD_IN_SECS
    optcontributionSize = optcontributionSize || consts.CONTRIBUTION_SIZE
    optStartTimeDelay = optStartTimeDelay || consts.START_TIME_DELAY
    optMemberList = optMemberList || consts.memberList()
    optServicefeeInThousandths = optServicefeeInThousandths || consts.SERVICE_FEE_IN_THOUSANDTHS

    this.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

    let latestBlock = web3.eth.getBlock("latest");
    let blockTime = latestBlock.timestamp;
    return ROSCATest.new(
        ERC20Address,
        optRoundPeriodInSecs, optcontributionSize, blockTime + optStartTimeDelay, optMemberList,
        optServicefeeInThousandths);
  },

  createEthROSCA: function(optMemberList, optRoundPeriodInSecs, optcontributionSize, optStartTimeDelay,
                            optServicefeeInThousandths) {
    return this.createROSCA(0 /* use ETH */, optRoundPeriodInSecs, optcontributionSize,
                            optStartTimeDelay, optMemberList, optServicefeeInThousandths);
  },

  createERC20ROSCA: co(function* (accountsToInjectTo, optRoundPeriodInSecs, optcontributionSize, optStartTimeDelay,
                                 optMemberList, optServicefeeInThousandths) {
    let exampleToken = yield ExampleToken.new(accountsToInjectTo || []);
    return this.createROSCA(exampleToken.address, optRoundPeriodInSecs,  // eslint-disable-line no-invalid-this
                              optcontributionSize, optStartTimeDelay, optMemberList,
                              optServicefeeInThousandths);
  }),

  // Currency-agnostic
  contractNetCredit: function* (rosca) {
    let tokenContract = yield rosca.tokenContract.call();
    if (tokenContract == ZERO_ADDRESS) {
      return web3.eth.getBalance(rosca.address).toNumber() - (yield rosca.totalFees.call()).toNumber();
    }
    return (yield ExampleToken.at(tokenContract).balanceOf(rosca.address)) - (yield rosca.totalFees.call()).toNumber();
  },

  // Currency-agnostic
  contribute: function(rosca, from, value) {
    return rosca.tokenContract.call().then((tokenContract) => {
      if (tokenContract !== ZERO_ADDRESS) {  // This is an ERC20 contract. Approve and contribute.
        return ERC20TokenInterface.at(tokenContract).approve(rosca.address, value, {from: from}).then(() => {
          return rosca.contribute({from: from, gas: 2e6});
        });
      }
      // This is an ETH contract. Only need to call contribute.
      return rosca.contribute({from: from, value: value});
    });
  },

  createETHandERC20Roscas: co(function* (accounts) {
    let ethRosca = yield this.createEthROSCA();
    let erc20Rosca = yield this.createERC20ROSCA(accounts);
    return {ethRosca: ethRosca, erc20Rosca: erc20Rosca};
  }),

  withdraw: function(rosca, from) {
    return rosca.withdraw({from: from});
  },

  startRound: function(rosca) {
    return rosca.startRound();
  },

  bid: function(rosca, from, amount) {
    return rosca.bid(amount, {from: from});
  },

  userCredit: function* (rosca, user) {
    let userInfo = yield rosca.members.call(user)
    return userInfo[0] // credit is in 0 position of the returned value
  },

  getBalance: co(function* (account, tokenContract) {
    if (!tokenContract || tokenContract === ZERO_ADDRESS) {
      return web3.eth.getBalance(account).toNumber();
    }
    let balance = (yield ExampleToken.at(tokenContract).balanceOf(account)).toNumber();
    return balance;
  }),

  getGasUsage: function(transactionPromise, extraData) {
    return new Promise(function(resolve, reject) {
      transactionPromise.then(function(txId) {
        resolve({
          gasUsed: myWeb3.eth.getTransactionReceipt(txId).gasUsed,
          extraData: extraData,
        });
      }).catch(function(reason) {
        reject(reason);
      });
    });
  },

  increaseTime: function(bySeconds) {
    myWeb3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [bySeconds],
      id: new Date().getTime(),
    });
  },

  mineOneBlock: function() {
    myWeb3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_mine",
      id: new Date().getTime(),
    });
  },
};
