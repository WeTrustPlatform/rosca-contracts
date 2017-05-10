"use strict";

// This test checks much of the functionality only against ETH ROSCA.
// It tests against ERC20 ROSCAs only where relevant.

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('./utils/consts')
let roscas
let rosca

contract('ROSCA contribute Unit Test', function(accounts) {
    before(function () {
      consts.setMemberList(accounts)
    })

    beforeEach(co(function* () {
      roscas = yield utils.createETHandERC20Roscas(accounts);
      rosca = yield utils.createEthROSCA();
    }))

    it("throws when calling contribute from a non-member", co(function* () {
      for (let rosca of [roscas.ethRosca, roscas.erc20Rosca]) {
        // check if valid contribution can be made
        yield utils.contribute(rosca, accounts[2], consts.CONTRIBUTION_SIZE);

        // check throws when contributing from non-member.
        yield utils.assertThrows(utils.contribute(rosca, accounts[4], consts.CONTRIBUTION_SIZE),
            "calling contribute from a non-member success");
      }
    }));

    it("throws when contributing after end of Rosca", co(function* () {
        for (let i = 0; i < consts.memberList().length + 2; i++) {
            utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
            yield rosca.startRound();
        }

        utils.assertThrows(rosca.contribute({from: accounts[0], value: consts.CONTRIBUTION_SIZE}));
    }));

    it("generates a LogContributionMade event after a successful contribution", co(function* () {
      for (let rosca of [roscas.ethRosca, roscas.erc20Rosca]) {
        const ACTUAL_CONTRIBUTION = consts.CONTRIBUTION_SIZE * 0.1;

        let result = yield utils.contribute(rosca, accounts[1], ACTUAL_CONTRIBUTION);
        let log = result.logs[0]

        assert.equal(log.args.user, accounts[1], "LogContributionMade doesn't display proper user value");
        assert.equal(log.args.amount.toNumber(), ACTUAL_CONTRIBUTION,
            "LogContributionMade doesn't display proper amount value");
      }
    }));

    it("Checks whether the contributed value gets registered properly", co(function* () {
      for (let rosca of [roscas.ethRosca, roscas.erc20Rosca]) {
        const CONTRIBUTION_CHECK = consts.CONTRIBUTION_SIZE * 1.2;

        yield utils.contribute(rosca, accounts[2], consts.CONTRIBUTION_SIZE * 0.2);
        yield utils.contribute(rosca, accounts[2], consts.CONTRIBUTION_SIZE);

        let creditAfter = (yield rosca.members.call(accounts[2]))[0];

        assert.equal(creditAfter, CONTRIBUTION_CHECK, "contribution's credit value didn't get registered properly");
      }
    }));

    it("checks delinquent winner who contributes the right amount no longer considered delinquent",
      co(function* () {
        let members = [accounts[1], accounts[2]];
        let rosca = yield utils.createEthROSCA(members);
        utils.increaseTime(consts.START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[1], value: 0.5 * consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[0], value: 0.5 * consts.CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE}),
            rosca.bid(consts.defaultPot() * 0.8, {from: accounts[2]}),
        ]);

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        yield rosca.startRound();

        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
        let result = yield rosca.startRound();
        let log = result.logs[0]
        let winnerAddress = log.args.winnerAddress;

        // winnerAddress's credit should be 0.5 + 3(defaultPot) * fee
        // requirement to get Out of debt = 3(currentRound) + 3(defaultPot) * fee
        // so credit must be at least = 3(currentRound) + 3(defaultPot) * fee - totalDiscount
        // so winnerAddress needs to contribute = 2.5 - totalDiscount
        let contributionToNonDelinquency = 2.5 * consts.CONTRIBUTION_SIZE - (yield rosca.totalDiscounts.call());
        yield utils.assertThrows(rosca.withdraw({from: winnerAddress}));
        // for some reason 1 is being rounded up so 10 is used instead
        yield rosca.contribute({from: winnerAddress, value: (contributionToNonDelinquency - 10)});
        yield utils.assertThrows(rosca.withdraw({from: winnerAddress}));
        yield rosca.contribute({from: winnerAddress, value: 10});
        yield rosca.withdraw({from: winnerAddress});
    }));
});
