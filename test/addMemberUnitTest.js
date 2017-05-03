"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('./utils/consts')

contract('ROSCA addMember Unit Test', function(accounts) {
    // Parameters for new ROSCA creation
    before(function () {
      consts.setMemberList(accounts)
    })

    it("throws when adding an existing member", co(function* () {
        let rosca = yield utils.createEthROSCA();

        yield utils.assertThrows(rosca.addMember(accounts[1]),
            "adding existing member succeed when it should have thrown");
    }));

    it("checks member get added properly", co(function* () {
        let rosca = yield utils.createEthROSCA();

        // try contributing from a non-member to make sure membership hasn't been established
        yield utils.assertThrows(rosca.contribute({from: accounts[4], value: consts.CONTRIBUTION_SIZE}),
            "expected calling contribute from non-member to throw");

        yield rosca.addMember(accounts[4]);
        yield rosca.contribute({from: accounts[4], value: consts.CONTRIBUTION_SIZE});

        let credit = (yield rosca.members.call(accounts[4]))[0];

        assert.equal(credit, consts.CONTRIBUTION_SIZE, "newly added member couldn't contribute"); // user.credit
    }));
});
