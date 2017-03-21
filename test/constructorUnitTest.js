"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA constructor Unit Test', function(accounts) {
    // Parameters for new ROSCA creation
    const ROUND_PERIOD_IN_SECS = 100;
    const MEMBER_LIST = [accounts[1], accounts[2], accounts[3]];
    const CONTRIBUTION_SIZE = 1e16;
    const SERVICE_FEE_IN_THOUSANDTHS = 2;
    const START_TIME_DELAY = 10; // 10 seconds buffer

    it("Throws if ROUND_PERIOD_IN_SECS == 0", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        yield utils.assertThrows(ROSCATest.new(
            0 /* use ETH */, 0 /* roundTimeInSecs */, CONTRIBUTION_SIZE,
            blockTime + START_TIME_DELAY, MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS),
            "contract creation successful");
    }));

    it("Throws if startTime > now - MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let deployed = ROSCATest.deployed();
        let MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS =
            (yield deployed.MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS.call()).toNumber();

        yield utils.assertThrows(ROSCATest.new(
            0 /* use ETH */, ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE,
            blockTime - MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS - 1, MEMBER_LIST,
            SERVICE_FEE_IN_THOUSANDTHS));
    }));

    it("Throws if feeInThousandths > MAX_FEE_IN_THOUSANTHS", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let deployed = ROSCATest.deployed();
        let MAX_FEE = yield deployed.MAX_FEE_IN_THOUSANDTHS.call();

        yield utils.assertThrows(ROSCATest.new(
            0 /* use ETH */,
            ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, MEMBER_LIST,
            MAX_FEE.add(1)), "contract creation successful");
    }));

    it("checks if ROSCA is created when valid parameters are passed", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        // Note we only check ETH ROSCA creation as the constructor simply does not care
        // about whether or not ROSCA uses a token contract.
        let rosca = yield ROSCATest.new(
            0 /* use ETH */,
            ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, MEMBER_LIST,
            SERVICE_FEE_IN_THOUSANDTHS);

        if (!rosca) {
            assert.isNotOk(true, "rosca with valid parameter is not working");
        }
    }));
});
