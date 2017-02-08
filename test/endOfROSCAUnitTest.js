"use strict";

let assert = require('chai').assert;
let co = require("co").wrap;
let Promise = require("bluebird");
let utils = require("./utils/utils.js");

contract('end of ROSCA unit test', function(accounts) {
    const START_TIME_DELAY = 86400 + 10;
    const TIME_TO_WAIT_FOR_ROSCA_TO_START = START_TIME_DELAY + 10;
    const ROUND_PERIOD_IN_DAYS = 3;
    const ROUND_PERIOD = ROUND_PERIOD_IN_DAYS * 86400;
    const SERVICE_FEE_IN_THOUSANDTHS = 2;
    // Note accounts[0] is the foreperson, deploying the contract.
    const MEMBER_LIST = [accounts[1], accounts[2], accounts[3]];
    const MEMBER_COUNT = MEMBER_LIST.length + 1;  // foreperson
    const CONTRIBUTION_SIZE = 1e17;

    // Runs the ROSCA, contributing funds as required, but never withdrawing - so that
    // the contract ends in a surplus.
    function* runFullRoscaNoWithdraw(rosca) {
      // Get to the start of the ROSCA.
      utils.increaseTime(TIME_TO_WAIT_FOR_ROSCA_TO_START);

      for (let round = 0; round < MEMBER_COUNT; round++) {
        // In each round, have each participant contribute a bit more than
        // they need to. We do that so that money is left over in the contract
        // at the end.
        yield rosca.startRound({from: accounts[0]});

        for (let participant = 0; participant < MEMBER_COUNT; participant++) {
          yield rosca.contribute({from: accounts[participant], value: CONTRIBUTION_SIZE});
        }
        yield rosca.bid(CONTRIBUTION_SIZE * MEMBER_COUNT, {from: accounts[round]});
        utils.increaseTime(ROUND_PERIOD);
      }
    }

    it("checks if endOfROSCARetrieve{Surplus,Fees} retrieve the funds when called in this order + check event",
        co(function* () {
      let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
          MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
      yield* runFullRoscaNoWithdraw(rosca);
      yield rosca.startRound();  // cleans up the last round
      // foreperson must wait another round before being able to get the surplus
      utils.increaseTime(ROUND_PERIOD);

      let contractCredit = yield utils.contractNetCredit(rosca);
      assert.isAbove(contractCredit, 0); // If this fails, there is a bug in the test.

      let eventFired = false;
      let surplusWithdrawalEvent = rosca.LogForepersonSurplusWithdrawal();  // eslint-disable-line new-cap
      surplusWithdrawalEvent.watch(function(error, log) {
          surplusWithdrawalEvent.stopWatching();
          eventFired = true;
          assert.equal(log.args.user, accounts[0], "LogForepersonSurplusWithdrawal doesn't display proper user value");
          assert.equal(log.args.amount, contractCredit,
              "LogForepersonSurplusWithdrawal doesn't display proper amount value");
      });

      let forepersonBalanceBefore = web3.eth.getBalance(accounts[0]);

      yield rosca.endOfROSCARetrieveSurplus({from: accounts[0]});

      yield Promise.delay(300); // 300ms delay to allow the event to fire properly
      assert.isOk(eventFired, "LogForepersonSurplusWithdrawal event did not fire");


      let forepersonBalanceAfter = web3.eth.getBalance(accounts[0]);

      utils.assertEqualUpToGasCosts(forepersonBalanceAfter - forepersonBalanceBefore, contractCredit);

      contractCredit = yield utils.contractNetCredit(rosca);
      assert.equal(contractCredit, 0);

      let totalFees = (yield rosca.totalFees.call()).toNumber();
      // accounts[9] is defined the fee collector in the contract.
      let feeCollectorBalanceBefore = web3.eth.getBalance(accounts[9]);
      yield rosca.endOfROSCARetrieveFees({from: accounts[9]});
      let feeCollectorBalanceAfter = web3.eth.getBalance(accounts[9]);
      utils.assertEqualUpToGasCosts(feeCollectorBalanceAfter - feeCollectorBalanceBefore, totalFees);
    }));

    it("checks if endOfROSCARetrieve{Fees, Surplus} retrieve the funds when called in this order", co(function* () {
      let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
          MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
      yield* runFullRoscaNoWithdraw(rosca);
      yield rosca.startRound();  // cleans up the last round
      // foreperson must wait another round before being able to get the surplus
      utils.increaseTime(ROUND_PERIOD);

      let totalFees = (yield rosca.totalFees.call()).toNumber();
      // accounts[9] is defined the fee collector in the contract.
      let feeCollectorBalanceBefore = web3.eth.getBalance(accounts[9]);
      yield rosca.endOfROSCARetrieveFees({from: accounts[9]});
      let feeCollectorBalanceAfter = web3.eth.getBalance(accounts[9]);
      utils.assertEqualUpToGasCosts(feeCollectorBalanceAfter - feeCollectorBalanceBefore, totalFees);

      // Note in this test we use the raw contract balance, as the fees were already collected.
      let contractCredit = web3.eth.getBalance(rosca.address).toNumber();

      let forepersonBalanceBefore = web3.eth.getBalance(accounts[0]);
      yield rosca.endOfROSCARetrieveSurplus({from: accounts[0]});
      let forepersonBalanceAfter = web3.eth.getBalance(accounts[0]);

      utils.assertEqualUpToGasCosts(forepersonBalanceAfter - forepersonBalanceBefore, contractCredit);

      contractCredit = web3.eth.getBalance(rosca.address).toNumber();
      assert.equal(contractCredit, 0);
    }));


    it("validates endOfROSCARetrieve{Surplus, Fee} throw if called before clearing out the final round",
        co(function* () {
      let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
          MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
      yield* runFullRoscaNoWithdraw(rosca);
      // we do not call yield rosca.startRound() here
      utils.increaseTime(ROUND_PERIOD);

      yield utils.assertThrows(
        rosca.endOfROSCARetrieveSurplus({from: accounts[0]}),
        "expected calling endOfROSCARetrieveSurplus w/o calling startRound() to throw");
      yield utils.assertThrows(
        rosca.endOfROSCARetrieveFees({from: accounts[9]}),
        "expected calling endOfROSCARetrieveSurplus w/o calling startRound() to throw");
    }));

    it("validates endOfROSCARetrieve{Surplus,Fee} throws if called not by the {foreperson,feeCollector}",
        co(function* () {
      let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
          MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
      yield* runFullRoscaNoWithdraw(rosca);
      yield rosca.startRound();
      utils.increaseTime(ROUND_PERIOD);

      yield utils.assertThrows(
        rosca.endOfROSCARetrieveSurplus({from: accounts[1]}));
      yield utils.assertThrows(
        rosca.endOfROSCARetrieveSurplus({from: accounts[9]}));

      yield utils.assertThrows(
        rosca.endOfROSCARetrieveFees({from: accounts[1]}));
      yield utils.assertThrows(
        rosca.endOfROSCARetrieveFees({from: accounts[0]}));
    }));

    it("validates endOfROSCARetrieve{Surplus, Fee} throw if called too early", co(function* () {
      let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
          MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
      yield* runFullRoscaNoWithdraw(rosca);

      // startRound() has not been called yet.
      yield utils.assertThrows(
          rosca.endOfROSCARetrieveFees({from: accounts[9]}));
      yield rosca.startRound();

      // Show not throw now becaues fees can be collected right after contract ends.
      yield rosca.endOfROSCARetrieveFees({from: accounts[9]});

      // Foreperson should only be able to retrieve one round after end.
      yield utils.assertThrows(
          rosca.endOfROSCARetrieveSurplus({from: accounts[0]}));
      utils.increaseTime(ROUND_PERIOD);
      yield rosca.endOfROSCARetrieveSurplus({from: accounts[0]});
    }));
});
