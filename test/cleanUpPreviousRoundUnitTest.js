"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let roscaHelper;

contract('ROSCA cleanUpPreviousRound Unit Test', function(accounts) {
    before(function() {
      consts.setMemberList(accounts);
    });

    beforeEach(co(function* () {
      roscaHelper = new ROSCAHelper(accounts, (yield utils.createEthROSCA()));
    }));

    it("checks if totalDiscount grows when lowestBid < consts.defaultPot()", co(function* () {
        const BID_TO_PLACE = consts.defaultPot() * 0.75;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            roscaHelper.contribute(0, consts.CONTRIBUTION_SIZE),
        ]);
        yield roscaHelper.bid(0, BID_TO_PLACE);
        yield roscaHelper.cleanUpPreviousRound();

        let discount = yield roscaHelper.totalDiscounts();
        const expectedDiscount = utils.afterFee(consts.defaultPot() - BID_TO_PLACE, consts.SERVICE_FEE_IN_THOUSANDTHS)
          / consts.memberCount();

        assert.equal(discount, expectedDiscount, "toalDiscount value didn't get added properly");
    }));

    it("watches for LogRoundFundsReleased event and check if winner gets proper values", co(function* () {
        const BID_TO_PLACE = consts.defaultPot() * 0.68;

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            roscaHelper.contribute(1, consts.CONTRIBUTION_SIZE),
        ]);

        yield roscaHelper.bid(1, BID_TO_PLACE);

        let result = yield roscaHelper.cleanUpPreviousRound();

        let log = result.logs[0];

        let user = yield roscaHelper.getUser(log.args.winnerAddress);
        assert.equal(accounts[1], log.args.winnerAddress);
        assert.isOk(user[3], "chosen address is not a member"); // user.alive
        assert.isOk(user[2], "Paid member was chosen"); // user.paid
        let expectedCredit = consts.CONTRIBUTION_SIZE + utils.afterFee(BID_TO_PLACE, consts.SERVICE_FEE_IN_THOUSANDTHS);
        assert.equal(user[0].toString(), expectedCredit); // user.credit
    }));

    it("checks if random unpaid member in good Standing is picked when no bid was placed", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            // member 0 will be eligible to win the pot if no bid was placed
            roscaHelper.contribute(0, consts.CONTRIBUTION_SIZE),
            // member 2 will be eligible to win the pot if no bid was placed
            roscaHelper.contribute(2, consts.CONTRIBUTION_SIZE),
        ]);

        let winner;
        let possibleWinner = [accounts[0], accounts[2]];

        let result = yield roscaHelper.cleanUpPreviousRound();

        let log = result.logs[0];

        let winnerAddress = log.args.winnerAddress;
        winner = yield roscaHelper.getUser(log.args.winnerAddress);

        assert.include(possibleWinner, winnerAddress, "Non eligible member won the pot");
        assert.equal(winner[0], consts.CONTRIBUTION_SIZE +
          utils.afterFee(consts.defaultPot(), consts.SERVICE_FEE_IN_THOUSANDTHS),  // credit
            "lowestBid is not deposited into winner's credit"); // winner.credit
        assert.isOk(winner[3], "a non member was chosen when there were no bids");
    }));

    it("when no one bids, checks that non-delinquent members are preferred, but delinquent members can " +
        "win when only they are eligible", co(function* () {
        // 3 member roscaHelper, where p1 is the only one in goodStanding and will win the Pot in round 1
        // in 2nd round check that one of the other two users (delinquents) get the pot
        let memberList = [accounts[0], accounts[1], accounts[2]];

        let rosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA(memberList)));

        let pot = memberList.length * consts.CONTRIBUTION_SIZE;
        utils.increaseTime(consts.START_TIME_DELAY);
        yield rosca.contribute(1, consts.CONTRIBUTION_SIZE);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        // check if p1 is the winner
        let p1Credit = yield rosca.userCredit(1);
        assert.equal(p1Credit, (consts.CONTRIBUTION_SIZE + pot / 1000 * (1000 - consts.SERVICE_FEE_IN_THOUSANDTHS)));

        let possibleWinner = [accounts[0], accounts[2]];

        let result = yield rosca.cleanUpPreviousRound();
        let log = result.logs[0];
        let winnerAddress = log.args.winnerAddress;
        let winner = yield rosca.getUser(winnerAddress);

        assert.include(possibleWinner, winnerAddress, "Non eligible member won the pot");
        assert.equal(winner[0].toString(), utils.afterFee(memberList.length * consts.CONTRIBUTION_SIZE,
            consts.SERVICE_FEE_IN_THOUSANDTHS)); // winner.credit
        assert.isOk(winner[3], "a non member was chosen when there were no bids");
    }));
});
