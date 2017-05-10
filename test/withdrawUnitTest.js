"use strict";

// This test checks much of the functionality only against ETH utils.
// It tests against ERC20 ROSCAs only where relevant.

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper')
  
let ethRosca;
let erc20Rosca;

contract('ROSCA withdraw Unit Test', function(accounts) {
    before(function() {
      consts.setMemberList(accounts);
    });

    beforeEach(co(function* () {
      ethRosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA()))
      erc20Rosca = new ROSCAHelper(accounts, (yield utils.createERC20ROSCA(accounts)))
    }));

    it("Throws when calling withdraw from a non-member", co(function* () {
        yield Promise.all([
            ethRosca.contribute(0, consts.CONTRIBUTION_SIZE),
            ethRosca.contribute(1, consts.CONTRIBUTION_SIZE),
            ethRosca.contribute(2, consts.CONTRIBUTION_SIZE),
            ethRosca.contribute(3, consts.CONTRIBUTION_SIZE),
        ]);

        yield Promise.all([
            ethRosca.withdraw(0),
            ethRosca.withdraw(1),
            ethRosca.withdraw(2),
            ethRosca.withdraw(3),
        ]);

        yield utils.assertThrows(ethRosca.withdraw(4),
            "expected calling withdraw from a non-member to throw");
    }));

    it("Watches for event LogFundsWithdrawal()", co(function* () {
      for (let rosca of [ethRosca, erc20Rosca]) {
        const ACTUAL_CONTRIBUTION = consts.CONTRIBUTION_SIZE * 0.8;

        yield rosca.contribute(0, ACTUAL_CONTRIBUTION);

        let result = yield rosca.withdraw(0);
        let log = result.logs[0];

        assert.equal(log.args.user, accounts[0], "LogContributionMade doesn't display proper user value");
        assert.equal(log.args.amount.toNumber(), ACTUAL_CONTRIBUTION,
            "LogContributionMade doesn't display proper amount value");
      }
    }));

    it("Throws when calling withdraw when totalDebit > totalCredit", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            ethRosca.startRound(),
            ethRosca.contribute(2, consts.CONTRIBUTION_SIZE * 0.8),
        ]);

        yield utils.assertThrows(ethRosca.withdraw(2),
            "expected calling withdraw when totalDebit is greater than totalCredit to throw");
    }));

    it("fires LogCannotWithdrawFully when contract balance is less than what the user is entitled to", co(function* () {
      for (let rosca of [ethRosca, erc20Rosca]) {
        let tokenContract = yield rosca.tokenContract();
        utils.increaseTime(consts.START_TIME_DELAY);
        yield rosca.startRound();
        yield rosca.contribute(2, consts.CONTRIBUTION_SIZE); // contract's balance = consts.CONTRIBUTION_SIZE
        yield rosca.bid(2, consts.defaultPot());

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound(); // 2nd Member will be entitled to consts.defaultPot() which is greater than consts.CONTRIBUTION_SIZE

        let creditBefore = yield rosca.userCredit(2);
        let memberBalanceBefore = yield rosca.getBalance(2, tokenContract);

        // We expect two events: LogCannotWithdrawFully that specifies how much the user was credited for,
        // and the regular LogWithdrawalEvent from which we learn how much was actually withdrawn.

        let result = yield rosca.withdraw(2);
        let withdrewAmount = result.logs[1].args.amount;

        assert.isDefined(result.logs[0]);// checks if LogCannotWithdrawFully fires properly

        let creditAfter = yield rosca.userCredit(2);
        let memberBalanceAfter = yield rosca.getBalance(2, tokenContract);
        let contractCredit = yield rosca.contractNetCredit();

        assert.equal(contractCredit, 0);
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter, creditBefore - withdrewAmount);
      }
    }));

    it("checks withdraw when the contract balance is more than what the user is entitled to", co(function* () {
      for (let rosca of [ethRosca, erc20Rosca]) {
        let tokenContract = yield rosca.tokenContract();
        utils.increaseTime(consts.START_TIME_DELAY);
        yield rosca.startRound();
        yield rosca.contribute(2, consts.CONTRIBUTION_SIZE);
        yield rosca.contribute(1, consts.CONTRIBUTION_SIZE);
        yield rosca.contribute(0, consts.CONTRIBUTION_SIZE);
        yield rosca.contribute(3, consts.CONTRIBUTION_SIZE * 3);
        yield rosca.bid(2, consts.defaultPot());

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        let memberBalanceBefore = yield rosca.getBalance(2, tokenContract);

        yield rosca.withdraw(2);

        let creditAfter = yield rosca.userCredit(2);
        let currentRound = yield rosca.getCurrentRosca().currentRound.call();
        let memberBalanceAfter = yield rosca.getBalance(2, tokenContract);
        let contractCredit = yield rosca.contractNetCredit();

        assert.isAbove(contractCredit, 0); // contract should have some balance leftover after the withdraw
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter, currentRound * consts.CONTRIBUTION_SIZE, "withdraw doesn't send the right amount");
      }
    }));

    it("withdraw when contract can't send what the user is entitled while totalDiscount != 0", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            ethRosca.startRound(),
            ethRosca.contribute(2, consts.CONTRIBUTION_SIZE),
            ethRosca.contribute(1, consts.CONTRIBUTION_SIZE),
            // to make sure contract's balance is less than winning bid
            ethRosca.contribute(3, consts.CONTRIBUTION_SIZE * 0.3),
        ]);

        yield ethRosca.bid(2, consts.defaultPot() * 0.80);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield ethRosca.startRound();

        let creditBefore = yield ethRosca.userCredit(2);
        let memberBalanceBefore = yield ethRosca.getBalance(2);

        // We expect two events: LogCannotWithdrawFully that specifies how much the user was credited for,
        // and the regular LogWithdrawalEvent from which we learn how much was actually withdrawn.

        let result = yield ethRosca.withdraw(2);

        let withdrewAmount = result.logs[1].args.amount;
        assert.isDefined(result.logs[0]);// checks if LogCannotWithdrawFully fires properly

        let creditAfter = yield ethRosca.userCredit(2);
        let memberBalanceAfter = yield ethRosca.getBalance(2);
        let contractCredit = yield ethRosca.contractNetCredit();

        assert.equal(contractCredit, 0);
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter, creditBefore - withdrewAmount);
    }));

    it("withdraw when the contract can send what the user is entitled to while totalDiscount != 0", co(function* () {
        const BID_TO_PLACE = consts.defaultPot() * 0.80;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            ethRosca.startRound(),
            ethRosca.contribute(2, consts.CONTRIBUTION_SIZE),
            ethRosca.contribute(1, consts.CONTRIBUTION_SIZE),
            ethRosca.contribute(3, consts.CONTRIBUTION_SIZE),
            ethRosca.contribute(0, consts.CONTRIBUTION_SIZE),
        ]);
        yield ethRosca.bid(2, BID_TO_PLACE);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield ethRosca.startRound();

        let memberBalanceBefore = yield ethRosca.getBalance(2);

        yield ethRosca.withdraw(2);

        let creditAfter = yield ethRosca.userCredit(2);
        let currentRound = yield ethRosca.getCurrentRosca().currentRound.call();
        let totalDiscount = consts.defaultPot() - BID_TO_PLACE;
        let expectedCredit = (currentRound * consts.CONTRIBUTION_SIZE)
          - utils.afterFee(totalDiscount / consts.memberCount(), consts.SERVICE_FEE_IN_THOUSANDTHS);

        let memberBalanceAfter = yield ethRosca.getBalance(2);
        let contractCredit = yield ethRosca.getBalance(ethRosca.address());

        assert.isAbove(contractCredit, 0); // If this fails, there is a bug in the test.
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter, expectedCredit, "withdraw doesn't send the right amount");
    }));

    it("does not allow delinquent people to withdraw even after winning, unless they pay their dues",
            co(function* () {
         // In this 2-person rosca test, both p0 and p1 are delinquent and pay only 0.5C each in the first round.
         // We check that the winner cannot withdraw their money in the next round, but once they pay up, they can.
         let members = [accounts[1]];
         let ethRosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA(members)))

         utils.increaseTime(consts.START_TIME_DELAY);
         yield Promise.all([
             ethRosca.startRound(),
             ethRosca.contribute(1, 0.5 * consts.CONTRIBUTION_SIZE),
             ethRosca.contribute(0, 0.5 * consts.CONTRIBUTION_SIZE),
         ]);

         utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
         let result = yield ethRosca.startRound();
         let log = result.logs[0];

         let winnerAddress = log.args.winnerAddress;

         // Throws when delinquent, does not throw otherwise.
         yield utils.assertThrows(ethRosca.withdraw(winnerAddress));
         yield ethRosca.contribute(winnerAddress, 1.5 * consts.CONTRIBUTION_SIZE);
         yield ethRosca.withdraw(winnerAddress);
    }));

    it("delinquent cannot withdraw before end of rosca, can withdraw up to amount contributed after the end",
        co(function* () {
        // In this 2-person rosca test, both p0 and p1 are delinquent and pay only 0.5C each in the first round.
        // We check that the winner cannot withdraw their money until rosca has ended.
        // After rosca ended, we check that the winner can only withdraw the amount he contributed.
        let members = [accounts[1]];
        let ethRosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA(members)))

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            ethRosca.startRound(),
            ethRosca.contribute(1, 0.5 * consts.CONTRIBUTION_SIZE),
            ethRosca.contribute(0, 0.5 * consts.CONTRIBUTION_SIZE),
        ]);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        let result = yield ethRosca.startRound();
        let log = result.logs[0];

        let winnerAddress = log.args.winnerAddress;

        // Throws when delinquent, does not throw otherwise.
        yield utils.assertThrows(ethRosca.withdraw(winnerAddress));

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield ethRosca.startRound(); // endOfRosca = true;

        let contractBalanceBefore = web3.eth.getBalance(ethRosca.address());
        yield ethRosca.withdraw(winnerAddress);
        let contractBalanceAfter = web3.eth.getBalance(ethRosca.address());

        assert.equal(contractBalanceBefore - contractBalanceAfter, 0.5 * consts.CONTRIBUTION_SIZE);
    }));
});
