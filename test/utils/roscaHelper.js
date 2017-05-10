"use strict";

let co = require("co").wrap;
let consts = require("./consts.js");
let ROSCATest = artifacts.require('ROSCATest.sol'); // eslint-disable-line
let ExampleToken = artifacts.require('test/ExampleToken.sol'); // eslint-disable-line
let ERC20TokenInterface = artifacts.require('deps/ERC20TokenInterface.sol'); // eslint-disable-line

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function roscaHelper(accounts_, rosca_) {
  this.accounts = accounts_;
  this.rosca = rosca_;
};

roscaHelper.prototype.address = function () {
  return this.rosca.address
}

// Currency-agnostic
roscaHelper.prototype.contractNetCredit = function* (optRosca) {
  let rosca = optRosca || this.rosca;
  let tokenContract = yield rosca.tokenContract.call();
  if (tokenContract == ZERO_ADDRESS) {
    return web3.eth.getBalance(rosca.address).toNumber() - (yield rosca.totalFees.call()).toNumber();
  }
  return (yield ExampleToken.at(tokenContract).balanceOf(rosca.address)) - (yield rosca.totalFees.call()).toNumber();
};

// Currency-agnostic
roscaHelper.prototype.contribute = function(userIndexOrAddress, value, optRosca) {
  let from = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

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
  let rosca = optRosca || this.rosca;

  return rosca.withdraw({from: from});
};

roscaHelper.prototype.startRound = function(optRosca) {
  let rosca = optRosca || this.rosca;

  return rosca.startRound();
};

roscaHelper.prototype.bid = function(userIndexOrAddress, amount, optRosca) {
  let from = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

  return rosca.bid(amount, {from: from});
};

roscaHelper.prototype.totalDiscounts = co(function* (optRosca) {
  let rosca = optRosca || this.rosca;
  return (yield rosca.totalDiscounts.call()).toNumber();
});

roscaHelper.prototype.totalFees = co(function* (optRosca) {
  let rosca = optRosca || this.rosca;
  return (yield rosca.totalFees.call()).toNumber();
});

roscaHelper.prototype.getParticipantBalance = co(function* (userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

  return (yield rosca.getParticipantBalance.call(user)).toNumber();
});

roscaHelper.prototype.getUser = co(function* (userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

  let userInfo = yield rosca.members.call(user);
  return userInfo; // credit is in 0 position of the returned value
});

roscaHelper.prototype.userCredit = co(function* (userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

  let userInfo = yield rosca.members.call(user);
  return userInfo[0].toNumber(); // credit is in 0 position of the returned value
});

roscaHelper.prototype.addMember = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

  return rosca.addMember(user);
}

roscaHelper.prototype.MIN_DISTRIBUTION_PERCENT = function(optRosca) {
  let rosca = optRosca || this.rosca;

  return rosca.MIN_DISTRIBUTION_PERCENT.call()
}

roscaHelper.prototype.cleanUpPreviousRound = function(optRosca) {
  let rosca = optRosca || this.rosca;

  return rosca.cleanUpPreviousRound()
}

roscaHelper.prototype.tokenContract = function(optRosca) {
  let rosca = optRosca || this.rosca;

  return rosca.tokenContract.call();
}

roscaHelper.prototype.endOfROSCARetrieveSurplus = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

  return rosca.endOfROSCARetrieveSurplus({from: user});
}

roscaHelper.prototype.enableEscapeHatch = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

  return rosca.enableEscapeHatch({from: user});
}

roscaHelper.prototype.activateEscapeHatch = function (userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

  return rosca.activateEscapeHatch({from: user});
}

roscaHelper.prototype.getCurrentRosca = function() {
  return this.rosca
}

roscaHelper.prototype.endOfROSCARetrieveFees = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

  return rosca.endOfROSCARetrieveFees({from: user})
}

roscaHelper.prototype.emergencyWithdrawal = function(userIndexOrAddress, optRosca) {
  let user = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let rosca = optRosca || this.rosca;

  return rosca.emergencyWithdrawal({from: user})
}

roscaHelper.prototype.getBalance = co(function* (userIndexOrAddress, optTokenContract) {
  let account = (typeof userIndexOrAddress === 'number') ? this.accounts[userIndexOrAddress] : userIndexOrAddress;
  let tokenContract = optTokenContract || ZERO_ADDRESS;

  if (!tokenContract || tokenContract === ZERO_ADDRESS) {
    return web3.eth.getBalance(account).toNumber();
  }

  let balance = (yield ExampleToken.at(tokenContract).balanceOf(account)).toNumber();
  return balance;
});

module.exports = roscaHelper;
