"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("../utils/utils.js");
let TestReEntryAttack = artifacts.require('test/TestReEntryAttack.sol');
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('../utils/consts');

contract('ROSCA reentry attack test', function(accounts) {
  // Parameters for new ROSCA creation
  const MEMBER_LIST = accounts.slice(2);

  const MEMBER_COUNT = MEMBER_LIST.length + 1;
  const DEFAULT_POT = consts.CONTRIBUTION_SIZE * MEMBER_COUNT;

  it("prevents re-entry attacks in withdraw", co(function* () {
    // Create an attack contract that tries to call re-enter withdraw() when funds
    // are transferred to it, see TestReEntryAttack.sol .
    utils.mineOneBlock();
    let attackContract = yield TestReEntryAttack.new();

    let latestBlock = web3.eth.getBlock("latest");
    let blockTime = latestBlock.timestamp;
    let rosca = yield ROSCATest.new(
        0  /* use ETH */, 0 /* use Bidding Rosca */,
        consts.ROUND_PERIOD_IN_SECS, consts.CONTRIBUTION_SIZE,
        blockTime + consts.START_TIME_DELAY, [accounts[0], attackContract.address],
        consts.SERVICE_FEE_IN_THOUSANDTHS, {from: accounts[0]});

    utils.increaseTime(consts.START_TIME_DELAY);

    yield attackContract.setRoscaAddress(rosca.address);

    // In round 1, let attack contract contribute 2.5C, other player contributes 5C.
    // Attack contract bids, so that we know they win.
    yield attackContract.contribute({from: accounts[1], value: consts.CONTRIBUTION_SIZE * 2.5, gas: 4e6});
    yield attackContract.bid(0.9 * DEFAULT_POT, {from: accounts[0], gas: 4e6});

    yield rosca.contribute({from: accounts[0], value: consts.CONTRIBUTION_SIZE * 5, gas: 4e6});
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

    yield attackContract.startRound();
    // Second round: attacker contract's credit should be 2.5C + 0.9C + 0.05C (discount) == 3.45C.
    // Therefore, should be available to withdraw 1.45C.
    // However, if a re-entry attack is succesfful we should see twice that value transferred.
    let amountBefore = web3.eth.getBalance(attackContract.address);

    // Try to attack

    let result = yield attackContract.withdrawTwice();
    let log = result.logs[0];
    let withdrawSuccessful = log.args.success;

    // Check that withdraw was tried out, returned false, and no money was transferred.
    assert.isNotOk(withdrawSuccessful);
    let amountAfter = web3.eth.getBalance(attackContract.address);
    assert.equal(amountBefore.toNumber(), amountAfter.toNumber());
  }));
});
