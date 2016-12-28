"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

let rosca;
let accounts;

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
        bid(2, DEFAULT_POT * 0.95), // lowestBid = Pot * 0.95, winner = 2
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
    // p2 contriubted C and won 0.95*4C, so has 4.8C credit.
    assert.equal(contract.credits[2], 4.8 * CONTRIBUTION_SIZE);
    assert.equal(contract.credits[3], CONTRIBUTION_SIZE);
    // totalDiscounts = 0.05P == 0.2C.
    assertWeiCloseTo(contract.totalDiscounts, 0.2 * CONTRIBUTION_SIZE);

    // This round contract started with 0.
    // Participants contributed 10C + C + 1.2C + C == 13.2C.
    // p0 withdrew 10C - 1C == 9C. The fees (of 0.09C) remain in the contract
    // Expected balance is thus 13.2C - 0.09C +  == 4.29C.
    assert.equal(contract.balance, 4.29 * CONTRIBUTION_SIZE);
    // Total fees as of now is deducted from total contributions which are 1% of (10 + 1 + 1.2 + 1)C == 0.132C.
    assert.equal(contract.totalFees, 0.132 * CONTRIBUTION_SIZE);


    assert.equal(contract.currentRound, 2); // currentRound value
    assert.isNotOk(yield rosca.endOfROSCA.call());
  }));

  it("2nd round: p2, who has won previous round, and p3, who has not won yet, do not contribute", co(function*() {
    // In this round, p2's credit is
    // C + P * 0.95  == C + 4C * 0.95 == 4.8C.
    // This is the 2nd round, so they need the following to hold:
    // newCredit + TD / MC == 2C. So newCredit == 2C - TD / MC == 2C - 0.05C == 1.95C .
    // They can thus withdraw 4.8C - 1.95C = 2.85C .
    let contractBalanceBefore = (yield getContractStatus()).balance;

    yield withdraw(2);

    let contract = yield getContractStatus();
    assert.equal(contract.credits[2], 1.95 * CONTRIBUTION_SIZE);
    // The contract retains the service fee for the withdrawl, so we expect only
    // 2.85C * 0.99 == 2.8215C to be withdrawn.
    assert.equal(contractBalanceBefore - contract.balance, 2.8215 * CONTRIBUTION_SIZE);

    yield contribute(1, CONTRIBUTION_SIZE * 0.8); // p1's credit = 2C
    yield bid(1, DEFAULT_POT); // lowestBid = Pot, winner = 1
    // Foreperson only pays the extra money required, taking into account discount from previous round.
    // Foreperson's credit is = C (from before) + C - P * 0.05 / MC = 2C - 4C * 0.05 / 4 = 1.95C
    yield contribute(0, CONTRIBUTION_SIZE - (DEFAULT_POT * 0.05 / MEMBER_COUNT));
    yield bid(0, DEFAULT_POT * 0.95); // lowestBid = Pot * 0.95, winnerAddress = foreman
    yield bid(1, DEFAULT_POT * 0.90); // lowestBid = Pot * 0.90, winner = 1
    yield utils.assertThrows(bid(3, DEFAULT_POT * 0.75));  // as 3 is not in good standing

    utils.increaseTime(ROUND_PERIOD);

    yield startRound();

    contract = yield getContractStatus();

    // Note that all credits are actually 2C more than participants can draw (neglecting totalDiscounts).
    // Total discounts by now is 0.15P.
    assert.equal(contract.credits[0], 1.95 * CONTRIBUTION_SIZE);
    // winner of this round is p1. They win 0.9 * DEFAULT_POT = 0.9 * 4C * == 3.6C. Adding to that
    // their existing credit of 2C, they have 5.6C.
    assert.equal(contract.credits[1], 5.6 * CONTRIBUTION_SIZE);
    assert.equal(contract.credits[2], 1.95 * CONTRIBUTION_SIZE);
    assert.equal(contract.credits[3], CONTRIBUTION_SIZE); // not in good standing
    // TD == OLD_TD + 0.1P == 0.2C + 0.4C == 0.6C
    assertWeiCloseTo(contract.totalDiscounts, 0.6 * CONTRIBUTION_SIZE);

    // This round started with 4.29C .
    // Contributions were 0.8C + 0.95C .
    // p2 withdrew 2.85C . Out of that 1% were retained as fees, so 2.8215C was transferred out.
    // Thus we expect credit to be (4.29 + 0.8 + 0.95 - 2.8215)C == 3.25612C
    assert.equal(contract.balance, 3.2185 * CONTRIBUTION_SIZE);
    // totalFees from previous round was 0.132C. Adding to that 1% of (0.8 + 0.95)C we get 0.1495C.
    assert.equal(contract.totalFees, 0.1495 * CONTRIBUTION_SIZE);
    assert.equal(contract.currentRound, 3); // currentRound value
    assert.isNotOk(yield rosca.endOfROSCA.call());
  }));

  it("3rd round: everyone but 2 contributes, nobody puts a bid", co(function*() {
    // 1's credit is
    // 2C + P * 0.9 == 2C + 4C * 0.9  == 5.6C.
    // This is the 3rd round, so they need the following to hold:
    // newCredit + TD / MC == 3C => newCredit == 3C - TD / MC == 3C - 0.15 * 4C / 4 == 2.85C.
    // They should be able thus to withdraw 5.6C - 2.85C == 2.75C.
    // The contract, retaining the 1% fee, would lost only 2.75C * 99% == 2.7225 .
    let contractBalanceBefore = (yield getContractStatus()).balance;
    yield withdraw(1);
    let contract = yield getContractStatus();
    assert.equal(contractBalanceBefore - contract.balance, 2.7225 * CONTRIBUTION_SIZE);
    assert.equal((yield getContractStatus()).credits[1], 2.85 * CONTRIBUTION_SIZE);
    // Contract would be left with 3.2185C (last balance) - 2.7225C (just withdraw) = 0.4145C
    assert.equal(contract.balance, 0.496 * CONTRIBUTION_SIZE);

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
    assert.equal(contract.credits[0], 6.95 * CONTRIBUTION_SIZE);
    assert.equal(contract.credits[1], 2.85 * CONTRIBUTION_SIZE);
    assert.equal(contract.credits[2], 1.95 * CONTRIBUTION_SIZE); // not in good standing
    assert.equal(contract.credits[3], 2 * CONTRIBUTION_SIZE); // not in good standing
    assertWeiCloseTo(contract.totalDiscounts, 0.6 * CONTRIBUTION_SIZE);  // The entire pot was won, TD does not change,

    // Last we checked contractBalance (in this test) it was 0.496C. With 2 contributions of C each, we get to 2.424C.
    assert.equal(contract.balance, 2.496 * CONTRIBUTION_SIZE);
    // totalFees from last round were 0.1495. Adding to that 2C * 99%, we get 0.1695C.
    assert.equal(contract.totalFees, 0.1695 * CONTRIBUTION_SIZE);

    assert.equal(contract.currentRound, 4); // currentRound value
    assert.isNotOk(yield rosca.endOfROSCA.call());
  }));

  it("4th round (last): nodoby bids and p3, the only non-winner, can't win as he's not in good standing," +
      " p0 tries to withraw more than contract's balance",
      co(function*() {
    // p0's credit is = 6.95C
    // This is the 4th round, so they need the following to hold:
    // newCredit + TD / MC == 4C => newCredit == 4C - TD / MC == 4C - 0.15 * 4C / 4 == 3.85C.
    // They should be able thus to withdraw 6.95C - 3.85C == 3.1C.
    // Since contract's net balance (w/o fees) is only (2.496 - 0.1695)C == 2.3265,
    // p0's credit after withdraw should be 6.95C - 2.3265C / 99% == 4.6C
    let contractBalanceBefore = (yield getContractStatus()).balance;
    yield withdraw(0);

    let contract = yield getContractStatus();

    // Contract will reduce by 2.3265C as noted above.
    assert.equal(contractBalanceBefore - contract.balance, 2.3265 * CONTRIBUTION_SIZE);
    // Contract would be left with 2.496 (last balance) - 2.3265C (just withdrew) = 0.1695C
    assert.equal(contract.balance, 0.1695 * CONTRIBUTION_SIZE);

    assertWeiCloseTo(contract.credits[0], 4.6 * CONTRIBUTION_SIZE);

    Promise.all([
      contribute(1, CONTRIBUTION_SIZE),  // p1's credit == 2.85C + C == 3.85C
      // p2 does not contribute this time.  p2's credit == 1.95C
      // p3 is still missing a contribution from 2nd period, so still not in good standing
      contribute(3, CONTRIBUTION_SIZE),  // p3's credit == 2C + C == 3C
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
    assertWeiCloseTo(contract.credits[0], 4.6 * CONTRIBUTION_SIZE);
    assertWeiCloseTo(contract.credits[1], 3.85 * CONTRIBUTION_SIZE);
    assertWeiCloseTo(contract.credits[2], 1.95 * CONTRIBUTION_SIZE); // not in good standing
    assertWeiCloseTo(contract.credits[3], 3 * CONTRIBUTION_SIZE); // not in good standing
    // The entire pot was won, TD does not change
    assertWeiCloseTo(contract.totalDiscounts, DEFAULT_POT * (0.10 + 0.05));

    // Last we checked contractBalance (in this test) it was 0.1695C. With 2 contributions of C each, we get to 2.1695C.
    assertWeiCloseTo(contract.balance, 2.1695 * CONTRIBUTION_SIZE);

    // totalFees started as 0.1695C. After 2 contributions of 1C each, it should go up to 0.1895C.
    assert.equal(contract.totalFees, 0.1895 * CONTRIBUTION_SIZE);

    assert.equal(contract.currentRound, 4); // currentRound value
    // End of Rosca has been reached
    assert.isOk(yield rosca.endOfROSCA.call());
  }));

  it("post-ROSCA", co(function*() {
    // totalDebit for everyone after 4 rounds is 4C.
    // totalDiscounts would be 0.15C.
    // Therefore everyone's credit should be 3.85C to be in good standing.
    // Amounts withdrawable:
    // p0: 4.6C - 3.85C == 0.75C
    // p1: 3.85C - 3.85C == 0C
    // p2: nothing (still owes 1.9C)
    // p3: nothing (still owes 0.85C, even though has not won any round)

    // Let p0 withdraw. Contract will send 99% of the 0.75C == 0.7425C.
    let contractBalanceBefore = (yield getContractStatus()).balance;
    yield withdraw(0);
    let contract = yield getContractStatus();
    assert.equal(
        contractBalanceBefore - contract.balance, 0.7425 * CONTRIBUTION_SIZE);
    // last rounded ended with contract.balance == 2.1695. So it should now have (2.1695 - 0.7425C) == 1.427C
    assertWeiCloseTo(contract.balance, 1.427 * CONTRIBUTION_SIZE);
    assert.equal(contract.credits[0], 3.85 * CONTRIBUTION_SIZE);

    // p2 who owes 1.9C contributes 2C and gets back 0.1C.
    yield contribute(2, 2 * CONTRIBUTION_SIZE);
    contractBalanceBefore = (yield getContractStatus()).balance;
    yield withdraw(2);
    contract = yield getContractStatus();
    // Contract retains 1% of the withdrawl, so 0.099 is sent.
    assert.equal(
        contractBalanceBefore - contract.balance, 0.099 * CONTRIBUTION_SIZE);
    // Contract just got 2C - 0.099 == 1.901C more funds. Add that to 1.427C from above.
    assertWeiCloseTo(contract.balance, 3.328 * CONTRIBUTION_SIZE);

    // p3 owes 0.85C. He pays them but cannot retrieve any funds, as he was not in good standing when
    // he was supposed to win.
    yield contribute(3, 0.85 * CONTRIBUTION_SIZE);
    yield utils.assertThrows(withdraw(3));
    contract = yield getContractStatus();
    // Contract has 0.85C (new funds) + 3.328C (existing) ==
    assertWeiCloseTo(contract.balance, 4.178 * CONTRIBUTION_SIZE);
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
        4 * CONTRIBUTION_SIZE / 1000 * NET_REWARDS_RATIO);

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