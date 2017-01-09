"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

let expectedContractBalance;
let expectedtotalDiscounts;
let p0ExpectedCredit;
let rosca;
let accounts;

const WINNING_BID_PERCENT = [0.95, 0.90, 1, 1];

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

function participantInfo(member) {
  return rosca.members.call(accounts[member]);
}

// Due to js roundoff errors, we allow values be up to a basis point off.
function assertWeiCloseTo(actual, expected) {
  // deal with rounding errors by allowing some minimal difference of 0.1%
  assert.closeTo(Math.abs(1 - actual / expected) , 0, 0.0001, "actual: " + actual + ",expected: " + expected);
}

function* getContractStatus() {
  let results = yield Promise.all([
          participantInfo(0),
          participantInfo(1),
          participantInfo(2),
          participantInfo(3),
          rosca.totalDiscounts.call(),
          rosca.currentRound.call(),
          rosca.totalFees.call(),
      ]);
  let balance = web3.eth.getBalance(rosca.address).toNumber();
  return {
    credits: [
      results[0][0].toNumber(), results[1][0].toNumber(), results[2][0].toNumber(), results[3][0].toNumber()],
    totalDiscounts: results[4].toNumber(),
    currentRound: results[5].toNumber(),
    balance: balance,
    totalFees: results[6].toNumber()
  };
}

contract('Full 4 Member ROSCA Test', function(accounts_) {
  const MIN_START_DELAY = 86400 + 10;
  const ROUND_PERIOD_IN_DAYS = 3;
  const ROUND_PERIOD = ROUND_PERIOD_IN_DAYS * 86400;
  const MEMBER_COUNT = 4;
  const CONTRIBUTION_SIZE = 1e18;
  const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
  const SERVICE_FEE_IN_THOUSANDTHS = 10;
  const NET_REWARDS_RATIO = ((1000 - SERVICE_FEE_IN_THOUSANDTHS) / 1000);

  before(function(done) {
    accounts = accounts_;
    utils.mineOneBlock();  // reset the blockchain

    let latestBlock = web3.eth.getBlock("latest");
    let blockTime = latestBlock.timestamp;
    ROSCATest.new(
      ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, blockTime + MIN_START_DELAY, accounts.slice(1, 4),
      SERVICE_FEE_IN_THOUSANDTHS).then(function(aRosca) {
        rosca = aRosca;
       done();
      });
  });

  it("pre-ROSCA: checks rosca status is valid", co(function*() {
      let contract = yield getContractStatus();

      for (let i = 0; i < 4; ++i) {
        assert.equal(contract.credits[i], 0); // credit of each participant
      }
      assert.equal(contract.totalDiscounts, 0); // totalDiscount value
      assert.equal(contract.currentRound, 0); // currentRound value
      assert.equal(contract.balance, 0);
  }));

  // In the different tests' comments:
  // C is the CONTRIBUTION_SIZE
  // P is the DEFAULT_POT
  // MC is MEMBER_COUNT == 4
  // NR is NET_REWARDS
  it("1st round: p2 wins 0.95 of the pot", co(function*() {
    yield Promise.all([
        contribute(0, CONTRIBUTION_SIZE * 10),  // p0's credit == 10C
        contribute(2, CONTRIBUTION_SIZE)  // p2's credit == C
    ]);
    utils.increaseTime(ROUND_PERIOD);

    yield Promise.all([
        startRound(),
        contribute(1, CONTRIBUTION_SIZE * 1.2), // p1's credit = C * 1.2
        bid(2, DEFAULT_POT), // lowestBid = pot, winner = 2
        // foreperson should be allowed to withdraw the extra C * 9, new credit = contributionSize
        withdraw(0),
        bid(1, DEFAULT_POT * 0.98), // lowestBid = Pot * 0.98, winner = 1
        bid(2, DEFAULT_POT * WINNING_BID_PERCENT[0]), // lowestBid = Pot * 0.95, winner = 2
        contribute(3, CONTRIBUTION_SIZE),  // p3's credit = contributionSize
        bid(1, DEFAULT_POT * 0.97), // higher than lowestBid; ignored
    ]);

    utils.increaseTime(ROUND_PERIOD);

    yield startRound();

    let contract = yield getContractStatus();

    // Note that all credits are actually CONTRIBUTION_SIZE more than participants can
    // draw (neglecting totalDiscounts).
    assert.equal(contract.credits[0], CONTRIBUTION_SIZE);
    assert.equal(contract.credits[1], 1.2 * CONTRIBUTION_SIZE);
    // p2 contriubted C and won POT * 0.95(WINNING_BID_PERCENT)
    assert.equal(contract.credits[2], CONTRIBUTION_SIZE + DEFAULT_POT * WINNING_BID_PERCENT[0] * NET_REWARDS_RATIO);
    assert.equal(contract.credits[3], CONTRIBUTION_SIZE);
    // totalDiscount should be difference in defaultPot and pot won * fee / memberCount
    // totalDiscounts = (DEFAULT_POT - POT_WON) * NET_REWARD_RATIO / memberCount
    expectedtotalDiscounts = (DEFAULT_POT * (1 - WINNING_BID_PERCENT[0])) * NET_REWARDS_RATIO / MEMBER_COUNT;
    assertWeiCloseTo(contract.totalDiscounts, expectedtotalDiscounts);

    // This round contract started with 0.
    // Participants contributed 10C + C + 1.2C + C == 13.2C.
    // p0 withdrew 10C - 1C == 9C.
    // Expected balance is thus 13.2C - 9C == 4.2C.
    expectedContractBalance = 4.2 * CONTRIBUTION_SIZE;
    assert.equal(contract.balance, expectedContractBalance);
    // Total fee = theoretical fee (since no delinquency)
    // totalFees = memberCount * contributionSize * currentRound - 1 (startRound incremented
    // currentRound after calculating totalFees)
    assert.equal(contract.totalFees, DEFAULT_POT * (contract.currentRound - 1)
        / 1000 * SERVICE_FEE_IN_THOUSANDTHS);

    assert.equal(contract.currentRound, 2); // currentRound value
    assert.isNotOk(yield rosca.endOfROSCA.call());
  }));

  it("2nd round: p2, who has won previous round, and p3, who has not won yet, do not contribute", co(function*() {
    let contractBalanceBefore = (yield getContractStatus()).balance;

    // the amount withdrawn by p2 should be
    // potWon - contribution(new round contribution) + totalDiscount;
    let expectedWithdrawalBalance = DEFAULT_POT * WINNING_BID_PERCENT[0] * NET_REWARDS_RATIO -
        CONTRIBUTION_SIZE  + expectedtotalDiscounts;
    yield withdraw(2);

    let contract = yield getContractStatus();
    // since contract have enough balance to withdraw fully,
    // credit should be = currentRound * contribution - totalDiscount
    assert.equal(contract.credits[2], 2 * CONTRIBUTION_SIZE - expectedtotalDiscounts);

    assert.equal(contractBalanceBefore - contract.balance, expectedWithdrawalBalance);

    yield contribute(1, CONTRIBUTION_SIZE * 0.8); // p1's credit = 2C
    yield bid(1, DEFAULT_POT); // lowestBid = Pot, winner = 1
    // Foreperson only pays the extra money required, taking into account discount from previous round.
    // Foreperson's credit is = C (from before) + C - totalDiscount
    yield contribute(0, CONTRIBUTION_SIZE - DEFAULT_POT * 0.05 / MEMBER_COUNT * NET_REWARDS_RATIO);
    yield bid(0, DEFAULT_POT * 0.95); // lowestBid = Pot * 0.95, winnerAddress = foreman
    yield bid(1, DEFAULT_POT * WINNING_BID_PERCENT[1]); // lowestBid = Pot * 0.90, winner = 1
    yield utils.assertThrows(bid(3, DEFAULT_POT * 0.75));  // as 3 is not in good standing

    utils.increaseTime(ROUND_PERIOD);

    yield startRound();

    contract = yield getContractStatus();

    // Note that all credits are actually 2C more than participants can draw (neglecting totalDiscounts).
    // Total discounts by now is 0.15P.
    assert.equal(contract.credits[0], 2 * CONTRIBUTION_SIZE - DEFAULT_POT * 0.05 / MEMBER_COUNT * NET_REWARDS_RATIO);
    assert.equal(contract.credits[1], 2 * CONTRIBUTION_SIZE + DEFAULT_POT * WINNING_BID_PERCENT[1] * NET_REWARDS_RATIO);
    assert.equal(contract.credits[2], 2 * CONTRIBUTION_SIZE - DEFAULT_POT * 0.05 / MEMBER_COUNT * NET_REWARDS_RATIO);
    assert.equal(contract.credits[3], CONTRIBUTION_SIZE); // not in good standing
    // TD == OLD_TD + (DEFAULT_POT - POT_WON) * NET_REWARD_RATIO / memberCount
    expectedtotalDiscounts = expectedtotalDiscounts + DEFAULT_POT * (1 - WINNING_BID_PERCENT[1]) /
        MEMBER_COUNT * NET_REWARDS_RATIO;
    assertWeiCloseTo(contract.totalDiscounts, expectedtotalDiscounts);

    // Contributions were 0.8C + 1C - totalDiscount from last Round .
    // Thus we expect credit to be lastRound's balance + 0.8 + 1 - totalDiscount from lastRound - balance withdrawn
    expectedContractBalance = expectedContractBalance + 1.8 * CONTRIBUTION_SIZE - expectedWithdrawalBalance -
        DEFAULT_POT * 0.05 / MEMBER_COUNT * NET_REWARDS_RATIO;
    assert.equal(contract.balance, expectedContractBalance);
    // totalFees == 2 * 4 = 8 - 1 (1 person didn't contribute) * fees;
    let theoreticalTotalFees = DEFAULT_POT * (contract.currentRound - 1);
    assertWeiCloseTo(contract.totalFees, (theoreticalTotalFees - CONTRIBUTION_SIZE + expectedtotalDiscounts) / 1000 *
        SERVICE_FEE_IN_THOUSANDTHS);

    assert.equal(contract.currentRound, 3); // currentRound value
    assert.isNotOk(yield rosca.endOfROSCA.call());
  }));

  it("3rd round: everyone but 2 contributes, nobody puts a bid", co(function*() {
    let contractBalanceBefore = (yield getContractStatus()).balance;
    yield withdraw(1);
    let contract = yield getContractStatus();

    assert.equal(contract.credits[1], 3 * CONTRIBUTION_SIZE -
        DEFAULT_POT * 0.15 / MEMBER_COUNT * NET_REWARDS_RATIO);
    // The contract retains the service fee for the withdrawal, so we expect only
    // 2.85C * 0.99 == 2.8215C to be withdrawn.
    // Pot Won - nextRound's contribution + totalDiscount
    let expectedWithdrawalBalance = DEFAULT_POT * WINNING_BID_PERCENT[1] * NET_REWARDS_RATIO -
        CONTRIBUTION_SIZE  + DEFAULT_POT * 0.15 / MEMBER_COUNT * NET_REWARDS_RATIO;
    assert.equal(contractBalanceBefore - contract.balance, expectedWithdrawalBalance);
    // Contract would be left with 3.2185C (last balance) - 2.7225C (just withdraw) = 0.4145C
    //assert.equal(contract.balance, 0.496 * CONTRIBUTION_SIZE);

    Promise.all([
      contribute(0, CONTRIBUTION_SIZE),  // p0's credit == 1.95C + C == 2.95C
      // p2 does not contribute this time.  p2's credit == 1.95C
      // p3 is still missing a contribution from last period, so still not in good standing
      contribute(3, CONTRIBUTION_SIZE),  // p3's credit == C + C == 2C
    ]);

    utils.increaseTime(ROUND_PERIOD);

    // Nobody bids and the round ends.
    yield startRound();

    // p1 and p2 already won. p3 is not in good standing. Hence, p0 should win the entire pot.
    contract = yield getContractStatus();

    // Note that all credits are actually 3C more than participants can draw (neglecting totalDiscounts).
    // p0 gets the rewards of P = 4C = 4C. Adding to his 2.95C == 6.95C
    assert.equal(contract.credits[0], 3 * CONTRIBUTION_SIZE - DEFAULT_POT * 0.05 / MEMBER_COUNT * NET_REWARDS_RATIO +
        DEFAULT_POT * NET_REWARDS_RATIO);
    assert.equal(contract.credits[1], 3 * CONTRIBUTION_SIZE - DEFAULT_POT * 0.15 / MEMBER_COUNT * NET_REWARDS_RATIO);
    // not in good standing
    assert.equal(contract.credits[2], 2 * CONTRIBUTION_SIZE - DEFAULT_POT * 0.05 / MEMBER_COUNT * NET_REWARDS_RATIO);
    assert.equal(contract.credits[3], 2 * CONTRIBUTION_SIZE); // not in good standing

    assertWeiCloseTo(contract.totalDiscounts, expectedtotalDiscounts);  // The entire pot was won, TD does not change,

    // Last we checked contractBalance (in this test) it was 0.496C. With 2 contributions of C each, we get to 2.424C.
    expectedContractBalance = expectedContractBalance - expectedWithdrawalBalance + 2 * CONTRIBUTION_SIZE;

    assert.equal(contract.balance, expectedContractBalance);
    // totalFees == 3 * 4 = 12 - 1(p2) - 1(p3) = 10C == 0.1 C
    let theoreticalTotalFees = DEFAULT_POT * (contract.currentRound - 1);
    let p2Delinquency = (contract.currentRound - 1) * CONTRIBUTION_SIZE - contract.credits[2] - expectedtotalDiscounts;
    let p3Delinquency = (contract.currentRound - 1) * CONTRIBUTION_SIZE - contract.credits[3] - expectedtotalDiscounts;
    assertWeiCloseTo(contract.totalFees, (theoreticalTotalFees - p2Delinquency - p3Delinquency) / 1000 *
        SERVICE_FEE_IN_THOUSANDTHS);

    assert.equal(contract.currentRound, 4); // currentRound value
    assert.isNotOk(yield rosca.endOfROSCA.call());
  }));

  it("4th round (last): nodoby bids and p3, the only non-winner, can't win as he's not in good standing," +
      " p0 tries to withraw more than contract's balance",
      co(function*() {
    let contractBalanceBefore = (yield getContractStatus()).balance;
    yield withdraw(0);

    let contract = yield getContractStatus();
    // contract doesn't have enough funds to fully withdraw p0's request, only totalFees should be left after withdrawal
    assert.equal(contractBalanceBefore - contract.balance, contractBalanceBefore - contract.totalFees);
    expectedContractBalance = contract.totalFees;
    assert.equal(contract.balance, expectedContractBalance);

    p0ExpectedCredit = 3 * CONTRIBUTION_SIZE - DEFAULT_POT * 0.05 / MEMBER_COUNT * NET_REWARDS_RATIO +
        DEFAULT_POT * NET_REWARDS_RATIO - (contractBalanceBefore - contract.totalFees);
    assertWeiCloseTo(contract.credits[0], p0ExpectedCredit);
    Promise.all([
      contribute(1, CONTRIBUTION_SIZE),
      // p3 is still missing a contribution from 2nd period, so still not in good standing
      contribute(3, CONTRIBUTION_SIZE),
      contribute(2, 4 * CONTRIBUTION_SIZE), // this will allow extra funds to be leftover at the end
    ]);

    // nobody can bid now - p0, p1, p2 already won. p3 is not in good standing.
    yield utils.assertThrows(bid(0, DEFAULT_POT * 0.9));
    yield utils.assertThrows(bid(1, DEFAULT_POT * 0.9));
    yield utils.assertThrows(bid(2, DEFAULT_POT * 0.9));
    yield utils.assertThrows(bid(3, DEFAULT_POT * 0.9));

    utils.increaseTime(ROUND_PERIOD);

    // Nobody bids and the round ends.
    yield startRound();

    // No one wins this round because the only non-winner (p3) is not in good standing.
    contract = yield getContractStatus();
    // Note that all credits are actually 3C more than participants can draw (neglecting totalDiscounts).
    assertWeiCloseTo(contract.credits[0], p0ExpectedCredit);
    assertWeiCloseTo(contract.credits[1], 4 * CONTRIBUTION_SIZE - DEFAULT_POT * 0.15 / MEMBER_COUNT * NET_REWARDS_RATIO);
    assertWeiCloseTo(contract.credits[2], 6 * CONTRIBUTION_SIZE - DEFAULT_POT * 0.05 / MEMBER_COUNT * NET_REWARDS_RATIO);
    // not in good standing but won the pot
    assertWeiCloseTo(contract.credits[3], 3 * CONTRIBUTION_SIZE + DEFAULT_POT * NET_REWARDS_RATIO);
    // The entire pot was won, TD does not change

    assertWeiCloseTo(contract.totalDiscounts, expectedtotalDiscounts);

    // total deposit = 6 * contribution , no withdrawal
    expectedContractBalance = expectedContractBalance + 6 * CONTRIBUTION_SIZE;
    assertWeiCloseTo(contract.balance, expectedContractBalance);

    let theoreticalTotalFees = DEFAULT_POT * contract.currentRound;
    let p3Delinquency = (contract.currentRound * CONTRIBUTION_SIZE + DEFAULT_POT * NET_REWARDS_RATIO) -
        contract.credits[3] - expectedtotalDiscounts;

    assertWeiCloseTo(contract.totalFees, (theoreticalTotalFees - p3Delinquency) / 1000 * SERVICE_FEE_IN_THOUSANDTHS);

    assert.equal(contract.currentRound, 4); // currentRound value
    // End of Rosca has been reached
    assert.isOk(yield rosca.endOfROSCA.call());
  }));

  it("post-ROSCA", co(function*() {
    let contractBalanceBefore = (yield getContractStatus()).balance;
    yield withdraw(0);
    // p0's credit from last round

    let contract = yield getContractStatus();
    assertWeiCloseTo(contractBalanceBefore - contract.balance, p0ExpectedCredit -
        (4 * CONTRIBUTION_SIZE - expectedtotalDiscounts));
    // last rounded ended with contract.balance == 2.1695. So it should now have (2.1695 - 0.7425C) == 1.427C
    expectedContractBalance -= p0ExpectedCredit - (4 * CONTRIBUTION_SIZE - expectedtotalDiscounts);
    assertWeiCloseTo(contract.balance, expectedContractBalance);
    assert.equal(contract.credits[0], 4 * CONTRIBUTION_SIZE - expectedtotalDiscounts);

    utils.assertThrows(contribute(2, 2 * CONTRIBUTION_SIZE));

    // p3 can withdraw the amount that he contributed
    yield withdraw(3);
    contract = yield getContractStatus();
    expectedContractBalance = expectedContractBalance - 3 * CONTRIBUTION_SIZE - expectedtotalDiscounts;
    assertWeiCloseTo(contract.balance, expectedContractBalance);

  }));

  it("post-ROSCA collection period", co(function*() {
    utils.increaseTime(ROUND_PERIOD);
    // Only the foreperson can collect the surplus funds.
    yield utils.assertThrows(rosca.endOfROSCARetrieveSurplus({from: accounts[2]}));
    let p0balanceBefore = web3.eth.getBalance(accounts[0]);
    yield rosca.endOfROSCARetrieveSurplus({from: accounts[0]});
    let p0balanceAfter = web3.eth.getBalance(accounts[0]);
    // Accounting for gas, we can't expect the entire funds to be transferred to p0.
    assert.isAbove(p0balanceAfter - p0balanceBefore,
        2.0 * CONTRIBUTION_SIZE / 1000 * NET_REWARDS_RATIO);

    // Only the feeCollector can collect the fees.
    yield utils.assertThrows(rosca.endOfROSCARetrieveSurplus({from: accounts[2]}));

    let feeCollectorBalanceBefore = web3.eth.getBalance(accounts[9]).toNumber();
    yield rosca.endOfROSCARetrieveFees({from: accounts[9]});
    let feeCollectorBalanceAfter = web3.eth.getBalance(accounts[9]).toNumber();
    // Accounting for gas, we can't expect the entire funds to be transferred to p0.
    // TODO(ronme): more precise calculations after we move to the contribs/winnings model.
    assert.isAbove(feeCollectorBalanceAfter, feeCollectorBalanceBefore);
  }));
});