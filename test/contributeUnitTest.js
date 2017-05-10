"use strict";

// This test checks much of the functionality only against ETH utils.
// It tests against ERC20 ROSCAs only where relevant.

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper')

let ethRosca;
let erc20Rosca;

contract('ROSCA contribute Unit Test', function(accounts) {
    before(function() {
      consts.setMemberList(accounts);
    });

    beforeEach(co(function* () {
      ethRosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA()))
      erc20Rosca = new ROSCAHelper(accounts, (yield utils.createERC20ROSCA(accounts)))
    }));

    it("throws when calling contribute from a non-member", co(function* () {
      for (let rosca of [ethRosca, erc20Rosca]) {
        // check if valid contribution can be made
        yield rosca.contribute(2, consts.CONTRIBUTION_SIZE);

        // check throws when contributing from non-member.
        yield utils.assertThrows(rosca.contribute(4, consts.CONTRIBUTION_SIZE),
            "calling contribute from a non-member success");
      }
    }));

    it("throws when contributing after end of Rosca", co(function* () {
        for (let i = 0; i < consts.memberList().length + 2; i++) {
            utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
            yield ethRosca.startRound();
        }

        utils.assertThrows(ethRosca.contribute(0, consts.CONTRIBUTION_SIZE));
    }));

    it("generates a LogContributionMade event after a successful contribution", co(function* () {
      for (let rosca of [ethRosca, erc20Rosca]) {
        const ACTUAL_CONTRIBUTION = consts.CONTRIBUTION_SIZE * 0.1;

        let result = yield rosca.contribute(1, ACTUAL_CONTRIBUTION);
        let log = result.logs[0];

        assert.equal(log.args.user, accounts[1], "LogContributionMade doesn't display proper user value");
        assert.equal(log.args.amount.toNumber(), ACTUAL_CONTRIBUTION,
            "LogContributionMade doesn't display proper amount value");
      }
    }));

    it("Checks whether the contributed value gets registered properly", co(function* () {
      for (let rosca of [ethRosca, erc20Rosca]) {
        const CONTRIBUTION_CHECK = consts.CONTRIBUTION_SIZE * 1.2;

        yield rosca.contribute(2, consts.CONTRIBUTION_SIZE * 0.2);
        yield rosca.contribute(2, consts.CONTRIBUTION_SIZE);

        let creditAfter = yield rosca.userCredit(2);

        assert.equal(creditAfter, CONTRIBUTION_CHECK, "contribution's credit value didn't get registered properly");
      }
    }));

    it("checks delinquent winner who contributes the right amount no longer considered delinquent",
      co(function* () {
        let members = [accounts[1], accounts[2]];
        let rosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA(members)))

        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute(1, 0.5 * consts.CONTRIBUTION_SIZE),
            rosca.contribute(0, 0.5 * consts.CONTRIBUTION_SIZE),
            rosca.contribute(2, consts.CONTRIBUTION_SIZE),
        ]);

        yield rosca.bid(2, consts.defaultPot() * 0.8);
        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        let result = yield rosca.startRound();
        let log = result.logs[0];
        let winnerAddress = log.args.winnerAddress;

        // winnerAddress's credit should be 0.5 + 3(defaultPot) * fee
        // requirement to get Out of debt = 3(currentRound) + 3(defaultPot) * fee
        // so credit must be at least = 3(currentRound) + 3(defaultPot) * fee - totalDiscount
        // so winnerAddress needs to contribute = 2.5 - totalDiscount
        let contributionToNonDelinquency = 2.5 * consts.CONTRIBUTION_SIZE - (yield rosca.totalDiscounts());
        yield utils.assertThrows(rosca.withdraw(winnerAddress));
        // for some reason 1 is being rounded up so 10 is used instead
        yield rosca.contribute(winnerAddress, (contributionToNonDelinquency - 10));
        yield utils.assertThrows(rosca.withdraw(winnerAddress));
        yield rosca.contribute(winnerAddress, 10);
        yield rosca.withdraw(winnerAddress);
    }));
});
