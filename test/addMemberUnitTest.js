"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let roscaHelper;

contract('ROSCA addMember Unit Test', function(accounts) {
    // Parameters for new ROSCA creation
    before(function() {
      consts.setMemberList(accounts);
    });

    beforeEach(co(function* () {
        roscaHelper = new ROSCAHelper(accounts, (yield utils.createEthROSCA()));
    }));

    it("throws when adding an existing member", co(function* () {
        yield utils.assertRevert(roscaHelper.addMember(1),
            "adding existing member succeed when it should have thrown");
    }));

    it("checks member get added properly", co(function* () {
        // try contributing from a non-member to make sure membership hasn't been established
        yield utils.assertRevert(roscaHelper.contribute(4, consts.CONTRIBUTION_SIZE),
            "expected calling contribute from non-member to throw");

        yield roscaHelper.addMember(accounts[4]);
        yield roscaHelper.contribute(4, consts.CONTRIBUTION_SIZE);

        let credit = yield roscaHelper.userCredit(4);

        assert.equal(credit, consts.CONTRIBUTION_SIZE, "newly added member couldn't contribute"); // user.credit
    }));
});
