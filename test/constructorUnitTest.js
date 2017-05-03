"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('./utils/consts')

contract('ROSCA constructor Unit Test', function(accounts) {
    before(function () {
        consts.setMemberList(accounts)
    })

    it("Throws if consts.ROUND_PERIOD_IN_SECS == 0", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        yield utils.assertThrows(ROSCATest.new(
            0 /* use ETH */, 0 /* roundTimeInSecs */, consts.CONTRIBUTION_SIZE,
            blockTime + consts.START_TIME_DELAY, consts.MEMBER_LIST(), consts.SERVICE_FEE_IN_THOUSANDTHS),
            "contract creation successful");
    }));

    it("Throws if startTime > now - MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let deployed = yield ROSCATest.deployed();
        let MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS =
            (yield deployed.MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS.call()).toNumber();

        yield utils.assertThrows(ROSCATest.new(
            0 /* use ETH */, consts.ROUND_PERIOD_IN_SECS, consts.CONTRIBUTION_SIZE,
            blockTime - MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS - 1, consts.MEMBER_LIST(),
            consts.SERVICE_FEE_IN_THOUSANDTHS));
    }));

    it("Throws if feeInThousandths > MAX_FEE_IN_THOUSANTHS", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let deployed = yield ROSCATest.deployed();
        let MAX_FEE = yield deployed.MAX_FEE_IN_THOUSANDTHS.call();

        yield utils.assertThrows(ROSCATest.new(
            0 /* use ETH */,
            consts.ROUND_PERIOD_IN_SECS, consts.CONTRIBUTION_SIZE, blockTime + consts.START_TIME_DELAY, consts.MEMBER_LIST(),
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
            consts.ROUND_PERIOD_IN_SECS, consts.CONTRIBUTION_SIZE, blockTime + consts.START_TIME_DELAY, consts.MEMBER_LIST(),
            consts.SERVICE_FEE_IN_THOUSANDTHS);

        if (!rosca) {
            assert.isNotOk(true, "rosca with valid parameter is not working");
        }
    }));
});
