"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let ROSCATest = artifacts.require('ROSCATest.sol');

contract('Escape Hatch unit test', function(accounts) {
  const START_TIME_DELAY = 86400 + 10;
  const TIME_TO_WAIT_FOR_ROSCA_TO_START = START_TIME_DELAY + 10;
  const ROUND_PERIOD_IN_SECS = 100;
  const SERVICE_FEE_IN_THOUSANDTHS = 2;
  // Note accounts[0] is the foreperson, deploying the contract.
  const MEMBER_LIST = [accounts[1], accounts[2], accounts[3]];
  const MEMBER_COUNT = MEMBER_LIST.length + 1;  // foreperson
  const CONTRIBUTION_SIZE = 1e16;
  let ESCAPE_HATCH_ENABLER;

  let createETHandERC20Roscas = co(function* () {
    let ethRosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
        MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
    let erc20Rosca = yield utils.createERC20ROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
        MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS, accounts);
    return {ethRosca: ethRosca, erc20Rosca: erc20Rosca};
  });

  // Runs the ROSCA 2 rounds. Everyone contributes, no one withdraws.
  function* runRoscUpToAPoint(rosca) {
    // Get to the start of the ROSCA.
    utils.increaseTime(TIME_TO_WAIT_FOR_ROSCA_TO_START);

    for (let round = 0; round < 2; round++) {
      yield rosca.startRound({from: accounts[0]});

      for (let participant = 0; participant < MEMBER_COUNT; participant++) {
        yield utils.contribute(rosca, accounts[participant], CONTRIBUTION_SIZE);
      }
      utils.increaseTime(ROUND_PERIOD_IN_SECS);
    }
  }

  it("checks that only Invoker can enable the escape hatch", co(function* () {
    // For some reason can't make the beforeXXX() functions to work, so doing it the ugly
    // way of setting this var in the first test.
    ESCAPE_HATCH_ENABLER = yield (yield ROSCATest.deployed()).ESCAPE_HATCH_ENABLER.call();

    let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
        MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
    yield* runRoscUpToAPoint(rosca);
    yield utils.assertThrows(rosca.enableEscapeHatch({from: accounts[0]}));  // foreperson
    yield utils.assertThrows(rosca.enableEscapeHatch({from: accounts[3]}));  // member
    // Doesn't throw.
    yield rosca.enableEscapeHatch({from: ESCAPE_HATCH_ENABLER});  // member
  }));

  it("checks that only foreperson can activate the escape hatch and that too only when enabled", co(function* () {
    let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
        MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
    yield* runRoscUpToAPoint(rosca);
    yield utils.assertThrows(rosca.activateEscapeHatch({from: accounts[3]}));  // member
    yield utils.assertThrows(rosca.activateEscapeHatch({from: ESCAPE_HATCH_ENABLER}));
    // foreperson can't activate either, as escape hatch isn't enabled.
    yield utils.assertThrows(rosca.activateEscapeHatch({from: accounts[0]}));

    // Enable. Now only the foreperson should be able to activate.
    yield rosca.enableEscapeHatch({from: ESCAPE_HATCH_ENABLER});  // escape hatch enabler
    yield utils.assertThrows(rosca.activateEscapeHatch({from: accounts[3]}));  // member
    yield utils.assertThrows(rosca.activateEscapeHatch({from: ESCAPE_HATCH_ENABLER}));
    yield rosca.activateEscapeHatch({from: accounts[0]});  // does not throw
  }));

  it("checks that when escape hatch is enabled but not activated, contribute and withdraw still work", co(function* () {
    let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
        MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
    yield* runRoscUpToAPoint(rosca);
    yield rosca.enableEscapeHatch({from: ESCAPE_HATCH_ENABLER});  // escape hatch enabler

    yield rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE * 7});
    yield rosca.withdraw({from: accounts[1]});
  }));

  it("checks that once escape hatch is activated, contribute and withdraw throw", co(function* () {
    let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
        MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);
    yield* runRoscUpToAPoint(rosca);
    yield rosca.enableEscapeHatch({from: ESCAPE_HATCH_ENABLER});  // escape hatch enabler
    yield rosca.activateEscapeHatch({from: accounts[0]});

    yield utils.assertThrows(rosca.contribute(CONTRIBUTION_SIZE* 7, {from: accounts[1]}));
    yield utils.assertThrows(rosca.withdraw({from: accounts[1]}));
  }));

  it("checks that emergencyWithdrawal can only be called when escape hatch is enabled and active, and that " +
     "too only by foreperson", co(function* () {
    let roscas = yield createETHandERC20Roscas();
    for (let rosca of [roscas.ethRosca, roscas.erc20Rosca]) {
      let tokenContract = yield rosca.tokenContract.call();
      yield* runRoscUpToAPoint(rosca);
      utils.assertThrows(rosca.emergencyWithdrawal({from: accounts[0]}));  // not enabled and active
      yield rosca.enableEscapeHatch({from: ESCAPE_HATCH_ENABLER});
      utils.assertThrows(rosca.emergencyWithdrawal({from: accounts[0]}));  // not active
      yield rosca.activateEscapeHatch({from: accounts[0]});
      utils.assertThrows(rosca.emergencyWithdrawal({from: ESCAPE_HATCH_ENABLER}));  // not by foreperson
      utils.assertThrows(rosca.emergencyWithdrawal({from: accounts[1]}));  // not by foreperson

      let forepersonBalanceBefore = yield utils.getBalance(accounts[0], tokenContract);
      yield rosca.emergencyWithdrawal({from: accounts[0]});  // not by foreperson
      let forepersonBalanceAfter = yield utils.getBalance(accounts[0], tokenContract);
      assert.isAbove(forepersonBalanceAfter, forepersonBalanceBefore);
    }
  }));
});
