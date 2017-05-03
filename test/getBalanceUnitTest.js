"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts')

contract('ROSCA getParticipantBalance Unit Test', function(accounts) {
    before(function () {
      consts.setMemberList(accounts)
    })

    const NET_REWARDS_RATIO = ((1000 - consts.SERVICE_FEE_IN_THOUSANDTHS) / 1000);

    it("checks getParticipantBalance returns correct withdrawable value", co(function* () {
        let rosca = yield utils.createEthROSCA();

        yield Promise.all([
            rosca.contribute({from: accounts[0], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: consts.CONTRIBUTION_SIZE}),
        ]);

        utils.increaseTime(consts.START_TIME_DELAY);
        yield rosca.startRound();
        yield rosca.bid(consts.DEFAULT_POT() * 0.98, {from: accounts[2]});

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();
        let balance = yield rosca.getParticipantBalance.call(accounts[2]);
        let totalDiscounts = (yield rosca.totalDiscounts.call()).toNumber();

        // expected = Pot Won * Fee - next Round contribution
        let expectedBalance = consts.DEFAULT_POT() * 0.98 * NET_REWARDS_RATIO - consts.CONTRIBUTION_SIZE + totalDiscounts;
        assert.equal(balance, expectedBalance);

        // expectedBalance is Pot won - nextRound contribution (contributionSize + totalDiscount)
        // test the behavior by checking withdraw the funds instead of checking state variable

        let contractBalanceBefore = web3.eth.getBalance(rosca.address);
        yield rosca.withdraw({from: accounts[2]});
        let contractBalanceAfter = web3.eth.getBalance(rosca.address);
        assert.equal(contractBalanceBefore - contractBalanceAfter, balance);
    }));

    it("checks that getParticipantBalance returns negative value for delinquents " +
       "(who haven't won the pot)", co(function* () {
        let rosca = yield utils.createEthROSCA();

        utils.increaseTime(consts.START_TIME_DELAY);
        yield rosca.startRound();

        // get the balance of delinquent who haven't won the Pot
        // test by calling withdraw, which should throw and
        // make contribution > than balance, and call withdraw

        let balance = (yield rosca.getParticipantBalance.call(accounts[1]));

        let expectedBalance = - consts.CONTRIBUTION_SIZE;
        assert.equal(balance, expectedBalance);
        utils.assertThrows(rosca.withdraw({from: accounts[1]}));

        // contributed extra by consts.CONTRIBUTION_SIZE, when we try to withdraw, we should get consts.CONTRIBUTION_SIZE
        let EXTRA_CONTRIBUTION = 2e18;
        let debt = - balance;
        yield rosca.contribute({from: accounts[1], value: (debt + EXTRA_CONTRIBUTION)});

        let contractBalanceBefore = web3.eth.getBalance(rosca.address);
        yield rosca.withdraw({from: accounts[1]});
        let contractBalanceAfter = web3.eth.getBalance(rosca.address);
        assert.equal(contractBalanceBefore - contractBalanceAfter, EXTRA_CONTRIBUTION);
    }));

    it("checks that getParticipantBalance returns negative value for delinquents " +
       "(who already won the pot)", co(function* () {
        // 3 member rosca, p1 contribute 5 * consts.CONTRIBUTION_SIZE and win round 1
        let memberList = [accounts[1], accounts[2]];
        let pot = (memberList.length + 1) * consts.CONTRIBUTION_SIZE;
        let rosca = yield utils.createEthROSCA(memberList);

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[0], value: 5 * consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: 0.5 * consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[2], value: 0.5 * consts.CONTRIBUTION_SIZE}),
        ]);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        let result = yield rosca.startRound();
        // we expect one of the delinquent to win
        let log = result.logs[0]
        let winnerAddress = log.args.winnerAddress;

        // get the balance of delinquent who had won the Pot
        // test by calling withdraw, which should throw and
        // make contribution = than balance, and call withdraw

        let balance = (yield rosca.getParticipantBalance.call(winnerAddress));

        // currentRound is 3 so expected balance = 3 * consts.CONTRIBUTION_SIZE - 0.5 * consts.CONTRIBUTION_SIZE(already contributed)
        let expectedBalance = - 2.5 * consts.CONTRIBUTION_SIZE;
        assert.equal(balance.toNumber(), expectedBalance);

        utils.assertThrows(rosca.withdraw({from: winnerAddress}));
        // delinquent who won the Pot already would be able to withdraw consts.DEFAULT_POT() * FEE
        // if they are no longer in debt
        let debt = - balance;
        yield rosca.contribute({from: winnerAddress, value: debt});

        let contractBalanceBefore = web3.eth.getBalance(rosca.address);
        yield rosca.withdraw({from: winnerAddress});
        let contractBalanceAfter = web3.eth.getBalance(rosca.address);
        assert.equal(contractBalanceBefore - contractBalanceAfter, pot * NET_REWARDS_RATIO);
    }));
});
