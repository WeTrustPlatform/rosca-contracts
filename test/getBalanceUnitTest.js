"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA getParticipantBalance Unit Test', function(accounts) {
    // Parameters for new ROSCA creation
    const ROUND_PERIOD_IN_DAYS = 3;
    const MIN_DAYS_BEFORE_START = 1;
    const MEMBER_LIST = [accounts[1], accounts[2], accounts[3]];
    const CONTRIBUTION_SIZE = 1e16;
    const SERVICE_FEE_IN_THOUSANDTHS = 2;

    const MEMBER_COUNT = MEMBER_LIST.length + 1;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
    const START_TIME_DELAY = 86400 * MIN_DAYS_BEFORE_START + 10; // 10 seconds buffer
    const ROUND_PERIOD_DELAY = 86400 * ROUND_PERIOD_IN_DAYS;
    const NET_REWARDS_RATIO = ((1000 - SERVICE_FEE_IN_THOUSANDTHS) / 1000);

    it("checks getParticipantBalance returns correct withdrawable value", co(function* () {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        yield Promise.all([
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE}),
        ]);

        utils.increaseTime(START_TIME_DELAY);
        yield rosca.startRound();
        yield rosca.bid(DEFAULT_POT * 0.98, {from: accounts[2]});

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();
        let balance = yield rosca.getParticipantBalance.call(accounts[2]);
        let totalDiscounts = (yield rosca.totalDiscounts.call()).toNumber();

        // expected = Pot Won * Fee - next Round contribution
        let expectedBalance = DEFAULT_POT * 0.98 * NET_REWARDS_RATIO - CONTRIBUTION_SIZE + totalDiscounts;
        assert.equal(balance, expectedBalance);

        // expectedBalance is Pot won - nextRound contribution (contributionSize + totalDiscount)
        // test the behavior by checking withdraw the funds instead of checking state variable

        let contractBalanceBefore = web3.eth.getBalance(rosca.address);
        yield rosca.withdraw({from: accounts[2]});
        let contractBalanceAfter = web3.eth.getBalance(rosca.address);
        assert.equal(contractBalanceBefore - contractBalanceAfter, balance);
    }));

    it("checks that getParticipantBalance returns negative value for delinquents (who haven't won the Pot)", co(function* () {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield rosca.startRound();

        // get the balance of delinquent who haven't won the Pot
        // test by calling withdraw, which should throw and
        // make contribution > than balance, and call withdraw

        let balance = (yield rosca.getParticipantBalance.call(accounts[1]));

        let expectedBalance = - CONTRIBUTION_SIZE;
        assert.equal(balance, expectedBalance);
        utils.assertThrows(rosca.withdraw({from: accounts[1]}));

        // contributed extra by CONTRIBUTION_SIZE, when we try to withdraw, we should get CONTRIBUTION_SIZE
        let EXTRA_CONTRIBUTION = 2e18;
        let debt = - balance;
        yield rosca.contribute({from: accounts[1], value: (debt + EXTRA_CONTRIBUTION)});

        let contractBalanceBefore = web3.eth.getBalance(rosca.address);
        yield rosca.withdraw({from: accounts[1]});
        let contractBalanceAfter = web3.eth.getBalance(rosca.address);
        assert.equal(contractBalanceBefore - contractBalanceAfter, EXTRA_CONTRIBUTION);
    }));

    it("checks that getParticipantBalance returns negative value for delinquents (who already won the Pot)", co(function* () {
        // 3 member rosca, p1 contribute 5 * CONTRIBUTION_SIZE and win round 1
        let memberList = [accounts[1], accounts[2]];
        let pot = (memberList.length + 1) * CONTRIBUTION_SIZE;
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            memberList, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[0], value: 5 * CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: 0.5 * CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[2], value: 0.5 * CONTRIBUTION_SIZE}),
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();

        let winnerAddress = 0;

        let eventFired = false;
        let fundsReleasedEvent = rosca.LogRoundFundsReleased();    // eslint-disable-line new-cap
        fundsReleasedEvent.watch(function(error, log) {
            fundsReleasedEvent.stopWatching();
            eventFired = true;
            winnerAddress = log.args.winnerAddress;
        });

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();
        // we expect one of the delinquent to win

        yield Promise.delay(500);
        assert.isOk(eventFired);
        // get the balance of delinquent who had won the Pot
        // test by calling withdraw, which should throw and
        // make contribution = than balance, and call withdraw

        let balance = (yield rosca.getParticipantBalance.call(winnerAddress));

        // currentRound is 3 so expected balance = 3 * CONTRIBUTION_SIZE - 0.5 * CONTRIBUTION_SIZE(already contributed)
        let expectedBalance = - 2.5 * CONTRIBUTION_SIZE;
        assert.equal(balance, expectedBalance);

        utils.assertThrows(rosca.withdraw({from: winnerAddress}));
        // delinquent who won the Pot already would be able to withdraw DEFAULT_POT * FEE
        // if they are no longer in debt
        let debt = - balance;
        yield rosca.contribute({from: winnerAddress, value: debt});

        let contractBalanceBefore = web3.eth.getBalance(rosca.address);
        yield rosca.withdraw({from: winnerAddress});
        let contractBalanceAfter = web3.eth.getBalance(rosca.address);
        assert.equal(contractBalanceBefore - contractBalanceAfter, pot * NET_REWARDS_RATIO);
    }));
});
