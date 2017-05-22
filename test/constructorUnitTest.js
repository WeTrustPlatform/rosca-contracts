"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('./utils/consts');

let latestBlock;
let blockTime;

contract('ROSCA constructor Unit Test', function(accounts) {
    before(function() {
        consts.setMemberList(accounts);
    });

    beforeEach(function() {
      utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

      latestBlock = web3.eth.getBlock("latest");
      blockTime = latestBlock.timestamp;
    });

    it("Throws if consts.ROUND_PERIOD_IN_SECS == 0", co(function* () {
        yield utils.assertThrows(ROSCATest.new(
            0 /* use ETH */, 0 /* roundTimeInSecs */, consts.CONTRIBUTION_SIZE,
            blockTime + consts.START_TIME_DELAY, consts.memberList(), consts.SERVICE_FEE_IN_THOUSANDTHS),
            "contract creation successful");
    }));

    it("Throws if startTime > now - MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS", co(function* () {
        let deployed = yield ROSCATest.deployed();
        let MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS =
            (yield deployed.MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS.call()).toNumber();

        yield utils.assertThrows(ROSCATest.new(
            0 /* use ETH */, consts.ROUND_PERIOD_IN_SECS, consts.CONTRIBUTION_SIZE,
            blockTime - MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS - 1, consts.memberList(),
            consts.SERVICE_FEE_IN_THOUSANDTHS));
    }));

    it("Throws if feeInThousandths > MAX_FEE_IN_THOUSANTHS", co(function* () {
        let deployed = yield ROSCATest.deployed();
        let MAX_FEE = yield deployed.MAX_FEE_IN_THOUSANDTHS.call();

        yield utils.assertThrows(ROSCATest.new(
            0 /* use ETH */,
            consts.ROUND_PERIOD_IN_SECS, consts.CONTRIBUTION_SIZE,
            blockTime + consts.START_TIME_DELAY, consts.memberList(),
            MAX_FEE.add(1)), "contract creation successful");
    }));

    it("checks if ROSCA is created when valid parameters are passed", co(function* () {
        // Note we only check ETH ROSCA creation as the constructor simply does not care
        // about whether or not ROSCA uses a token contract.
        let rosca = yield ROSCATest.new(
            0 /* use ETH */,
            consts.ROUND_PERIOD_IN_SECS, consts.CONTRIBUTION_SIZE,
            blockTime + consts.START_TIME_DELAY, consts.memberList(),
            consts.SERVICE_FEE_IN_THOUSANDTHS);

        if (!rosca) {
            assert.isNotOk(true, "rosca with valid parameter is not working");
        }
    }));
});
