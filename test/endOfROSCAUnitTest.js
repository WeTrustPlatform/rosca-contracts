"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('end of ROSCA unit test', function(accounts) {
    const ROSCA_START_TIME_DELAY = 86400 + 10;
    const TIME_TO_WAIT_FOR_ROSCA_TO_START = ROSCA_START_TIME_DELAY + 10;
    const ROUND_PERIOD_IN_DAYS = 3;
    // Note accounts[0] is the foreperson, deploying the contract.
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const MEMBER_COUNT = MEMBER_LIST.length + 1;  // foreperson
    const CONTRIBUTION_SIZE = 1e16;

    function createROSCA() {
      const SERVICE_FEE_IN_THOUSANDTHS = 2;
      
      let latestBlock = web3.eth.getBlock("latest");
      let blockTime = latestBlock.timestamp;
      return ROSCATest.new(
          ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, blockTime + ROSCA_START_TIME_DELAY, MEMBER_LIST, 
          SERVICE_FEE_IN_THOUSANDTHS);
      
    }
    
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
        utils.increaseTime(ROUND_PERIOD_IN_DAYS * 86400);
      }
    }
    
    it("checks if endROSCARetrieveFunds retrieves the funds when used in a valid way", co(function*() {
      let rosca = yield createROSCA();
      yield* runFullRoscaNoWithdraw(rosca);
      yield rosca.startRound();  // cleans up the last round
      // foreperson must wait another round before being able to get the surplus, to give
      // time to participants to withdraw their own funds.
      utils.increaseTime(ROUND_PERIOD_IN_DAYS * 86400);
      
      let forepersonBalanceBefore = web3.eth.getBalance(accounts[0]).toNumber();
      let contractCredit = web3.eth.getBalance(rosca.address).toNumber();
      assert.isAbove(contractCredit, 0); // If this fails, there is a bug in the test.

      yield rosca.endROSCARetrieveFunds({from: accounts[0]});

      let forepersonBalanceAfter = web3.eth.getBalance(accounts[0]).toNumber();
      // It's not straightforward to execute the exact new credit that the foreperson should have.
      // Instead we verify that the foreperson received funds, and the contract does not have any
      // funds anymore.
      assert.isAbove(forepersonBalanceAfter, forepersonBalanceBefore);
      contractCredit = web3.eth.getBalance(rosca.address).toNumber();
      assert.equal(contractCredit, 0);
    }));

    it("validates endROSCARetrieveFunds throws if called before clearing out the final round", co(function*() {
      let rosca = yield createROSCA();
      yield* runFullRoscaNoWithdraw(rosca);
      // we do not call yield rosca.startRound() here
      utils.increaseTime(ROUND_PERIOD_IN_DAYS * 86400);
      
      yield utils.assertThrows(
        rosca.endROSCARetrieveFunds({from: accounts[0]}),
        "expected calling endROSCARetrieveFunds w/o calling startRound() to throw");
    }));

    it("validates endROSCARetrieveFunds throws if called not by the foreperson", co(function*() {
      let rosca = yield createROSCA();
      yield* runFullRoscaNoWithdraw(rosca);
      yield rosca.startRound();
      utils.increaseTime(ROUND_PERIOD_IN_DAYS * 86400);
      
      yield utils.assertThrows(
        rosca.endROSCARetrieveFunds({from: accounts[1]}),
          "expected calling endROSCARetrieveFunds before ROSCDA end time + one round to throw");
    }));

    it("validates endROSCARetrieveFunds throws if called too early", co(function*() {
      let rosca = yield createROSCA();
      yield* runFullRoscaNoWithdraw(rosca);
      yield rosca.startRound();  
      // We're not waiting another round this time.
      
      yield utils.assertThrows(
          rosca.endROSCARetrieveFunds({from: accounts[0]}),
          "expected calling endROSCARetrieveFunds before ROSCDA end time");
    }));
});
