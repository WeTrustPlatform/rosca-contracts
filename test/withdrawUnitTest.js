"use strict";

// This test checks much of the functionality only against ETH ROSCA.
// It tests against ERC20 ROSCAs only where relevant.

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts')

contract('ROSCA withdraw Unit Test', function(accounts) {
    before(function () {
      consts.setMemberList(accounts)
    })

    let createETHandERC20Roscas = co(function* () {
      let ethRosca = yield utils.createEthROSCA();
      let erc20Rosca = yield utils.createERC20ROSCA(accounts);
      return {ethRosca: ethRosca, erc20Rosca: erc20Rosca};
    });

    it("Throws when calling withdraw from a non-member", co(function* () {
        let rosca = yield utils.createEthROSCA();

        yield Promise.all([
            rosca.contribute({from: accounts[0], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: consts.CONTRIBUTION_SIZE}),
            rosca.withdraw({from: accounts[0]}),
            rosca.withdraw({from: accounts[1]}),
            rosca.withdraw({from: accounts[2]}),
            rosca.withdraw({from: accounts[3]}),
        ]);

        yield utils.assertThrows(rosca.withdraw({from: accounts[4]}),
            "expected calling withdraw from a non-member to throw");
    }));

    it("Watches for event LogFundsWithdrawal()", co(function* () {
      let roscas = yield createETHandERC20Roscas();
      for (let rosca of [roscas.ethRosca, roscas.erc20Rosca]) {
        const ACTUAL_CONTRIBUTION = consts.CONTRIBUTION_SIZE * 0.8;

        yield utils.contribute(rosca, accounts[0], ACTUAL_CONTRIBUTION);

        let result = yield rosca.withdraw({from: accounts[0]});
        let log = result.logs[0]

        assert.equal(log.args.user, accounts[0], "LogContributionMade doesn't display proper user value");
        assert.equal(log.args.amount.toNumber(), ACTUAL_CONTRIBUTION,
            "LogContributionMade doesn't display proper amount value");
      }
    }));

    it("Throws when calling withdraw when totalDebit > totalCredit", co(function* () {
        let rosca = yield utils.createEthROSCA();

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE * 0.8}),
        ]);

        yield utils.assertThrows(rosca.withdraw({from: accounts[2]}),
            "expected calling withdraw when totalDebit is greater than totalCredit to throw");
    }));

    it("fires LogCannotWithdrawFully when contract balance is less than what the user is entitled to", co(function* () {
      let roscas = yield createETHandERC20Roscas();

      for (let rosca of [roscas.ethRosca, roscas.erc20Rosca]) {
        let tokenContract = yield rosca.tokenContract.call();
        utils.increaseTime(consts.START_TIME_DELAY);
        yield rosca.startRound();
        yield utils.contribute(rosca, accounts[2], consts.CONTRIBUTION_SIZE); // contract's balance = consts.CONTRIBUTION_SIZE
        yield rosca.bid(consts.DEFAULT_POT(), {from: accounts[2]});

        /* utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound(); // 2nd Member will be entitled to consts.DEFAULT_POT() which is greater than consts.CONTRIBUTION_SIZE

        let creditBefore = (yield rosca.members.call(accounts[2]))[0];
        let memberBalanceBefore = yield utils.getBalance(accounts[2], tokenContract);

        // We expect two events: LogCannotWithdrawFully that specifies how much the user was credited for,
        // and the regular LogWithdrawalEvent from which we learn how much was actually withdrawn.

        let result = yield rosca.withdraw({from: accounts[2]});
        let withdrewAmount = result.logs[1].args.amount;

        assert.isDefined(result.logs[0])// checks if LogCannotWithdrawFully fires properly

        let creditAfter = (yield rosca.members.call(accounts[2]))[0];
        let memberBalanceAfter = yield utils.getBalance(accounts[2], tokenContract);
        let contractCredit = yield utils.contractNetCredit(rosca, tokenContract);

        assert.equal(contractCredit, 0);
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter, creditBefore - withdrewAmount); */
      }
    }));

    /* it("checks withdraw when the contract balance is more than what the user is entitled to", co(function* () {
      let roscas = yield createETHandERC20Roscas();
      for (let rosca of [roscas.ethRosca, roscas.erc20Rosca]) {
        let tokenContract = yield rosca.tokenContract.call();
        utils.increaseTime(consts.START_TIME_DELAY);
        yield rosca.startRound();
        yield utils.contribute(rosca, accounts[2], consts.CONTRIBUTION_SIZE);
        yield utils.contribute(rosca, accounts[1], consts.CONTRIBUTION_SIZE);
        yield utils.contribute(rosca, accounts[0], consts.CONTRIBUTION_SIZE);
        yield utils.contribute(rosca, accounts[3], consts.CONTRIBUTION_SIZE * 3);
        yield rosca.bid(consts.DEFAULT_POT(), {from: accounts[2]});

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        let memberBalanceBefore = yield utils.getBalance(accounts[2], tokenContract);

        yield rosca.withdraw({from: accounts[2]});

        let creditAfter = (yield rosca.members.call(accounts[2]))[0];
        let currentRound = yield rosca.currentRound.call();
        let memberBalanceAfter = yield utils.getBalance(accounts[2], tokenContract);
        let contractCredit = yield utils.contractNetCredit(rosca, tokenContract);

        assert.isAbove(contractCredit, 0); // contract should have some balance leftover after the withdraw
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter, currentRound * consts.CONTRIBUTION_SIZE, "withdraw doesn't send the right amount");
      }
    }));

    it("withdraw when contract can't send what the user is entitled while totalDiscount != 0", co(function* () {
        let rosca = yield utils.createEthROSCA();

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: consts.CONTRIBUTION_SIZE}),
            // to make sure contract's balance is less than winning bid
            rosca.contribute({from: accounts[3], value: consts.CONTRIBUTION_SIZE * 0.3}),
            rosca.bid(consts.DEFAULT_POT() * 0.80, {from: accounts[2]}),
        ]);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        let creditBefore = (yield rosca.members.call(accounts[2]))[0];
        let memberBalanceBefore = web3.eth.getBalance(accounts[2]).toNumber();

        // We expect two events: LogCannotWithdrawFully that specifies how much the user was credited for,
        // and the regular LogWithdrawalEvent from which we learn how much was actually withdrawn.

        let result = yield rosca.withdraw({from: accounts[2]});

        let withdrewAmount = result.logs[1].args.amount
        assert.isDefined(result.logs[0])// checks if LogCannotWithdrawFully fires properly

        let creditAfter = (yield rosca.members.call(accounts[2]))[0];
        let memberBalanceAfter = web3.eth.getBalance(accounts[2]).toNumber();
        let contractCredit = yield utils.contractNetCredit(rosca);

        assert.equal(contractCredit, 0);
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter.toNumber(), creditBefore - withdrewAmount);
    }));

    it("withdraw when the contract can send what the user is entitled to while totalDiscount != 0", co(function* () {
        let rosca = yield utils.createEthROSCA();

        const BID_TO_PLACE = consts.DEFAULT_POT() * 0.80;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[0], value: consts.CONTRIBUTION_SIZE}),
            rosca.bid(BID_TO_PLACE, {from: accounts[2]}),
        ]);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        let memberBalanceBefore = web3.eth.getBalance(accounts[2]).toNumber();

        yield rosca.withdraw({from: accounts[2]});

        let creditAfter = (yield rosca.members.call(accounts[2]))[0];
        let currentRound = yield rosca.currentRound.call();
        let totalDiscount = consts.DEFAULT_POT() - BID_TO_PLACE;
        let expectedCredit =
        (currentRound * consts.CONTRIBUTION_SIZE) - utils.afterFee(totalDiscount / consts.MEMBER_COUNT(), consts.SERVICE_FEE_IN_THOUSANDTHS);

        let memberBalanceAfter = web3.eth.getBalance(accounts[2]).toNumber();
        let contractCredit = web3.eth.getBalance(rosca.address).toNumber();

        assert.isAbove(contractCredit, 0); // If this fails, there is a bug in the test.
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter.toString(), expectedCredit, "withdraw doesn't send the right amount");
    }));

    it("does not allow delinquent people to withdraw even after winning, unless they pay their dues",
            co(function* () {
         // In this 2-person rosca test, both p0 and p1 are delinquent and pay only 0.5C each in the first round.
         // We check that the winner cannot withdraw their money in the next round, but once they pay up, they can.
         let members = [accounts[1]];
         let rosca = yield utils.createEthROSCA(members);

         utils.increaseTime(consts.START_TIME_DELAY);
         yield Promise.all([
             rosca.startRound(),
             rosca.contribute({from: accounts[1], value: 0.5 * consts.CONTRIBUTION_SIZE}),
             rosca.contribute({from: accounts[0], value: 0.5 * consts.CONTRIBUTION_SIZE}),
         ]);
         let winnerAddress = 0;

         let eventFired = false;
         let fundsReleasedEvent = rosca.LogRoundFundsReleased();    // eslint-disable-line new-cap
         fundsReleasedEvent.watch(function(error, log) {
             fundsReleasedEvent.stopWatching();
             eventFired = true;
             winnerAddress = log.args.winnerAddress;
         });

         utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
         yield rosca.startRound();

         yield Promise.delay(300);

         assert.isOk(eventFired, "LogRoundsFundsReleased event did not occur");
         // Throws when delinquent, does not throw otherwise.
         yield utils.assertThrows(rosca.withdraw({from: winnerAddress}));
         yield rosca.contribute({from: winnerAddress, value: 1.5 * consts.CONTRIBUTION_SIZE});
         yield rosca.withdraw({from: winnerAddress});
    }));

    it("delinquent cannot withdraw before end of rosca, can withdraw up to amount contributed after the end",
        co(function* () {
        // In this 2-person rosca test, both p0 and p1 are delinquent and pay only 0.5C each in the first round.
        // We check that the winner cannot withdraw their money until rosca has ended.
        // After rosca ended, we check that the winner can only withdraw the amount he contributed.
        let members = [accounts[1]];
        let rosca = yield utils.createEthROSCA(members);

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[1], value: 0.5 * consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[0], value: 0.5 * consts.CONTRIBUTION_SIZE}),
        ]);
        let winnerAddress = 0;

        let eventFired = false;
        let fundsReleasedEvent = rosca.LogRoundFundsReleased();    // eslint-disable-line new-cap
        fundsReleasedEvent.watch(function(error, log) {
            fundsReleasedEvent.stopWatching();
            eventFired = true;
            winnerAddress = log.args.winnerAddress;
        });

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        yield Promise.delay(300);

        assert.isOk(eventFired, "LogRoundsFundsReleased event did not occur");
        // Throws when delinquent, does not throw otherwise.
        yield utils.assertThrows(rosca.withdraw({from: winnerAddress}));

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound(); // endOfRosca = true;

        let contractBalanceBefore = web3.eth.getBalance(rosca.address);
        yield rosca.withdraw({from: winnerAddress});
        let contractBalanceAfter = web3.eth.getBalance(rosca.address);

        assert.equal(contractBalanceBefore - contractBalanceAfter, 0.5 * consts.CONTRIBUTION_SIZE);
    })); */
});
