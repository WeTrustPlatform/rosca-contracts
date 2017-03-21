"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA cleanUpPreviousRound Unit Test', function(accounts) {
    // Parameters for new ROSCA creation
    const ROUND_PERIOD_IN_SECS = 100;
    const MEMBER_LIST = [accounts[1], accounts[2], accounts[3]];
    const CONTRIBUTION_SIZE = 1e16;
    const SERVICE_FEE_IN_THOUSANDTHS = 2;

    const MEMBER_COUNT = MEMBER_LIST.length + 1;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
    const START_TIME_DELAY = 10; // 10 seconds buffer

    it("checks if totalDiscount grows when lowestBid < DEFAULT_POT", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const BID_TO_PLACE = DEFAULT_POT * 0.75;

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(), // needed to set lowestBid value + winnerAddress to 0
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.bid(BID_TO_PLACE, {from: accounts[0]}),
            rosca.cleanUpPreviousRound(),
        ]);

        let discount = yield rosca.totalDiscounts.call();
        const expectedDiscount = utils.afterFee(DEFAULT_POT - BID_TO_PLACE, SERVICE_FEE_IN_THOUSANDTHS) / MEMBER_COUNT;

        assert.equal(discount, expectedDiscount, "toalDiscount value didn't get added properly");
    }));

    it("watches for LogRoundFundsReleased event and check if winner gets proper values", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const BID_TO_PLACE = DEFAULT_POT * 0.68;

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.bid(BID_TO_PLACE, {from: accounts[1]}),
        ]);

        let eventFired = false;
        let fundsReleasedEvent = rosca.LogRoundFundsReleased();  // eslint-disable-line new-cap
        fundsReleasedEvent.watch(co(function* (error, log) {
            fundsReleasedEvent.stopWatching();
            eventFired = true;
            let user = yield rosca.members.call(log.args.winnerAddress);
            assert.equal(accounts[1], log.args.winnerAddress);
            assert.isOk(user[3], "chosen address is not a member"); // user.alive
            assert.isOk(user[2], "Paid member was chosen"); // user.paid
            let expectedCredit = CONTRIBUTION_SIZE + utils.afterFee(BID_TO_PLACE, SERVICE_FEE_IN_THOUSANDTHS);
            assert.equal(user[0].toString(), expectedCredit); // user.credit
        }));

        yield rosca.cleanUpPreviousRound();

        yield Promise.delay(300); // 300ms delay to allow the event to fire properly
        assert.isOk(eventFired, "LogRoundFundsReleased didn't fire");
    }));

    it("checks if random unpaid member in good Standing is picked when no bid was placed", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            // member 0 will be eligible to win the pot if no bid was placed
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            // member 2 will be eligible to win the pot if no bid was placed
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
        ]);

        let winner;
        let possibleWinner = [accounts[0], accounts[2]];
        let winnerAddress = 0;

        let eventFired = false;
        let fundsReleasedEvent = rosca.LogRoundFundsReleased();    // eslint-disable-line new-cap
        fundsReleasedEvent.watch(co(function* (error, log) {
            fundsReleasedEvent.stopWatching();
            eventFired = true;
            winnerAddress = log.args.winnerAddress;
            winner = yield rosca.members.call(log.args.winnerAddress);
        }));

        yield rosca.cleanUpPreviousRound();

        yield Promise.delay(300);
        assert.isOk(eventFired, "LogRoundFundReleased didn't occur");
        assert.include(possibleWinner, winnerAddress, "Non eligible member won the pot");
        assert.equal(winner[0], CONTRIBUTION_SIZE + utils.afterFee(DEFAULT_POT, SERVICE_FEE_IN_THOUSANDTHS),  // credit
            "lowestBid is not deposited into winner's credit"); // winner.credit
        assert.isOk(winner[3], "a non member was chosen when there were no bids");
    }));

    it("when no one bids, checks that non-delinquent members are preferred, but delinquent members can " +
        "win when only they are eligible", co(function* () {
        // 3 member rosca, where p1 is the only one in goodStanding and will win the Pot in round 1
        // in 2nd round check that one of the other two users (delinquents) get the pot
        let memberList = [accounts[1], accounts[2]];
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            memberList, SERVICE_FEE_IN_THOUSANDTHS);

        let pot = (memberList.length + 1) * CONTRIBUTION_SIZE;
        utils.increaseTime(START_TIME_DELAY);
        yield rosca.startRound();
        yield rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE});

        utils.increaseTime(ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        // check if p1 is the winner
        let p1Credit = (yield rosca.members.call(accounts[1]))[0];
        assert.equal(p1Credit.toString(), (CONTRIBUTION_SIZE + pot / 1000 * (1000 - SERVICE_FEE_IN_THOUSANDTHS)));

        let winner;
        let possibleWinner = [accounts[0], accounts[2]];
        let winnerAddress = 0;

        let eventFired = false;
        let fundsReleasedEvent = rosca.LogRoundFundsReleased();    // eslint-disable-line new-cap
        fundsReleasedEvent.watch(co(function* (error, log) {
            fundsReleasedEvent.stopWatching();
            eventFired = true;
            winnerAddress = log.args.winnerAddress;
            winner = yield rosca.members.call(log.args.winnerAddress);
        }));

        yield rosca.cleanUpPreviousRound();

        yield Promise.delay(300);
        assert.isOk(eventFired, "LogRoundFundReleased didn't occur");
        assert.include(possibleWinner, winnerAddress, "Non eligible member won the pot");
        assert.equal(winner[0].toString(), utils.afterFee((memberList.length + 1) * CONTRIBUTION_SIZE,
            SERVICE_FEE_IN_THOUSANDTHS)); // winner.credit
        assert.isOk(winner[3], "a non member was chosen when there were no bids");
    }));
});
