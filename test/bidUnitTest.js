"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let roscaHelper;

contract('ROSCA bid Unit Test', function(accounts) {
    before(function() {
      consts.setMemberList(accounts);
    });

    beforeEach(co(function* () {
      roscaHelper = new ROSCAHelper(accounts, (yield utils.createEthROSCA()));
    }));

    it("Throws when calling bid with valid parameters before ROSCA starts", co(function* () {
        yield utils.assertThrows(roscaHelper.bid(1, consts.defaultPot()),
            "expected calling bid in round 0 to throw");
    }));

    it("Throws when calling bid without being in good Standing", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY);

        yield utils.assertThrows(roscaHelper.bid(1, consts.defaultPot()),
            "expected calling bid before contributing to throw");
    }));

    it("Throws Placing bid less than 65% of the Pot", co(function* () {
        const MIN_DISTRIBUTION_PERCENT = yield roscaHelper.MIN_DISTRIBUTION_PERCENT(); // eslint-disable-line

        const BID_TO_PLACE = consts.defaultPot() * (MIN_DISTRIBUTION_PERCENT / 100 * 0.99);

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            roscaHelper.contribute(2, consts.CONTRIBUTION_SIZE),
        ]);

        yield utils.assertThrows(roscaHelper.bid(2, BID_TO_PLACE),
            "expected placing bid less than MIN_DISTRIBUTION_PERCENT threshold to throw");
    }));

    it("generates a LogBidSurpassed event when a bid was outbid by another", co(function* () {
        const BID_TO_PLACE = consts.defaultPot() * 0.94;
        const BID_TO_OUTBID = BID_TO_PLACE * 0.97;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
          roscaHelper.contribute(2, consts.CONTRIBUTION_SIZE),
          roscaHelper.contribute(1, consts.CONTRIBUTION_SIZE),
        ]);

        yield roscaHelper.bid(2, BID_TO_PLACE);
        let result = yield roscaHelper.bid(1, BID_TO_OUTBID);

        let log = result.logs[0];

        assert.equal(log.args.prevBid.toString(), BID_TO_PLACE, "Log doesn't show the proper bid value");
        assert.equal(log.args.prevWinnerAddress, accounts[2], "Log doesn't show proper winnerAddress");

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield roscaHelper.startRound();

        let credit = yield roscaHelper.userCredit(1);
        let expectedCredit = consts.CONTRIBUTION_SIZE +
          utils.afterFee(BID_TO_OUTBID, consts.SERVICE_FEE_IN_THOUSANDTHS);

        assert.equal(credit, expectedCredit, "bid placed didn't affect winner's credit");
    }));

    it("generates a LogNewLowestBid event when placing a valid new bid", co(function* () {
        const BID_TO_PLACE = consts.defaultPot() * 0.94;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            roscaHelper.contribute(2, consts.CONTRIBUTION_SIZE),
        ]);

        let result = yield roscaHelper.bid(2, BID_TO_PLACE);

        let log = result.logs[0];

        assert.equal(log.args.bid, BID_TO_PLACE, "Log doesn't show the proper bid value");
        assert.equal(log.args.winnerAddress, accounts[2], "Log doesn't show proper winnerAddress");

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield roscaHelper.startRound();

        let credit = yield roscaHelper.userCredit(2);
        let expectedCredit = consts.CONTRIBUTION_SIZE + utils.afterFee(BID_TO_PLACE, consts.SERVICE_FEE_IN_THOUSANDTHS);

        assert.equal(credit, expectedCredit, "bid placed didn't affect winner's credit");
    }));

    it("Throws when placing a valid bid from paid member", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            roscaHelper.contribute(2, consts.CONTRIBUTION_SIZE),
        ]);

        yield roscaHelper.bid(2, consts.defaultPot());
        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield roscaHelper.startRound();

        yield utils.assertThrows(roscaHelper.bid(2, consts.defaultPot()),
            "calling bid from paid member succeed, didn't throw");
    }));

    it("ignores bid higher than MAX_NEXT_BID_RATIO of the previous lowest bid", co(function* () {
        const roscaTest = yield ROSCATest.deployed();

        const MAX_NEXT_BID_RATIO = yield roscaTest.MAX_NEXT_BID_RATIO.call();
        const NOT_LOW_ENOUGH_BID_TO_PLACE = consts.defaultPot() / 100 * MAX_NEXT_BID_RATIO + 1000;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            roscaHelper.contribute(1, consts.CONTRIBUTION_SIZE),
            roscaHelper.contribute(3, consts.CONTRIBUTION_SIZE),
        ]);

        yield Promise.all([
            roscaHelper.bid(1, consts.defaultPot()),
            roscaHelper.bid(3, NOT_LOW_ENOUGH_BID_TO_PLACE),
        ]);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield roscaHelper.startRound();

        let p1Credit = yield roscaHelper.userCredit(1);
        let expectedCredit = consts.CONTRIBUTION_SIZE +
          utils.afterFee(consts.defaultPot(), consts.SERVICE_FEE_IN_THOUSANDTHS);

        assert.equal(p1Credit, expectedCredit,
            "original bidder should have won due to insufficient gap in the second bid");
    }));

    it("ignores higher bid", co(function* () {
        const LOWER_BID = consts.defaultPot() * 0.95;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            roscaHelper.contribute(1, consts.CONTRIBUTION_SIZE),
            roscaHelper.contribute(3, consts.CONTRIBUTION_SIZE),
        ]);
        yield Promise.all([
            roscaHelper.bid(3, LOWER_BID),
            roscaHelper.bid(1, consts.defaultPot()),
        ]);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield roscaHelper.startRound();

        let p3Credit = yield roscaHelper.userCredit(3);
        let expectedCredit = consts.CONTRIBUTION_SIZE + utils.afterFee(LOWER_BID, consts.SERVICE_FEE_IN_THOUSANDTHS);

        assert.equal(p3Credit, expectedCredit, "original lower bid should have won");
    }));
});
