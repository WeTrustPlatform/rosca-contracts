"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let ethRoscaHelper;
let erc20RoscaHelper;

contract('Escape Hatch unit test', function(accounts) {
  before(function() {
    consts.setMemberList(accounts);
  });

  beforeEach(co(function* () {
    ethRoscaHelper = new ROSCAHelper(accounts, (yield utils.createEthROSCA()));
    erc20RoscaHelper = new ROSCAHelper(accounts, (yield utils.createERC20ROSCA(accounts)));
  }));

  let ESCAPE_HATCH_ENABLER;

  // Runs the ROSCA 2 rounds. Everyone contributes, no one withdraws.
  function* runRoscUpToAPoint(rosca) {
    // Get to the start of the ROSCA.
    utils.increaseTime(consts.START_TIME_DELAY + consts.ROUND_PERIOD_IN_SECS);

    for (let round = 0; round < 2; round++) {
      for (let participant = 0; participant < consts.memberCount(); participant++) {
        yield rosca.contribute(participant, consts.CONTRIBUTION_SIZE);
      }
      yield rosca.startRound();
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    }
  }

  it("checks that only Invoker can enable the escape hatch", co(function* () {
    // For some reason can't make the beforeXXX() functions to work, so doing it the ugly
    // way of setting this var in the first test.
    ESCAPE_HATCH_ENABLER = yield (yield ROSCATest.deployed()).ESCAPE_HATCH_ENABLER.call();

    yield* runRoscUpToAPoint(ethRoscaHelper);
    yield utils.assertRevert(ethRoscaHelper.enableEscapeHatch(0));  // foreperson
    yield utils.assertRevert(ethRoscaHelper.enableEscapeHatch(3));  // member
    // Doesn't throw.
    yield ethRoscaHelper.enableEscapeHatch(ESCAPE_HATCH_ENABLER);  // member
  }));

  it("checks that only foreperson can activate the escape hatch and that too only when enabled", co(function* () {
    yield* runRoscUpToAPoint(ethRoscaHelper);
    yield utils.assertRevert(ethRoscaHelper.activateEscapeHatch(3));  // member
    yield utils.assertRevert(ethRoscaHelper.activateEscapeHatch(ESCAPE_HATCH_ENABLER));
    // foreperson can't activate either, as escape hatch isn't enabled.
    yield utils.assertRevert(ethRoscaHelper.activateEscapeHatch(0));

    // Enable. Now only the foreperson should be able to activate.
    yield ethRoscaHelper.enableEscapeHatch(ESCAPE_HATCH_ENABLER);  // escape hatch enabler
    yield utils.assertRevert(ethRoscaHelper.activateEscapeHatch(3));  // member
    yield utils.assertRevert(ethRoscaHelper.activateEscapeHatch(ESCAPE_HATCH_ENABLER));
    yield ethRoscaHelper.activateEscapeHatch(0);  // does not throw
  }));

  it("checks that when escape hatch is enabled but not activated, contribute and withdraw still work", co(function* () {
    yield* runRoscUpToAPoint(ethRoscaHelper);
    yield ethRoscaHelper.enableEscapeHatch(ESCAPE_HATCH_ENABLER);  // escape hatch enabler

    yield ethRoscaHelper.contribute(1, consts.CONTRIBUTION_SIZE * 7);
    yield ethRoscaHelper.withdraw(1);
  }));

  it("checks that once escape hatch is activated, contribute and withdraw throw", co(function* () {
    yield* runRoscUpToAPoint(ethRoscaHelper);
    yield ethRoscaHelper.enableEscapeHatch(ESCAPE_HATCH_ENABLER);  // escape hatch enabler
    yield ethRoscaHelper.activateEscapeHatch(0);

    yield utils.assertRevert(ethRoscaHelper.contribute(1, consts.CONTRIBUTION_SIZE * 7));
    yield utils.assertRevert(ethRoscaHelper.withdraw(1));
  }));

  it("checks that emergencyWithdrawal can only be called when escape hatch is enabled and active, and that " +
     "too only by foreperson", co(function* () {
    for (let roscaHelper of [ethRoscaHelper, erc20RoscaHelper]) {
      let tokenContract = yield roscaHelper.tokenContract();
      yield* runRoscUpToAPoint(roscaHelper);
      utils.assertRevert(roscaHelper.emergencyWithdrawal(0));  // not enabled and active
      yield roscaHelper.enableEscapeHatch(ESCAPE_HATCH_ENABLER);
      utils.assertRevert(roscaHelper.emergencyWithdrawal(0));  // not active
      yield roscaHelper.activateEscapeHatch(0);
      utils.assertRevert(roscaHelper.emergencyWithdrawal(ESCAPE_HATCH_ENABLER));  // not by foreperson
      utils.assertRevert(roscaHelper.emergencyWithdrawal(1));  // not by foreperson

      let forepersonBalanceBefore = yield roscaHelper.getBalance(0, tokenContract);
      yield roscaHelper.emergencyWithdrawal(0);  // not by foreperson
      let forepersonBalanceAfter = yield roscaHelper.getBalance(0, tokenContract);
      assert.isAbove(forepersonBalanceAfter, forepersonBalanceBefore);
    }
  }));
});
