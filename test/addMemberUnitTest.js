"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA addMember Unit Test', function(accounts) {
    // Parameters for new ROSCA creation
    const ROUND_PERIOD_IN_SECS = 100;
    const MEMBER_LIST = [accounts[1], accounts[2], accounts[3]];
    const CONTRIBUTION_SIZE = 1e16;
    const SERVICE_FEE_IN_THOUSANDTHS = 2;
    const START_TIME_DELAY = 10; // 10 seconds buffer

    it("throws when adding an existing member", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        yield utils.assertThrows(rosca.addMember(accounts[1]),
            "adding existing member succeed when it should have thrown");
    }));

    it("checks member get added properly", co(function* () {
        let rosca = yield utils.createEthROSCA(ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        // try contributing from a non-member to make sure membership hasn't been established
        yield utils.assertThrows(rosca.contribute({from: accounts[4], value: CONTRIBUTION_SIZE}),
            "expected calling contribute from non-member to throw");

        yield rosca.addMember(accounts[4]);
        yield rosca.contribute({from: accounts[4], value: CONTRIBUTION_SIZE});

        let credit = (yield rosca.members.call(accounts[4]))[0];

        assert.equal(credit, CONTRIBUTION_SIZE, "newly added member couldn't contribute"); // user.credit
    }));
});
