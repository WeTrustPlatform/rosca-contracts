"use strict";

// Runs an end to end, full ROSCA test of 4 players with 4 rounds.
// Executes the test twice - once for ETH rosca, and another for token rosca.

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let expectedContractBalance;
let p0ExpectedCredit;
let ethRosca;
let erc20Rosca;
let rosca;

// Percent of the pot that winner of each round will bid
const WINNING_BID_PERCENT = [0.95, 0.90, 1, 1];

// winners of each round by accountIndex
const WINNER_BY_ROUND = [2, 1, 0, 3];

// Discount for each individual members at the end of the round (after the winner is selected)
// these are derived from the winnings bids of the corresponding rounds.
const INDIVIDUAL_DISCOUNTS_FOR_ROUND = [
  utils.afterFee((1 - WINNING_BID_PERCENT[0])),
  utils.afterFee((1 - WINNING_BID_PERCENT[1])),
  utils.afterFee((1 - WINNING_BID_PERCENT[2])),
  utils.afterFee((1 - WINNING_BID_PERCENT[3])),
];

// Each array represents user's contributions relative to CONTRIBUTION_SIZE for each round
const CONTRIBUTIONS_PERCENT = [
  [10, 1 - INDIVIDUAL_DISCOUNTS_FOR_ROUND[0], 1, 0],
  [1.2, 0.8, 0, 1],
  [1, 0, 0, 4],
  [1, 0, 1, 1],
];

// Each array represents expected user's withdrawal relative to consts.CONTRIBUTION_SIZE for each round
const WITHDRAWAL_PERCENT = [
  [CONTRIBUTIONS_PERCENT[0][0] - 1, 0, 0, 0],
  [0, 0,
    utils.afterFee(WINNING_BID_PERCENT[1] * 4) - 1 +
    INDIVIDUAL_DISCOUNTS_FOR_ROUND[1] + INDIVIDUAL_DISCOUNTS_FOR_ROUND[0],
  0],
  [0, utils.afterFee(WINNING_BID_PERCENT[0] * 4) - 1 + INDIVIDUAL_DISCOUNTS_FOR_ROUND[0], 0, 0],
  [0, 0, 0, 0],
];

// Due to js roundoff errors, we allow values be up to a ETH basis point off.
function assertCloseTo(actual, expected) {
  // deal with rounding errors by allowing some minimal difference of 0.1%
  assert.closeTo(Math.abs(1 - actual / expected), 0, 0.0001, "actual: " + actual + ",expected: " + expected);
}

function expectedContractBalanceAtRound(roundNum) {
  let totalBalance = 0;
  for (let i = 0; i < roundNum; i++) {
    for (let userIndex = 0; userIndex < consts.memberCount(); userIndex++) {
      totalBalance += CONTRIBUTIONS_PERCENT[userIndex][i];
      totalBalance -= WITHDRAWAL_PERCENT[userIndex][i];
    }
  }
  return totalBalance * consts.CONTRIBUTION_SIZE;
}

function checkForDelinquencyForUserInRound(userIndex, roundNum) {
  let expectedCredit = expectedCreditToDate(userIndex, roundNum);
  let totalDiscount = 0;
  for (let i = 0; i < roundNum; i++) {
    totalDiscount += INDIVIDUAL_DISCOUNTS_FOR_ROUND[i];
  }
  if (expectedCredit < consts.CONTRIBUTION_SIZE * (roundNum - totalDiscount)) {
    return (consts.CONTRIBUTION_SIZE * (roundNum - totalDiscount)) - expectedCredit;
  }
  return 0;
}

function expectedTotalFeesAtRound(roundNum) {
  let theoreticalFee = consts.defaultPot() * roundNum;

  let delinquenciesAmount = 0;
  for (let i = 0; i < consts.memberCount(); i++) {
    delinquenciesAmount += checkForDelinquencyForUserInRound(i, roundNum);
  }

  let balanceToCollectFees = theoreticalFee - delinquenciesAmount;

  return balanceToCollectFees / 1000 * consts.SERVICE_FEE_IN_THOUSANDTHS;
}

function expectedCreditToDate(userIndex, currentRound) {
  let totalContribution = 0;
  for (let i = 0; i < currentRound; i++) {
    totalContribution += CONTRIBUTIONS_PERCENT[userIndex][i];
    totalContribution -= WITHDRAWAL_PERCENT[userIndex][i];
    if (WINNER_BY_ROUND[i] === userIndex) {
      totalContribution += utils.afterFee(WINNING_BID_PERCENT[i] * consts.memberCount());
    }
  }
  return totalContribution * consts.CONTRIBUTION_SIZE;
}

contract('Full 4 Member ROSCA Test', function(accounts) {
  const NET_REWARDS_RATIO = ((1000 - consts.SERVICE_FEE_IN_THOUSANDTHS) / 1000);

  before(function() {
    consts.setMemberList(accounts);
  });

  beforeEach(co(function* () {
    erc20Rosca = new ROSCAHelper(accounts, (yield utils.createERC20ROSCA(accounts)));
    ethRosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA()));
  }));

  // In the different tests' comments:
  // C is the CONTRIBUTION_SIZE
  // P is the defaultPot
  // MC is memberCount == 4
  // NR is NET_REWARDS

  function* testPreRosca() {
    let contract = yield rosca.getContractStatus();

    for (let i = 0; i < consts.memberCount(); ++i) {
      assert.equal(contract.credits[i], 0); // credit of each participant
    }
    assert.equal(contract.totalDiscounts, 0); // totalDiscount value
    assert.equal(contract.currentRound, 0); // currentRound value
    assert.equal(contract.balance, 0);
  }

  function* test1stRound() {
    utils.increaseTime(consts.START_TIME_DELAY);
    // 1st round: p2 wins 0.95 of the pot
    yield rosca.contribute(0, consts.CONTRIBUTION_SIZE * CONTRIBUTIONS_PERCENT[0][0]); // p0's credit == 10C
    yield rosca.contribute(2, consts.CONTRIBUTION_SIZE * CONTRIBUTIONS_PERCENT[2][0]);  // p2's credit == C
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

    yield rosca.startRound();
    yield rosca.contribute(1, consts.CONTRIBUTION_SIZE * CONTRIBUTIONS_PERCENT[1][0]); // p1's credit = C * 1.2
    yield rosca.bid(2, consts.defaultPot()); // lowestBid = pot, winner = 2
    // foreperson should be allowed to withdraw the extra C * 9, new credit = contributionSize
    yield rosca.withdraw(0);  // p0 withdraws overcontributions, credit should be C again
    yield rosca.bid(1, consts.defaultPot() * WINNING_BID_PERCENT[0] * 1.04); // lowestBid = pot * 0.98, winner = 1
    yield rosca.bid(2, consts.defaultPot() * WINNING_BID_PERCENT[0]); // lowestBid = pot * 0.95, winner = 2
    yield rosca.contribute(3, consts.CONTRIBUTION_SIZE);  // p3's credit = contributionSize
    yield rosca.bid(1, consts.defaultPot() * WINNING_BID_PERCENT[0] * 1.04); // higher than lowestBid; ignored

    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

    yield rosca.startRound();

    let contract = yield rosca.getContractStatus();

    // Note that all credits are actually consts.CONTRIBUTION_SIZE more than participants can
    // draw (neglecting totalDiscounts).
    assert.equal(contract.credits[0], expectedCreditToDate(0, 1));
    assert.equal(contract.credits[1], expectedCreditToDate(1, 1));
    // p2 contriubted C and won POT * 0.95(WINNING_BID_PERCENT)

    assert.equal(contract.credits[2], expectedCreditToDate(2, 1));
    assert.equal(contract.credits[3], expectedCreditToDate(3, 1));

    assertCloseTo(contract.totalDiscounts,
        INDIVIDUAL_DISCOUNTS_FOR_ROUND[0] * consts.CONTRIBUTION_SIZE);

    // This round contract started with 0.
    // Participants contributed 10C + C + 1.2C + C == 13.2C.
    // p0 withdrew 10C - 1C == 9C.
    // Expected balance is thus 13.2C - 9C == 4.2C.
    expectedContractBalance = expectedContractBalanceAtRound(1);
    assert.equal(contract.balance, expectedContractBalance);
    // Total fees = theoretical fee (since no delinquency)
    assert.equal(contract.totalFees, expectedTotalFeesAtRound(1));

    assert.equal(contract.currentRound, 2); // currentRound value
    assert.isNotOk(yield rosca.getCurrentRosca().endOfROSCA.call());
  }

  function* test2ndRound() {
    // 2nd round: p2, who has won previous round, and p3, who has not won yet, do not contribute
    let contractBefore = yield rosca.getContractStatus();

    // the amount withdrawn by p2 should be
    // potWon - contribution(new round contribution) + totalDiscount;
    // we check how much was withdrawn indirectly, by checking how much contract's balance was reduced,
    // to avoid factoring in gas costs paid by p2.
    let expectedWithdrawalBalance = WITHDRAWAL_PERCENT[2][1] * consts.CONTRIBUTION_SIZE;
    yield rosca.withdraw(2);

    let contract = yield rosca.getContractStatus();
    // contract should have enough balance to withdraw the fully amount.
    assert.equal(contract.credits[2], expectedCreditToDate(2, 2));

    assert.equal(contractBefore.balance - contract.balance, expectedWithdrawalBalance);

    yield rosca.contribute(1, consts.CONTRIBUTION_SIZE * CONTRIBUTIONS_PERCENT[1][1]); // p1's credit is now 2C
    yield rosca.bid(1, consts.defaultPot()); // lowestBid = Pot, winner = 1
    // Foreperson only pays the extra money required, taking into account discount from previous round.
    // Foreperson's credit is = C (from before) + C - totalDiscount
    yield rosca.contribute(0, consts.CONTRIBUTION_SIZE * CONTRIBUTIONS_PERCENT[0][1]);
    yield rosca.bid(0, consts.defaultPot() * WINNING_BID_PERCENT[1] * 1.05); // lowestBid = Pot * 0.95, winner = 0
    yield rosca.bid(1, consts.defaultPot() * WINNING_BID_PERCENT[1]); // lowestBid = Pot * 0.90, winner = 1
    yield utils.assertThrows(rosca.bid(2, consts.defaultPot() * 0.75));  // 2 already won
    yield utils.assertThrows(rosca.bid(3, consts.defaultPot() * 0.75));  // 3 is not in good standing

    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

    yield rosca.startRound();

    contract = yield rosca.getContractStatus();

    // Note that all credits are actually 2C more than participants can draw (neglecting totalDiscounts).
    // Total discounts by now is 0.15P / consts.memberCount().

    // assert.equal(contract.credits[0], 2 * consts.CONTRIBUTION_SIZE -
    // consts.defaultPot() * 0.05 / consts.memberCount() * NET_REWARDS_RATIO);
    assert.equal(contract.credits[0], expectedCreditToDate(0, 2));
    assertCloseTo(contract.credits[1], expectedCreditToDate(1, 2));
    assert.equal(contract.credits[2], expectedCreditToDate(2, 2));
    assert.equal(contract.credits[3], consts.CONTRIBUTION_SIZE); // not in good standing
    // TD == OLD_TD + (consts.defaultPot() - POT_WON) * NET_REWARD_RATIO / memberCount
    let expectedTotalDiscounts = (INDIVIDUAL_DISCOUNTS_FOR_ROUND[0] + INDIVIDUAL_DISCOUNTS_FOR_ROUND[1]) * consts.CONTRIBUTION_SIZE;
    assertCloseTo(contract.totalDiscounts, expectedTotalDiscounts);

    // Contributions were 0.8C + 1C - totalDiscount from last Round .
    // Thus we expect credit to be lastRound's balance + 0.8 + 1 - totalDiscount from last round - balance withdrawn
    expectedContractBalance = expectedContractBalanceAtRound(2);
    assert.equal(contract.balance, expectedContractBalance);
    // Only p3 is delinquent, in (1C - TD), and the fees should refelct that.
    assertCloseTo(contract.totalFees, expectedTotalFeesAtRound(2));

    assert.equal(contract.currentRound, 3);
    assert.isNotOk(yield rosca.getCurrentRosca().endOfROSCA.call());
  }

  function* test3rdRound() {
    // 3rd round: everyone but 2 contributes, nobody puts a rosca.bid

    let contractBefore = yield rosca.getContractStatus();
    yield rosca.withdraw(1);
    let contract = yield rosca.getContractStatus();

    let expectedCreditAfter = expectedCreditToDate(1, 3);
    assertCloseTo(contract.credits[1], expectedCreditAfter);

    let expectedWithdrawal = contractBefore.credits[1] - expectedCreditAfter;

    assertCloseTo(contractBefore.balance - contract.balance, expectedWithdrawal);

    yield Promise.all([
      rosca.contribute(0, consts.CONTRIBUTION_SIZE * CONTRIBUTIONS_PERCENT[0][2]),  // p0's credit == 1.95C + C == 2.95C
      // p2 does not contribute this time.  p2's credit remains 1.95C
      // p3 is still missing a contribution from last period, so still not in good standing
      rosca.contribute(3, consts.CONTRIBUTION_SIZE * CONTRIBUTIONS_PERCENT[3][2]),  // p3's credit == C + C == 2C
    ]);

    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

    // Nobody rosca.bids and the round ends.
    yield rosca.startRound();

    // p1 and p2 already won. p3 is not in good standing. Hence, p0 should win the entire pot.
    contract = yield rosca.getContractStatus();
    // Note that all credits are actually 3C more than participants can draw (neglecting totalDiscounts).
    // p0 gets the rewards of P = 4C = 4C. Adding to his 2.95C == 6.95C
    assert.equal(contract.credits[0], expectedCreditToDate(0, 3));
    assertCloseTo(contract.credits[1], expectedCreditToDate(1, 3));
    // not in good standing
    assert.equal(contract.credits[2], expectedCreditToDate(2, 3));
    assert.equal(contract.credits[3], expectedCreditToDate(3, 3)); // not in good standing

    // The entire pot was won, TD does not change,
    assertCloseTo(contract.totalDiscounts, contractBefore.totalDiscounts);

    // Last we checked contractBalance (in this test) it was 0.496C. With 2 contributions of C each, we get to 2.424C.
    expectedContractBalance = expectedContractBalanceAtRound(3);

    assertCloseTo(contract.balance, expectedContractBalance);
    // totalFees == 3 * 4 = 12 - 1(p2) - 1(p3) = 10C == 0.1 C
    assertCloseTo(contract.totalFees, expectedTotalFeesAtRound(3));

    assert.equal(contract.currentRound, 4); // currentRound value
    assert.isNotOk(yield rosca.getCurrentRosca().endOfROSCA.call());
  }

  function* test4thRound() {
    // 4th round (last): nodoby bids and p3, the only non-winner, can't win as he's not in good
    // standing, p0 tries to withraw more than contract's balance
    let contractBefore = yield rosca.getContractStatus();
    yield rosca.withdraw(0);
    let contract = yield rosca.getContractStatus();
    WITHDRAWAL_PERCENT[0][3] = (contractBefore.balance - contract.balance) / consts.CONTRIBUTION_SIZE;
    // contract doesn't have enough funds to fully withdraw p0's request, only totalFees should be left after withdrawal
    assert.equal(contractBefore.balance - contract.balance, contractBefore.balance - contract.totalFees);
    expectedContractBalance = contract.totalFees;
    assert.equal(contract.balance, expectedContractBalance);

    p0ExpectedCredit = expectedCreditToDate(0, 4);
    assertCloseTo(contract.credits[0], p0ExpectedCredit);
    Promise.all([
      rosca.contribute(1, consts.CONTRIBUTION_SIZE * CONTRIBUTIONS_PERCENT[1][3]),
      // p3 is still missing a contribution from 2nd period, so still not in good standing
      rosca.contribute(3, consts.CONTRIBUTION_SIZE * CONTRIBUTIONS_PERCENT[3][3]),
      // this will allow extra funds to be leftover at the end
      rosca.contribute(2, consts.CONTRIBUTION_SIZE * CONTRIBUTIONS_PERCENT[2][3]),
    ]);

    // nobody can rosca.bid now - p0, p1, p2 already won. p3 is not in good standing.
    yield utils.assertThrows(rosca.bid(0, consts.defaultPot() * 0.9));
    yield utils.assertThrows(rosca.bid(1, consts.defaultPot() * 0.9));
    yield utils.assertThrows(rosca.bid(2, consts.defaultPot() * 0.9));
    yield utils.assertThrows(rosca.bid(3, consts.defaultPot() * 0.9));

    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

    // Nobody bids and the round ends.
    yield rosca.startRound();
    // No one wins this round because the only non-winner (p3) is not in good standing.
    contract = yield rosca.getContractStatus();
    // Note that all credits are actually 3C more than participants can draw (neglecting totalDiscounts).
    assertCloseTo(contract.credits[0], expectedCreditToDate(0, 4));
    assertCloseTo(contract.credits[1], expectedCreditToDate(1, 4));
    assertCloseTo(contract.credits[2], expectedCreditToDate(2, 4));
    // not in good standing but won the pot
    assertCloseTo(contract.credits[3], expectedCreditToDate(3, 4));

    // The entire pot was won, so TD does not change
    assertCloseTo(contract.totalDiscounts, contractBefore.totalDiscounts);

    // total deposit = 6 * contribution , no withdrawal
    expectedContractBalance = expectedContractBalanceAtRound(4);

    let theoreticalTotalFees = consts.defaultPot() * contract.currentRound;
    let p3Delinquency =
        (contract.currentRound * consts.CONTRIBUTION_SIZE + consts.defaultPot() * NET_REWARDS_RATIO) -
        contract.credits[3] - contractBefore.totalDiscounts;

    assertCloseTo(contract.totalFees,
      (theoreticalTotalFees - p3Delinquency) / 1000 * consts.SERVICE_FEE_IN_THOUSANDTHS);

    assert.equal(contract.currentRound, 4); // currentRound value
    // End of Rosca has been reached
    assert.isOk(yield rosca.getCurrentRosca().endOfROSCA.call());
  }

  function* testPostRosca() {
    let contractBefore = yield rosca.getContractStatus();
    yield rosca.withdraw(0);  // p0's credit from last round

    let contract = yield rosca.getContractStatus();
    assertCloseTo(contractBefore.balance - contract.balance, expectedCreditToDate(0, 4) -
        (contractBefore.currentRound * consts.CONTRIBUTION_SIZE - contractBefore.totalDiscounts));
    // last rounded ended with contract.balance == 2.1695. So it should now have (2.1695 - 0.7425C) == 1.427C
    expectedContractBalance -= p0ExpectedCredit -
      (contractBefore.currentRound * consts.CONTRIBUTION_SIZE - contractBefore.totalDiscounts);
    assertCloseTo(contract.balance, expectedContractBalance);
    assert.equal(contract.credits[0], consts.defaultPot() - contractBefore.totalDiscounts);

    utils.assertThrows(rosca.contribute(2, consts.CONTRIBUTION_SIZE));

    // p3 can withdraw the amount that he contributed
    yield rosca.withdraw(3);
    contract = yield rosca.getContractStatus();
    expectedContractBalance = expectedContractBalance - 3 * consts.CONTRIBUTION_SIZE - contractBefore.totalDiscounts;
    assertCloseTo(contract.balance, expectedContractBalance);
  }

  function* postRoscaCollectionPeriod() {
    let tokenContract = yield rosca.tokenContract();
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    // Only the foreperson can collect the surplus funds.
    yield utils.assertThrows(rosca.endOfROSCARetrieveSurplus(2));
    let p0balanceBefore = yield rosca.getBalance(0, tokenContract);
    yield rosca.endOfROSCARetrieveSurplus(0);
    let p0balanceAfter = yield rosca.getBalance(0, tokenContract);
    // Accounting for gas, we can't expect the entire funds to be transferred to p0.
    assert.isAbove(p0balanceAfter - p0balanceBefore,
        2.0 * consts.CONTRIBUTION_SIZE / 1000 * NET_REWARDS_RATIO);

    // Only the foreperson can collect the fees.
    yield utils.assertThrows(rosca.endOfROSCARetrieveSurplus(2));

    let forepersonBalanceBefore = yield rosca.getBalance(0, tokenContract);
    yield rosca.endOfROSCARetrieveFees(0);

    let forepersonBalanceAfter = yield rosca.getBalance(0, tokenContract);
    // Accounting for gas, we can't expect the entire funds to be transferred to p0.
    // TODO(ronme): more precise calculations after we move to the contribs/winnings model.
    assert.isAbove(forepersonBalanceAfter, forepersonBalanceBefore);
  }

  function* testCurrentRosca() {
    yield testPreRosca();
    yield test1stRound();
    yield test2ndRound();
    yield test3rdRound();
    yield test4thRound();
    yield testPostRosca();
    yield postRoscaCollectionPeriod();
  }

  it("ETH Rosca", co(function* () {
    rosca = ethRosca;
    yield testCurrentRosca();
  }));

  it("Token ROSCA", co(function* () {
    rosca = erc20Rosca;
    yield testCurrentRosca();
  }));
});
