"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts')

contract('ROSCA cleanUpPreviousRound Unit Test', function(accounts) {
    before(function () {
      consts.setMemberList(accounts)
    })

    it("checks if totalDiscount grows when lowestBid < consts.DEFAULT_POT()", co(function* () {
        let rosca = yield utils.createEthROSCA();

        const BID_TO_PLACE = consts.DEFAULT_POT() * 0.75;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(), // needed to set lowestBid value + winnerAddress to 0
            rosca.contribute({from: accounts[0], value: consts.CONTRIBUTION_SIZE}),
            rosca.bid(BID_TO_PLACE, {from: accounts[0]}),
            rosca.cleanUpPreviousRound(),
        ]);

        let discount = yield rosca.totalDiscounts.call();
        const expectedDiscount = utils.afterFee(consts.DEFAULT_POT() - BID_TO_PLACE, consts.SERVICE_FEE_IN_THOUSANDTHS) / consts.MEMBER_COUNT();

        assert.equal(discount, expectedDiscount, "toalDiscount value didn't get added properly");
    }));

    it("watches for LogRoundFundsReleased event and check if winner gets proper values", co(function* () {
        let rosca = yield utils.createEthROSCA();

        const BID_TO_PLACE = consts.DEFAULT_POT() * 0.68;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[1], value: consts.CONTRIBUTION_SIZE}),
            rosca.bid(BID_TO_PLACE, {from: accounts[1]}),
        ]);

        let result = yield rosca.cleanUpPreviousRound();

        let log = result.logs[0]

        let user = yield rosca.members.call(log.args.winnerAddress);
        assert.equal(accounts[1], log.args.winnerAddress);
        assert.isOk(user[3], "chosen address is not a member"); // user.alive
        assert.isOk(user[2], "Paid member was chosen"); // user.paid
        let expectedCredit = consts.CONTRIBUTION_SIZE + utils.afterFee(BID_TO_PLACE, consts.SERVICE_FEE_IN_THOUSANDTHS);
        assert.equal(user[0].toString(), expectedCredit); // user.credit

    }));

    it("checks if random unpaid member in good Standing is picked when no bid was placed", co(function* () {
        let rosca = yield utils.createEthROSCA();

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            // member 0 will be eligible to win the pot if no bid was placed
            rosca.contribute({from: accounts[0], value: consts.CONTRIBUTION_SIZE}),
            // member 2 will be eligible to win the pot if no bid was placed
            rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE}),
        ]);

        let winner;
        let possibleWinner = [accounts[0], accounts[2]];
        let winnerAddress = 0;

        let result = yield rosca.cleanUpPreviousRound();

        let log = result.logs[0]

        winnerAddress = log.args.winnerAddress;
        winner = yield rosca.members.call(log.args.winnerAddress);

        assert.include(possibleWinner, winnerAddress, "Non eligible member won the pot");
        assert.equal(winner[0], consts.CONTRIBUTION_SIZE + utils.afterFee(consts.DEFAULT_POT(), consts.SERVICE_FEE_IN_THOUSANDTHS),  // credit
            "lowestBid is not deposited into winner's credit"); // winner.credit
        assert.isOk(winner[3], "a non member was chosen when there were no bids");
    }));

    it("when no one bids, checks that non-delinquent members are preferred, but delinquent members can " +
        "win when only they are eligible", co(function* () {
        // 3 member rosca, where p1 is the only one in goodStanding and will win the Pot in round 1
        // in 2nd round check that one of the other two users (delinquents) get the pot
        let memberList = [accounts[1], accounts[2]];
        let rosca = yield utils.createEthROSCA(memberList);

        let pot = (memberList.length + 1) * consts.CONTRIBUTION_SIZE;
        utils.increaseTime(consts.START_TIME_DELAY);
        yield rosca.startRound();
        yield rosca.contribute({from: accounts[1], value: consts.CONTRIBUTION_SIZE});

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        // check if p1 is the winner
        let p1Credit = (yield rosca.members.call(accounts[1]))[0];
        assert.equal(p1Credit.toString(), (consts.CONTRIBUTION_SIZE + pot / 1000 * (1000 - consts.SERVICE_FEE_IN_THOUSANDTHS)));

        let possibleWinner = [accounts[0], accounts[2]];

        let result = yield rosca.cleanUpPreviousRound();
        let log = result.logs[0]
        let winnerAddress = log.args.winnerAddress;
        let winner = yield rosca.members.call(log.args.winnerAddress);

        assert.include(possibleWinner, winnerAddress, "Non eligible member won the pot");
        assert.equal(winner[0].toString(), utils.afterFee((memberList.length + 1) * consts.CONTRIBUTION_SIZE,
            consts.SERVICE_FEE_IN_THOUSANDTHS)); // winner.credit
        assert.isOk(winner[3], "a non member was chosen when there were no bids");
    }));
});
