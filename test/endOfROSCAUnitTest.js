"use strict";

let assert = require('chai').assert;
let co = require("co").wrap;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let ethRoscaHelper;
let erc20RoscaHelper;

contract('end of ROSCA unit test', function(accounts) {
    before(function() {
      consts.setMemberList(accounts);
    });

    beforeEach(co(function* () {
      ethRoscaHelper = new ROSCAHelper(accounts, (yield utils.createEthROSCA()));
      erc20RoscaHelper = new ROSCAHelper(accounts, (yield utils.createERC20ROSCA(accounts)));
    }));

    // Runs the ROSCA, contributing funds as required, but never withdrawing - so that
    // the contract ends in a surplus.
    function* runFullRoscaNoWithdraw(rosca) {
      // Get to the start of the ROSCA.
      utils.increaseTime(consts.START_TIME_DELAY + consts.ROUND_PERIOD_IN_SECS);

      for (let round = 1; round < consts.memberCount(); round++) {
        // In each round, have each participant contribute a bit more than
        // they need to. We do that so that money is left over in the contract
        // at the end.
        for (let participant = 0; participant < consts.memberCount(); participant++) {
          yield rosca.contribute(participant, consts.CONTRIBUTION_SIZE);
        }
        yield rosca.bid(round, consts.defaultPot());

        yield rosca.startRound();

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
      }
    }

    it("checks if endOfROSCARetrieve{Surplus,Fees} retrieve the funds when called in this order + check event",
        co(function* () {
      for (let roscaHelper of [ethRoscaHelper, erc20RoscaHelper]) {
        let tokenContract = yield roscaHelper.tokenContract();
        yield* runFullRoscaNoWithdraw(roscaHelper);
        yield roscaHelper.startRound();  // cleans up the last round
        // foreperson must wait another round before being able to get the surplus
        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

        let contractCredit = yield roscaHelper.contractNetCredit();
        assert.isAbove(contractCredit, 0); // If this fails, there is a bug in the test.

        let forepersonBalanceBefore = yield roscaHelper.getBalance(0, tokenContract);

        let result = yield roscaHelper.endOfROSCARetrieveSurplus(0);
        let log = result.logs[0];

        assert.equal(log.args.amount, contractCredit,
            "LogForepersonSurplusWithdrawal doesn't display proper amount value");

        let forepersonBalanceAfter = yield roscaHelper.getBalance(0, tokenContract);

        utils.assertEqualUpToGasCosts(forepersonBalanceAfter - forepersonBalanceBefore, contractCredit);

        contractCredit = yield roscaHelper.contractNetCredit();
        assert.equal(contractCredit, 0);

        // Now retrieve fees
        let totalFees = yield roscaHelper.totalFees();
        forepersonBalanceBefore = yield roscaHelper.getBalance(0, tokenContract);
        yield roscaHelper.endOfROSCARetrieveFees(0);
        forepersonBalanceAfter = yield roscaHelper.getBalance(0, tokenContract);
        utils.assertEqualUpToGasCosts(forepersonBalanceAfter - forepersonBalanceBefore, totalFees);
      }
    }));

    it("checks if endOfROSCARetrieve{Fees, Surplus} retrieve the funds when called in this order", co(function* () {
      yield runFullRoscaNoWithdraw(ethRoscaHelper);
      yield ethRoscaHelper.startRound();  // cleans up the last round

      // foreperson must wait another round before being able to get the surplus
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
      let totalFees = yield ethRoscaHelper.totalFees();
      let forepersonBalanceBefore = yield ethRoscaHelper.getBalance(0);
      yield ethRoscaHelper.endOfROSCARetrieveFees(0);
      let forepersonBalanceAfter = yield ethRoscaHelper.getBalance(0);

      utils.assertEqualUpToGasCosts(forepersonBalanceAfter - forepersonBalanceBefore, totalFees);

      // Note in this test we use the raw contract balance, as the fees were already collected.
      let contractCredit = yield ethRoscaHelper.getBalance(ethRoscaHelper.address());


      forepersonBalanceBefore = yield ethRoscaHelper.getBalance(0);
      yield ethRoscaHelper.endOfROSCARetrieveSurplus(0);
      forepersonBalanceAfter = yield ethRoscaHelper.getBalance(0);

      utils.assertEqualUpToGasCosts(forepersonBalanceAfter - forepersonBalanceBefore, contractCredit);

      contractCredit = yield ethRoscaHelper.getBalance(ethRoscaHelper.address());
      assert.equal(contractCredit, 0);
    }));


    it("validates endOfROSCARetrieve{Surplus, Fee} throw if called before clearing out the final round",
        co(function* () {
      yield* runFullRoscaNoWithdraw(ethRoscaHelper);
      // we do not call yield rosca.startRound() here
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

      yield utils.assertRevert(
        ethRoscaHelper.endOfROSCARetrieveSurplus(0),
        "expected calling endOfROSCARetrieveSurplus w/o calling startRound() to throw");
      yield utils.assertRevert(
        ethRoscaHelper.endOfROSCARetrieveFees(0),
        "expected calling endOfROSCARetrieveSurplus w/o calling startRound() to throw");
    }));

    it("validates endOfROSCARetrieve{Surplus,Fee} throws if called not by the foreperson",
        co(function* () {
      yield* runFullRoscaNoWithdraw(ethRoscaHelper);
      yield ethRoscaHelper.startRound();
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

      yield utils.assertRevert(
        ethRoscaHelper.endOfROSCARetrieveSurplus(1));
      yield utils.assertRevert(
        ethRoscaHelper.endOfROSCARetrieveSurplus(9));

      yield utils.assertRevert(
        ethRoscaHelper.endOfROSCARetrieveFees(1));
      yield utils.assertRevert(
        ethRoscaHelper.endOfROSCARetrieveFees(9));
    }));

    it("validates endOfROSCARetrieve{Surplus, Fee} throw if called too early", co(function* () {
      yield* runFullRoscaNoWithdraw(ethRoscaHelper);

      // startRound() has not been called yet.
      yield utils.assertRevert(
          ethRoscaHelper.endOfROSCARetrieveFees(0));
      yield ethRoscaHelper.startRound();

      // Show not throw now because fees can be collected right after ROSCA ends.
      yield ethRoscaHelper.endOfROSCARetrieveFees(0);

      // Foreperson should only be able to retrieve surplus one round after end.
      yield utils.assertRevert(
          ethRoscaHelper.endOfROSCARetrieveSurplus(0));
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
      yield ethRoscaHelper.endOfROSCARetrieveSurplus(0);
    }));
});
