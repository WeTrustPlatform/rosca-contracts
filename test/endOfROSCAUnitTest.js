"use strict";

let assert = require('chai').assert;
let co = require("co").wrap;
let Promise = require("bluebird");
let utils = require("./utils/utils.js");
let consts = require('./utils/consts')
let roscas
let rosca

contract('end of ROSCA unit test', function(accounts) {
    before(function () {
      consts.setMemberList(accounts)
    })

    beforeEach(co(function* () {
      roscas = yield utils.createETHandERC20Roscas(accounts);
      rosca = yield utils.createEthROSCA()
    }))

    // Runs the ROSCA, contributing funds as required, but never withdrawing - so that
    // the contract ends in a surplus.
    function* runFullRoscaNoWithdraw(rosca) {
      // Get to the start of the ROSCA.
      utils.increaseTime(consts.START_TIME_DELAY );

      for (let round = 0; round < consts.memberCount(); round++) {
        // In each round, have each participant contribute a bit more than
        // they need to. We do that so that money is left over in the contract
        // at the end.
        yield rosca.startRound({from: accounts[0]});

        for (let participant = 0; participant < consts.memberCount(); participant++) {
          yield utils.contribute(rosca, accounts[participant], consts.CONTRIBUTION_SIZE);
        }
        yield rosca.bid(consts.CONTRIBUTION_SIZE * consts.memberCount(), {from: accounts[round]});
        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
      }
    }

    it("checks if endOfROSCARetrieve{Surplus,Fees} retrieve the funds when called in this order + check event",
        co(function* () {
      for (let rosca of [roscas.ethRosca, roscas.erc20Rosca]) {
        let tokenContract = yield rosca.tokenContract.call();
        yield* runFullRoscaNoWithdraw(rosca);
        yield rosca.startRound();  // cleans up the last round
        // foreperson must wait another round before being able to get the surplus
        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

        let contractCredit = yield utils.contractNetCredit(rosca);
        assert.isAbove(contractCredit, 0); // If this fails, there is a bug in the test.

        let forepersonBalanceBefore = yield utils.getBalance(accounts[0], tokenContract);

        let result = yield rosca.endOfROSCARetrieveSurplus({from: accounts[0]});
        let log = result.logs[0]

        assert.equal(log.args.amount, contractCredit,
            "LogForepersonSurplusWithdrawal doesn't display proper amount value");

        let forepersonBalanceAfter = yield utils.getBalance(accounts[0], tokenContract);

        utils.assertEqualUpToGasCosts(forepersonBalanceAfter - forepersonBalanceBefore, contractCredit);

        contractCredit = yield utils.contractNetCredit(rosca);
        assert.equal(contractCredit, 0);

        // Now retrieve fees
        let totalFees = (yield rosca.totalFees.call()).toNumber();
        forepersonBalanceBefore = yield utils.getBalance(accounts[0], tokenContract);
        yield rosca.endOfROSCARetrieveFees({from: accounts[0]});
        forepersonBalanceAfter = yield utils.getBalance(accounts[0], tokenContract);
        utils.assertEqualUpToGasCosts(forepersonBalanceAfter - forepersonBalanceBefore, totalFees);
      }
    }));

    it("checks if endOfROSCARetrieve{Fees, Surplus} retrieve the funds when called in this order", co(function* () {
      yield* runFullRoscaNoWithdraw(rosca);
      yield rosca.startRound();  // cleans up the last round
      // foreperson must wait another round before being able to get the surplus
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

      let totalFees = (yield rosca.totalFees.call()).toNumber();
      let forepersonBalanceBefore = yield utils.getBalance(accounts[0]);
      yield rosca.endOfROSCARetrieveFees({from: accounts[0]});
      let forepersonBalanceAfter = yield utils.getBalance(accounts[0]);
      utils.assertEqualUpToGasCosts(forepersonBalanceAfter - forepersonBalanceBefore, totalFees);

      // Note in this test we use the raw contract balance, as the fees were already collected.
      let contractCredit = yield utils.getBalance(rosca.address);

      forepersonBalanceBefore = yield utils.getBalance(accounts[0]);
      yield rosca.endOfROSCARetrieveSurplus({from: accounts[0]});
      forepersonBalanceAfter = yield utils.getBalance(accounts[0]);

      utils.assertEqualUpToGasCosts(forepersonBalanceAfter - forepersonBalanceBefore, contractCredit);

      contractCredit = yield utils.getBalance(rosca.address);
      assert.equal(contractCredit, 0);
    }));


    it("validates endOfROSCARetrieve{Surplus, Fee} throw if called before clearing out the final round",
        co(function* () {
      yield* runFullRoscaNoWithdraw(rosca);
      // we do not call yield rosca.startRound() here
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

      yield utils.assertThrows(
        rosca.endOfROSCARetrieveSurplus({from: accounts[0]}),
        "expected calling endOfROSCARetrieveSurplus w/o calling startRound() to throw");
      yield utils.assertThrows(
        rosca.endOfROSCARetrieveFees({from: accounts[0]}),
        "expected calling endOfROSCARetrieveSurplus w/o calling startRound() to throw");
    }));

    it("validates endOfROSCARetrieve{Surplus,Fee} throws if called not by the foreperson",
        co(function* () {
      yield* runFullRoscaNoWithdraw(rosca);
      yield rosca.startRound();
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

      yield utils.assertThrows(
        rosca.endOfROSCARetrieveSurplus({from: accounts[1]}));
      yield utils.assertThrows(
        rosca.endOfROSCARetrieveSurplus({from: accounts[9]}));

      yield utils.assertThrows(
        rosca.endOfROSCARetrieveFees({from: accounts[1]}));
      yield utils.assertThrows(
        rosca.endOfROSCARetrieveFees({from: accounts[9]}));
    }));

    it("validates endOfROSCARetrieve{Surplus, Fee} throw if called too early", co(function* () {
      yield* runFullRoscaNoWithdraw(rosca);

      // startRound() has not been called yet.
      yield utils.assertThrows(
          rosca.endOfROSCARetrieveFees({from: accounts[0]}));
      yield rosca.startRound();

      // Show not throw now because fees can be collected right after ROSCA ends.
      yield rosca.endOfROSCARetrieveFees({from: accounts[0]});

      // Foreperson should only be able to retrieve surplus one round after end.
      yield utils.assertThrows(
          rosca.endOfROSCARetrieveSurplus({from: accounts[0]}));
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
      yield rosca.endOfROSCARetrieveSurplus({from: accounts[0]});
    }));
});
