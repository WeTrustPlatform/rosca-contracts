"use strict";

let co = require("co").wrap;
let consts = require("./consts.js");
let ROSCATest = artifacts.require('ROSCATest.sol'); // eslint-disable-line
let ExampleToken = artifacts.require('test/ExampleToken.sol'); // eslint-disable-line
let Promise = require("bluebird");
let ERC20TokenInterface = artifacts.require('deps/ERC20TokenInterface.sol'); // eslint-disable-line

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function roscaHelper(accounts_, rosca_) {
  this.accounts = accounts_; // eslint-disable-line
  this.roscaContract = rosca_; // eslint-disable-line
}

roscaHelper.prototype.address = function() {
  return this.roscaContract.address; // eslint-disable-line
};

// Currency-agnostic
roscaHelper.prototype.contractNetCredit = function* (optRosca) {
  let rosca = optRosca || this.roscaContract; // eslint-disable-line
  let tokenContract = yield rosca.tokenContract.call();
  if (tokenContract == ZERO_ADDRESS) {
    return web3.eth.getBalance(rosca.address).toNumber() - (yield rosca.totalFees.call()).toNumber();
  }
  return (yield ExampleToken.at(tokenContract).balanceOf(rosca.address)) - (yield rosca.totalFees.call()).toNumber();
};

// Currency-agnostic
roscaHelper.prototype.contribute = function(userIndexOrAddress, value, optRosca) {
  let from = (typeof userIndexOrAddress === 'number') ?
    this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  return rosca.tokenContract.call().then((tokenContract) => {
    if (tokenContract !== ZERO_ADDRESS) {  // This is an ERC20 contract. Approve and contribute.
      return ERC20TokenInterface.at(tokenContract).approve(rosca.address, value, {from: from}).then(() => {
        return rosca.contribute({from: from, gas: 2e6});
      });
    }

    // This is an ETH contract. Only need to call contribute.
    return rosca.contribute({from: from, value: value});
  });
};


roscaHelper.prototype.withdraw = function(userIndexOrAddress, optRosca) {
  let from = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  return rosca.withdraw({from: from});
};

roscaHelper.prototype.startRound = function(optRosca) {
  let rosca = optRosca || this.roscaContract;

  return rosca.startRound();
};

roscaHelper.prototype.bid = function(userIndexOrAddress, amount, optRosca) {
  let from = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  return rosca.bid(amount, {from: from});
};

roscaHelper.prototype.totalDiscounts = co(function* (optRosca) {
  let rosca = optRosca || this.roscaContract; // eslint-disable-line
  return (yield rosca.totalDiscounts.call()).toNumber();
});

roscaHelper.prototype.totalFees = co(function* (optRosca) {
  let rosca = optRosca || this.roscaContract; // eslint-disable-line
  return (yield rosca.totalFees.call()).toNumber();
});

roscaHelper.prototype.getParticipantBalance = co(function* (userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ?
    this.accounts[userIndexOrAddress] : userIndexOrAddress; // eslint-disable-line
  let rosca = optRosca || this.roscaContract; // eslint-disable-line

  return (yield rosca.getParticipantBalance.call(user)).toNumber();
});

roscaHelper.prototype.getUser = co(function* (userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ?
    this.accounts[userIndexOrAddress] : userIndexOrAddress; // eslint-disable-line
  let rosca = optRosca || this.roscaContract; // eslint-disable-line

  let userInfo = yield rosca.members.call(user);
  return userInfo; // credit is in 0 position of the returned value
});

roscaHelper.prototype.userCredit = co(function* (userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ?
    this.accounts[userIndexOrAddress] : userIndexOrAddress; // eslint-disable-line
  let rosca = optRosca || this.roscaContract; // eslint-disable-line

  let userInfo = yield rosca.members.call(user);
  return userInfo[0].toNumber(); // credit is in 0 position of the returned value
});

roscaHelper.prototype.addMember = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  return rosca.addMember(user);
};

roscaHelper.prototype.MIN_DISTRIBUTION_PERCENT = function(optRosca) {
  let rosca = optRosca || this.roscaContract;

  return rosca.MIN_DISTRIBUTION_PERCENT.call();
};

roscaHelper.prototype.cleanUpPreviousRound = function(optRosca) {
  let rosca = optRosca || this.roscaContract;

  return rosca.cleanUpPreviousRound();
};

roscaHelper.prototype.tokenContract = function(optRosca) {
  let rosca = optRosca || this.roscaContract;

  return rosca.tokenContract.call();
};

roscaHelper.prototype.withdrawAndGetWithdrewAmount = function* (userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  let contractBalanceBefore = yield this.getBalance(rosca.address);

  yield this.withdraw(user);
  let contractBalanceAfter = yield this.getBalance(rosca.address);

  return contractBalanceBefore - contractBalanceAfter;
};

roscaHelper.prototype.getParticipantInfo = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  return rosca.members.call(user);
};

roscaHelper.prototype.getContractStatus = co(function* (optRosca) {
  let rosca = optRosca || this.roscaContract; // eslint-disable-line

  let memberInfos = [];
  for (let i = 0; i < consts.memberCount(); i++) {
    memberInfos.push(yield this.userCredit(i)); // eslint-disable-line
  }

  let results = yield Promise.all([
    rosca.totalDiscounts.call(),
    rosca.currentRound.call(),
    rosca.totalFees.call(),
  ]);

  let balance = yield rosca.getBalance(rosca.address);

  return {
    credits: [
      memberInfos[0], memberInfos[1], memberInfos[2], memberInfos[3]],
    totalDiscounts: results[0].toNumber(),
    currentRound: results[1].toNumber(),
    balance: balance,
    totalFees: results[2].toNumber(),
  };
});

roscaHelper.prototype.endOfROSCARetrieveSurplus = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  return rosca.endOfROSCARetrieveSurplus({from: user});
};

roscaHelper.prototype.enableEscapeHatch = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  return rosca.enableEscapeHatch({from: user});
};

roscaHelper.prototype.activateEscapeHatch = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  return rosca.activateEscapeHatch({from: user});
};

roscaHelper.prototype.getCurrentRosca = function() {
  return this.roscaContract;
};

roscaHelper.prototype.endOfROSCARetrieveFees = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  return rosca.endOfROSCARetrieveFees({from: user});
};

roscaHelper.prototype.emergencyWithdrawal = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.roscaContract;

  return rosca.emergencyWithdrawal({from: user});
};

roscaHelper.prototype.getBalance = co(function* (userIndexOrAddress, optTokenContract) {
  let account = (typeof userIndexOrAddress === 'number') ?
    this.accounts[userIndexOrAddress] : userIndexOrAddress; // eslint-disable-line
  let tokenContract = optTokenContract || ZERO_ADDRESS;

  if (!tokenContract || tokenContract === ZERO_ADDRESS) {
    return web3.eth.getBalance(account).toNumber();
  }

  let balance = (yield ExampleToken.at(tokenContract).balanceOf(account)).toNumber();
  return balance;
});

module.exports = roscaHelper;
