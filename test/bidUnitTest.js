"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA bid Unit Test', function(accounts) {
    // Parameters for new ROSCA creation
    const ROUND_PERIOD_IN_SECS = 100;
    const MEMBER_LIST = [accounts[1], accounts[2], accounts[3]];
    const CONTRIBUTION_SIZE = 1e16;
    const SERVICE_FEE_IN_THOUSANDTHS = 2;
    const START_TIME_DELAY = 10; // 10 seconds buffer

    const MEMBER_COUNT = MEMBER_LIST.length + 1;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;

    it("Throws when calling bid with valid parameters before ROSCA starts", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        yield utils.assertThrows(rosca.bid(DEFAULT_POT, {from: accounts[1]}),
            "expected calling bid in round 0 to throw");
    }));

    it("Throws when calling bid without being in good Standing", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield rosca.startRound();

        yield utils.assertThrows(rosca.bid(DEFAULT_POT, {from: accounts[1]}),
            "expected calling bid before contributing to throw");
    }));

    it("Throws Placing bid less than 65% of the Pot", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const MIN_DISTRIBUTION_PERCENT = yield rosca.MIN_DISTRIBUTION_PERCENT.call();

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
        ]);

        yield utils.assertThrows(rosca.bid(DEFAULT_POT * (MIN_DISTRIBUTION_PERCENT / 100 * 0.99), {from: accounts[2]}),
            "expected placing bid less than MIN_DISTRIBUTION_PERCENT threshold to throw");
    }));

    it("generates a LogNewLowestBid event when placing a valid new bid", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const BID_TO_PLACE = DEFAULT_POT * 0.94;

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
        ]);

        let eventFired = false;
        let bidEvent = rosca.LogNewLowestBid();  // eslint-disable-line new-cap
        bidEvent.watch(function(error, log) {
            bidEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.bid, BID_TO_PLACE, "Log doesn't show the proper bid value");
            assert.equal(log.args.winnerAddress, accounts[2], "Log doesn't show proper winnerAddress");
        });

        yield rosca.bid(BID_TO_PLACE, {from: accounts[2]});

        yield Promise.delay(300);
        assert.isOk(eventFired, "Bid event did not fire");

        utils.increaseTime(ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        let credit = (yield rosca.members.call(accounts[2]))[0];
        let expectedCredit = CONTRIBUTION_SIZE + utils.afterFee(BID_TO_PLACE, SERVICE_FEE_IN_THOUSANDTHS);

        assert.equal(credit, expectedCredit, "bid placed didn't affect winner's credit");
    }));

    it("Throws when placing a valid bid from paid member", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.bid(DEFAULT_POT, {from: accounts[2]}),
        ]);

        utils.increaseTime(ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        yield utils.assertThrows(rosca.bid(DEFAULT_POT, {from: accounts[2]}),
            "calling bid from paid member succeed, didn't throw");
    }));

    it("ignores bid higher than MAX_NEXT_BID_RATIO of the previous lowest bid", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const MAX_NEXT_BID_RATIO = yield (ROSCATest.deployed()).MAX_NEXT_BID_RATIO.call();
        const NOT_LOW_ENOUGH_BID_TO_PLACE = DEFAULT_POT / 100 * MAX_NEXT_BID_RATIO + 100;

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE}),

            rosca.bid(DEFAULT_POT, {from: accounts[1]}),
            rosca.bid(NOT_LOW_ENOUGH_BID_TO_PLACE, {from: accounts[3]}),
        ]);

        utils.increaseTime(ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        let p1Credit = (yield rosca.members.call(accounts[1]))[0];
        let expectedCredit = CONTRIBUTION_SIZE + utils.afterFee(DEFAULT_POT, SERVICE_FEE_IN_THOUSANDTHS);

        assert.equal(p1Credit.toNumber(), expectedCredit,
            "original bidder should have won due to insufficient gap in the second bid");
    }));

    it("ignores higher bid", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const LOWER_BID = DEFAULT_POT * 0.95;

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE}),

            rosca.bid(LOWER_BID, {from: accounts[3]}),
            rosca.bid(DEFAULT_POT, {from: accounts[1]}),
        ]);
        utils.increaseTime(ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        let p3Credit = (yield rosca.members.call(accounts[3]))[0];
        let expectedCredit = CONTRIBUTION_SIZE + utils.afterFee(LOWER_BID, SERVICE_FEE_IN_THOUSANDTHS);

        assert.equal(p3Credit, expectedCredit, "original lower bid should have won");
    }));
});
