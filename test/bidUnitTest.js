"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA bid Unit Test', function(accounts) {
    // Parameters for new ROSCA creation
    const ROUND_PERIOD_IN_DAYS = 3;
    const MIN_DAYS_BEFORE_START = 1;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const CONTRIBUTION_SIZE = 1e16;
    const SERVICE_FEE_IN_THOUSANDTHS = 2;
    const START_TIME_DELAY = 86400 * MIN_DAYS_BEFORE_START + 10; // 10 seconds buffer

    const MEMBER_COUNT = MEMBER_LIST.length + 1;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
    const ROUND_PERIOD_DELAY = 86400 * ROUND_PERIOD_IN_DAYS;
    const PERCENT_AFTER_FEE = (1 - SERVICE_FEE_IN_THOUSANDTHS / 1000);

    it("Throws when calling Bid with valid parameters before ROSCA starts", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        yield utils.assertThrows(rosca.bid(DEFAULT_POT, {from: accounts[1]}),
            "expected calling bid in round 0 to throw");
    }));

    it("Throws when calling bid without being in good Standing", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield rosca.startRound();

        yield utils.assertThrows(rosca.bid(DEFAULT_POT , {from: accounts[1]}),
            "expected calling bid before contributing to throw");
    }));

    it("Throws Placing bid less than 65% of the Pot", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const MIN_DISTRIBUTION_PERCENT = yield rosca.MIN_DISTRIBUTION_PERCENT.call();

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE})
        ]);

        yield utils.assertThrows(rosca.bid(DEFAULT_POT * (MIN_DISTRIBUTION_PERCENT / 100 * 0.99), {from: accounts[2]}),
            "expected placing bid less than MIN_DISTRIBUTION_PERCENT threshold to throw");
    }));

    it("generates a LogNewLowestBid event when placing a valid new bid", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const BID_TO_PLACE = DEFAULT_POT * 0.94;

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE})
        ]);

        let eventFired = false;
        let bidEvent = rosca.LogNewLowestBid();
        bidEvent.watch(function(error, log) {
            bidEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.bid, BID_TO_PLACE, "Log doesn't show the proper bid value");
            assert.equal(log.args.winnerAddress, accounts[2], "Log doesn't show proper winnerAddress");
        });

        yield rosca.bid(BID_TO_PLACE , {from: accounts[2]});

        yield Promise.delay(300);
        assert.isOk(eventFired,"Bid event did not fire");

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();

        let credit = (yield rosca.members.call(accounts[2]))[0];
        let expectedCredit = CONTRIBUTION_SIZE + (BID_TO_PLACE * PERCENT_AFTER_FEE);

        assert.equal(credit, expectedCredit, "bid placed didn't affect winner's credit");
    }));

    it("Throws when placing a valid bid from paid member", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.bid(DEFAULT_POT, {from: accounts[2]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();

        yield utils.assertThrows(rosca.bid(DEFAULT_POT, {from: accounts[2]}),
            "calling bid from paid member succeed, didn't throw");
    }));

    it("new Higher bid is ignored" , co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const BID_TO_PLACE = DEFAULT_POT *0.95;

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.bid(BID_TO_PLACE, {from: accounts[3]}),
            rosca.bid(DEFAULT_POT , {from: accounts[1]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();
      
        let credit = (yield rosca.members.call(accounts[1]))[0];
        let expectedCredit = CONTRIBUTION_SIZE + (DEFAULT_POT * PERCENT_AFTER_FEE);


        assert.notEqual(credit, expectedCredit, "new higher bid won");
    }));
});