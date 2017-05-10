"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('./utils/consts')
let rosca

contract('ROSCA bid Unit Test', function(accounts) {
    before(function () {
      consts.setMemberList(accounts)
    })

    beforeEach(co(function* () {
      rosca = yield utils.createEthROSCA();
    }))

    it("Throws when calling bid with valid parameters before ROSCA starts", co(function* () {
        yield utils.assertThrows(rosca.bid(consts.defaultPot(), {from: accounts[1]}),
            "expected calling bid in round 0 to throw");
    }));

    it("Throws when calling bid without being in good Standing", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY);
        yield rosca.startRound();

        yield utils.assertThrows(rosca.bid(consts.defaultPot(), {from: accounts[1]}),
            "expected calling bid before contributing to throw");
    }));

    it("Throws Placing bid less than 65% of the Pot", co(function* () {
        const MIN_DISTRIBUTION_PERCENT = yield rosca.MIN_DISTRIBUTION_PERCENT.call();

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE}),
        ]);

        yield utils.assertThrows(rosca.bid(consts.defaultPot() * (MIN_DISTRIBUTION_PERCENT / 100 * 0.99), {from: accounts[2]}),
            "expected placing bid less than MIN_DISTRIBUTION_PERCENT threshold to throw");
    }));

    it("generates a LogNewLowestBid event when placing a valid new bid", co(function* () {
        const BID_TO_PLACE = consts.defaultPot() * 0.94;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE}),
        ]);

        let result = yield rosca.bid(BID_TO_PLACE, {from: accounts[2]});

        let log = result.logs[0]

        assert.equal(log.args.bid, BID_TO_PLACE, "Log doesn't show the proper bid value");
        assert.equal(log.args.winnerAddress, accounts[2], "Log doesn't show proper winnerAddress");

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        let credit = (yield rosca.members.call(accounts[2]))[0];
        let expectedCredit = consts.CONTRIBUTION_SIZE + utils.afterFee(BID_TO_PLACE, consts.SERVICE_FEE_IN_THOUSANDTHS);

        assert.equal(credit, expectedCredit, "bid placed didn't affect winner's credit");
    }));

    it("Throws when placing a valid bid from paid member", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE}),
            rosca.bid(consts.defaultPot(), {from: accounts[2]}),
        ]);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        yield utils.assertThrows(rosca.bid(consts.defaultPot(), {from: accounts[2]}),
            "calling bid from paid member succeed, didn't throw");
    }));

    it("ignores bid higher than MAX_NEXT_BID_RATIO of the previous lowest bid", co(function* () {
        const roscaTest = yield ROSCATest.deployed()
        const MAX_NEXT_BID_RATIO = yield roscaTest.MAX_NEXT_BID_RATIO.call();
        const NOT_LOW_ENOUGH_BID_TO_PLACE = consts.defaultPot() / 100 * MAX_NEXT_BID_RATIO + 100;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[1], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: consts.CONTRIBUTION_SIZE}),

            rosca.bid(consts.defaultPot(), {from: accounts[1]}),
            rosca.bid(NOT_LOW_ENOUGH_BID_TO_PLACE, {from: accounts[3]}),
        ]);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        let p1Credit = (yield rosca.members.call(accounts[1]))[0];
        let expectedCredit = consts.CONTRIBUTION_SIZE + utils.afterFee(consts.defaultPot(), consts.SERVICE_FEE_IN_THOUSANDTHS);

        assert.equal(p1Credit.toNumber(), expectedCredit,
            "original bidder should have won due to insufficient gap in the second bid");
    }));

    it("ignores higher bid", co(function* () {
        const LOWER_BID = consts.defaultPot() * 0.95;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[1], value: consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: consts.CONTRIBUTION_SIZE}),

            rosca.bid(LOWER_BID, {from: accounts[3]}),
            rosca.bid(consts.defaultPot(), {from: accounts[1]}),
        ]);
        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        let p3Credit = (yield rosca.members.call(accounts[3]))[0];
        let expectedCredit = consts.CONTRIBUTION_SIZE + utils.afterFee(LOWER_BID, consts.SERVICE_FEE_IN_THOUSANDTHS);

        assert.equal(p3Credit, expectedCredit, "original lower bid should have won");
    }));
});
