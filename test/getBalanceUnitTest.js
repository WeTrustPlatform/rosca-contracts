"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let roscaHelper;

contract('ROSCA getParticipantBalance Unit Test', function(accounts) {
    before(function() {
      consts.setMemberList(accounts);
    });

    beforeEach(co(function* () {
      roscaHelper = new ROSCAHelper(accounts, (yield utils.createEthROSCA()));
    }));

    const NET_REWARDS_RATIO = ((1000 - consts.SERVICE_FEE_IN_THOUSANDTHS) / 1000);

    it("checks getParticipantBalance returns correct withdrawable value", co(function* () {
        yield Promise.all([
            roscaHelper.contribute(0, consts.CONTRIBUTION_SIZE),
            roscaHelper.contribute(1, consts.CONTRIBUTION_SIZE),
            roscaHelper.contribute(2, consts.CONTRIBUTION_SIZE),
            roscaHelper.contribute(3, consts.CONTRIBUTION_SIZE),
        ]);

        utils.increaseTime(consts.START_TIME_DELAY);
        yield roscaHelper.bid(2, consts.defaultPot() * 0.98);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield roscaHelper.startRound();
        let balance = yield roscaHelper.getParticipantBalance(2);

        let totalDiscounts = yield roscaHelper.totalDiscounts();

        // expected = Pot Won * Fee - next Round contribution
        let expectedBalance = utils.afterFee(consts.defaultPot() * 0.98) - consts.CONTRIBUTION_SIZE + totalDiscounts;
        assert.equal(balance, expectedBalance);

        // expectedBalance is Pot won - nextRound contribution (contributionSize + totalDiscount)
        // test the behavior by checking withdraw the funds instead of checking state variable

        let contractBalanceBefore = web3.eth.getBalance(roscaHelper.address());
        yield roscaHelper.withdraw(2);
        let contractBalanceAfter = web3.eth.getBalance(roscaHelper.address());
        assert.equal(contractBalanceBefore - contractBalanceAfter, balance);
    }));

    it("checks that getParticipantBalance returns negative value for delinquents " +
       "(who haven't won the pot)", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY);

        // get the balance of delinquent who haven't won the Pot
        // test by calling withdraw, which should throw and
        // make contribution > than balance, and call withdraw

        let balance = yield roscaHelper.getParticipantBalance(1);

        let expectedBalance = - consts.CONTRIBUTION_SIZE;
        assert.equal(balance, expectedBalance);
        utils.assertThrows(roscaHelper.withdraw(1));

        // contributed extra by CONTRIBUTION_SIZE, when we try to withdraw, we should get CONTRIBUTION_SIZE
        let EXTRA_CONTRIBUTION = 2e18;
        let debt = - balance;
        yield roscaHelper.contribute(1, debt + EXTRA_CONTRIBUTION);

        let contractBalanceBefore = web3.eth.getBalance(roscaHelper.address());
        yield roscaHelper.withdraw(1);
        let contractBalanceAfter = web3.eth.getBalance(roscaHelper.address());
        assert.equal(contractBalanceBefore - contractBalanceAfter, EXTRA_CONTRIBUTION);
    }));

    it("checks that getParticipantBalance returns negative value for delinquents " +
       "(who already won the pot)", co(function* () {
        // 3 member rosca, p1 contribute 5 * consts.CONTRIBUTION_SIZE and win round 1
        let memberList = [accounts[0], accounts[1], accounts[2]];
        let pot = memberList.length * consts.CONTRIBUTION_SIZE;
        let roscaHelper = new ROSCAHelper(accounts, (yield utils.createEthROSCA(memberList)));

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            roscaHelper.contribute(0, 5 * consts.CONTRIBUTION_SIZE),
            roscaHelper.contribute(1, 0.5 * consts.CONTRIBUTION_SIZE),
            roscaHelper.contribute(2, 0.5 * consts.CONTRIBUTION_SIZE),
        ]);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield roscaHelper.startRound(roscaHelper);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        let result = yield roscaHelper.startRound();
        // we expect one of the delinquent to win
        let log = result.logs[0];
        let winnerAddress = log.args.winnerAddress;

        // get the balance of delinquent who had won the Pot
        // test by calling withdraw, which should throw and
        // make contribution = than balance, and call withdraw

        let balance = yield roscaHelper.getParticipantBalance(winnerAddress);

        // currentRound is 3 so expected balance = 3 * consts.CONTRIBUTION_SIZE -
        // 0.5 * consts.CONTRIBUTION_SIZE(already contributed)
        let expectedBalance = - 2.5 * consts.CONTRIBUTION_SIZE;
        assert.equal(balance, expectedBalance);
        utils.assertThrows(roscaHelper.withdraw(winnerAddress));
        // delinquent who won the Pot already would be able to withdraw consts.defaultPot() * FEE
        // if they are no longer in debt
        let debt = - balance;
        yield roscaHelper.contribute(winnerAddress, debt);

        let contractBalanceBefore = web3.eth.getBalance(roscaHelper.address());
        yield roscaHelper.withdraw(winnerAddress);
        let contractBalanceAfter = web3.eth.getBalance(roscaHelper.address());
        assert.equal(contractBalanceBefore - contractBalanceAfter, pot * NET_REWARDS_RATIO);
    }));
});
