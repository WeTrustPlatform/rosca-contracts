"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("../utils/utils.js");

contract('ROSCA reentry attack test', function(accounts) {
  // Parameters for new ROSCA creation
  const ROUND_PERIOD_IN_SECS = 100;
  const MEMBER_LIST = accounts.slice(2);
  const CONTRIBUTION_SIZE = 1e16;
  const SERVICE_FEE_IN_THOUSANDTHS = 0;
  const START_TIME_DELAY = 10; // 10 seconds buffer

  const MEMBER_COUNT = MEMBER_LIST.length + 1;
  const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;

  it("prevents re-entry attacks in withdraw", co(function* () {
    // Create an attack contract that tries to call re-enter withdraw() when funds
    // are transferred to it, see TestReEntryAttack.sol .
    utils.mineOneBlock();
    let attackContract = yield TestReEntryAttack.new();

    let latestBlock = web3.eth.getBlock("latest");
    let blockTime = latestBlock.timestamp;
    let rosca = yield ROSCATest.new(
        0  /* use ETH */,
        ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, [attackContract.address],
        SERVICE_FEE_IN_THOUSANDTHS, {from: accounts[0]});

    utils.increaseTime(START_TIME_DELAY);

    yield attackContract.setRoscaAddress(rosca.address);

    // In round 1, let attack contract contribute 2.5C, other player contributes 5C.
    // Attack contract bids, so that we know they win.
    yield rosca.startRound();
    yield attackContract.contribute({from: accounts[1], value: CONTRIBUTION_SIZE * 2.5, gas: 4e6});
    yield attackContract.bid(0.9 * DEFAULT_POT, {from: accounts[0], gas: 4e6});

    yield rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE * 5, gas: 4e6});
    utils.increaseTime(ROUND_PERIOD_IN_SECS);

    yield attackContract.startRound();
    // Second round: attacker contract's credit should be 2.5C + 0.9C + 0.05C (discount) == 3.45C.
    // Therefore, should be available to withdraw 1.45C.
    // However, if a re-entry attack is succesfful we should see twice that value transferred.
    let amountBefore = web3.eth.getBalance(attackContract.address);
    let withdrawEvent = attackContract.LogWithdraw();  // eslint-disable-line new-cap
    let eventFired = false;
    let withdrawSuccessful = undefined;
    withdrawEvent.watch(function(error, log) {
        withdrawEvent.stopWatching();
        eventFired = true;
        withdrawSuccessful = log.args.success;
    });
    // Try to attack
    yield attackContract.withdrawTwice();
    yield Promise.delay(300); // 300ms delay to allow the event to fire properly
    // Check that withdraw was tried out, returned false, and no money was transferred.
    assert.isOk(eventFired);
    assert.isNotOk(withdrawSuccessful);
    let amountAfter = web3.eth.getBalance(attackContract.address);
    assert.equal(amountBefore.toNumber(), amountAfter.toNumber());
  }));
});
