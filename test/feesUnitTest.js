'use strict';

let Promise = require('bluebird');
let assert = require('chai').assert;
let co = require('co').wrap;
let utils = require('./utils/utils.js');

let accounts;
let rosca;

// Shortcut functions
function contribute(from, value) {
  return rosca.contribute({from: accounts[from], value: value});
}

function startRound() {
  return rosca.startRound();
}

function bid(from, bidInWei) {
  return rosca.bid(bidInWei, {from: accounts[from]});
}

function withdraw(from) {
  return rosca.withdraw({from: accounts[from]});
}

contract('fees unit test', function(accounts_) {
  const START_TIME_DELAY = 86400 + 10;
  const ROUND_PERIOD_IN_SECS = 100;
  const SERVICE_FEE_IN_THOUSANDTHS = 10;
  // Note accounts[0] is the foreperson, deploying the contract.
  const CONTRIBUTION_SIZE = 1e17;
  const MEMBER_LIST = accounts_.slice(1, 2);  // accounts[0] is also participant, as a foreperson
  const POT_SIZE = (MEMBER_LIST.length + 1) * CONTRIBUTION_SIZE;
  const NET_REWARDS_RATIO = ((1000 - SERVICE_FEE_IN_THOUSANDTHS) / 1000);


  function* getFeesInContractAfterLastRound(rosca) {
    // Wait another round.
    utils.increaseTime(ROUND_PERIOD_IN_SECS);

    yield rosca.endOfROSCARetrieveSurplus({from: accounts[0]}); // Let foreperson retrieve their own fees.

    // Whatever is left in the contract are the fees
    return web3.eth.getBalance(rosca.address);
  }

  function expectedFeesFrom(amount) {
    return amount * SERVICE_FEE_IN_THOUSANDTHS / 1000;
  }

  beforeEach(function(done) {
    accounts = accounts_;
    utils.mineOneBlock();  // reset the blockchain

    let latestBlock = web3.eth.getBlock('latest');
    let blockTime = latestBlock.timestamp;
    ROSCATest.new(
     0  /* use ETH */,
     ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, accounts.slice(1, 2),
      SERVICE_FEE_IN_THOUSANDTHS)
      .then(function(aRosca) {
        rosca = aRosca;
       done();
      });
  });

  it('charges the right fees when there is no delinquency', co(function* () {
    utils.increaseTime(START_TIME_DELAY + 200);
    yield Promise.all([
      startRound(),
      contribute(0, CONTRIBUTION_SIZE),
      contribute(1, CONTRIBUTION_SIZE),

      bid(0, 0.9 * POT_SIZE),
    ]);

    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      startRound(),
      contribute(0, CONTRIBUTION_SIZE),
      contribute(1, CONTRIBUTION_SIZE),
    ]);
    // Finish the ROSCA
    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();

    let contractBalanceBefore = web3.eth.getBalance(rosca.address).toNumber();

    yield withdraw(0);
    let contractBalanceAfter = web3.eth.getBalance(rosca.address).toNumber();
    // withdrawal would be (0.9 * 2C) * 0.99(fee) + (0.1 * 2 / 2)(totalDiscounts) * 0.99(fee)
    assert.equal(contractBalanceBefore - contractBalanceAfter, 1.8 * CONTRIBUTION_SIZE * NET_REWARDS_RATIO +
        0.1 * CONTRIBUTION_SIZE * NET_REWARDS_RATIO, "fees taken out doesn't match theoretical calculations");

    contractBalanceBefore = web3.eth.getBalance(rosca.address).toNumber();

    yield withdraw(1);
    contractBalanceAfter = web3.eth.getBalance(rosca.address).toNumber();
    // withdrawal would be 2C * 0.99(fee) + (0.1 * 2 / 2)(totalDiscounts) * 0.99(fee)
    assert.equal(contractBalanceBefore - contractBalanceAfter, 2 * 0.99 * CONTRIBUTION_SIZE +
        0.1 * 0.99 * CONTRIBUTION_SIZE, "fees taken out doesn't match theoretical calculations");

    let fees = (yield* getFeesInContractAfterLastRound(rosca)).toNumber();
    assert.equal(fees, expectedFeesFrom(CONTRIBUTION_SIZE * 2 * 2));  // 2 rounds, 2 participants.
  }));

  it('charges overcontributions that get used in the ROSCA', co(function* () {
    // In this test, accounts[0] contributes 2C in round 1, then nothing in round 2.
    utils.increaseTime(START_TIME_DELAY + 200);
    yield Promise.all([
      startRound(),
      contribute(0, 2 * CONTRIBUTION_SIZE),
      contribute(1, CONTRIBUTION_SIZE),

      bid(0, 0.9 * POT_SIZE),
    ]);

    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      startRound(),
      contribute(1, CONTRIBUTION_SIZE),
    ]);
    // Finish the ROSCA
    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();

    let contractBalanceBefore = web3.eth.getBalance(rosca.address).toNumber();

    yield withdraw(0);
    let contractBalanceAfter = web3.eth.getBalance(rosca.address).toNumber();
    // withdrawal would be (0.9 * 2C) * 0.99(fee) + (0.1 * 0.2 / 2)(totalDiscounts) * 0.99(fee)
    assert.equal(contractBalanceBefore - contractBalanceAfter, 1.8 * NET_REWARDS_RATIO * CONTRIBUTION_SIZE +
        0.1 * NET_REWARDS_RATIO * CONTRIBUTION_SIZE, "fees taken out doesn't match theoretical calculations");

    contractBalanceBefore = web3.eth.getBalance(rosca.address).toNumber();

    yield withdraw(1);
    contractBalanceAfter = web3.eth.getBalance(rosca.address).toNumber();
    // withdrawal would be 2C * 0.99(fee) + (0.1 * 0.2 / 2)(totalDiscounts) * 0.99(fee)
    assert.equal(contractBalanceBefore - contractBalanceAfter, 2 * NET_REWARDS_RATIO * CONTRIBUTION_SIZE +
        0.1 * NET_REWARDS_RATIO * CONTRIBUTION_SIZE, "fees taken out doesn't match theoretical calculations");

    let fees = (yield* getFeesInContractAfterLastRound(rosca)).toNumber();
    assert.equal(fees, expectedFeesFrom(CONTRIBUTION_SIZE * 2 * 2));  // 2 rounds, 2 participants.
  }));

  it('does not charge overcontributions that do not get used in the ROSCA and do not get withdrawn', co(function* () {
    // In this test, accounts[0] contributes 1.5C in round 1, and another 1C in round 2.
    utils.increaseTime(START_TIME_DELAY + 200);
    yield Promise.all([
      startRound(),
      contribute(0, 1.5 * CONTRIBUTION_SIZE),
      contribute(1, CONTRIBUTION_SIZE),

      bid(0, 0.9 * POT_SIZE),
    ]);

    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      startRound(),
      contribute(0, 1 * CONTRIBUTION_SIZE),
      contribute(1, CONTRIBUTION_SIZE),
    ]);

    // Finish the ROSCA
    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();

    let contractBalanceBefore = web3.eth.getBalance(rosca.address).toNumber();

    yield withdraw(0);
    let contractBalanceAfter = web3.eth.getBalance(rosca.address).toNumber();
    // withdrawal would be 0.5C(over contributed) + (0.9 * 2C) * 0.99(fee) + (0.1 * 2 / 2)(totalDiscounts) * 0.99(fee)
    assert.equal(contractBalanceBefore - contractBalanceAfter, 0.5 * CONTRIBUTION_SIZE +
        1.8 * NET_REWARDS_RATIO * CONTRIBUTION_SIZE + 0.1 * NET_REWARDS_RATIO * CONTRIBUTION_SIZE,
        "fees got taken out of over contribution");
    let fees = (yield* getFeesInContractAfterLastRound(rosca)).toNumber();
    assert.equal(fees, expectedFeesFrom(CONTRIBUTION_SIZE * 2 * 2));  // 2 rounds, 2 participants.
  }));

  it('does not charge overcontributions that do not get used in the ROSCA and do get withdrawn', co(function* () {
    // In this test, accounts[0] contributes 1.5C in round 1, then withdraws, then contributes another 1C in round 2 .
    utils.increaseTime(START_TIME_DELAY + 200);
    yield Promise.all([
          startRound(),
          contribute(0, 1.5 * CONTRIBUTION_SIZE),
    ]);

    let contractBalanceBefore = web3.eth.getBalance(rosca.address).toNumber();

    yield withdraw(0);
    let contractBalanceAfter = web3.eth.getBalance(rosca.address).toNumber();
    // withdrawal would be 0.5(over contribtuion) ** note, no fees should be taken out of over contribution
    assert.equal(contractBalanceBefore - contractBalanceAfter, 0.5 * CONTRIBUTION_SIZE,
        "fees taken out doesn't match theoretical calculations");

    yield Promise.all([
      contribute(1, CONTRIBUTION_SIZE),

      bid(0, 0.9 * POT_SIZE),
    ]);

    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      startRound(),
      contribute(0, 1 * CONTRIBUTION_SIZE),
      contribute(1, CONTRIBUTION_SIZE),
    ]);

    // Finish the ROSCA
    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield startRound();

    contractBalanceBefore = web3.eth.getBalance(rosca.address).toNumber();

    yield withdraw(0);
    contractBalanceAfter = web3.eth.getBalance(rosca.address).toNumber();
    // withdrawal would be (0.9 * 2C) * 0.99(fee) + (0.1 * 2 / 2)(totalDiscounts) * 0.99(fee)
    let expectedWithdrawalBalance = 1.8 * CONTRIBUTION_SIZE * NET_REWARDS_RATIO +
        0.1 * CONTRIBUTION_SIZE * NET_REWARDS_RATIO;
    assert.equal(contractBalanceBefore - contractBalanceAfter, expectedWithdrawalBalance);
    let fees = (yield* getFeesInContractAfterLastRound(rosca)).toNumber();
    assert.equal(fees, expectedFeesFrom(CONTRIBUTION_SIZE * 2 * 2));  // 2 rounds, 2 participants.
  }));

  it('does not charge fees from contributions not covered because of delinquencies', co(function* () {
    // In this test, accounts[0] contributes 0.5C in round 1, and another 1C in round 2.
    utils.increaseTime(START_TIME_DELAY + 200);
    yield Promise.all([
      startRound(),
      contribute(0, 0.5 * CONTRIBUTION_SIZE),
      contribute(1, CONTRIBUTION_SIZE),

      bid(1, 0.9 * POT_SIZE),
    ]);

    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      startRound(),
      contribute(0, 1 * CONTRIBUTION_SIZE),
      contribute(1, CONTRIBUTION_SIZE),
    ]);

    // Finish the ROSCA
    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();

    let fees = (yield* getFeesInContractAfterLastRound(rosca)).toNumber();
    let expectedDiscount = (MEMBER_LIST.length * CONTRIBUTION_SIZE * 0.1) / MEMBER_LIST.length;
    // console.log(expectedDiscount);
    let expectedFees = (CONTRIBUTION_SIZE * (2 + 1.5) + expectedDiscount) / 1000 * SERVICE_FEE_IN_THOUSANDTHS;
    assert.closeTo(Math.abs(1 - fees / expectedFees), 0, 0.01, "actual: " + fees + ",expected: " + expectedFees);
  }));

  it('checks if fees are applied to rolled over credits', co(function* () {
    // In this test, accounts[0] contributes 0.5C in round 1, and another 1C in round 2.
    utils.increaseTime(START_TIME_DELAY + 200);
    yield Promise.all([
      startRound(),
      contribute(0, CONTRIBUTION_SIZE),
    ]);

    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      startRound(),
    ]);

    // Finish the ROSCA
    utils.increaseTime(ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();
    let fees = (yield* getFeesInContractAfterLastRound(rosca)).toNumber();
    assert.equal(fees, expectedFeesFrom(CONTRIBUTION_SIZE * 2));  // 2 rounds, only one in goodStanding
  }));
});
