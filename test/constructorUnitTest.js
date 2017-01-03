"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA constructor Unit Test', function(accounts) {
    // Parameters for new ROSCA creation
    const ROUND_PERIOD_IN_DAYS = 3;
    const MIN_DAYS_BEFORE_START = 1;
    const MEMBER_LIST = [accounts[1], accounts[2], accounts[3]];
    const CONTRIBUTION_SIZE = 1e16;
    const SERVICE_FEE_IN_THOUSANDTHS = 2;
    const START_TIME_DELAY = 86400 * MIN_DAYS_BEFORE_START + 10; // 10 seconds buffer

    it("Throws if ROUND_PERIOD_IN_DAYS < MIN_ROUND_PERIOD_IN_DAYS", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let deployed = ROSCATest.deployed();
        const MIN_ROUND_PERIOD = yield deployed.MIN_ROUND_PERIOD_IN_DAYS.call();
        yield utils.assertThrows(ROSCATest.new(
            MIN_ROUND_PERIOD.sub(1), CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, MEMBER_LIST,
            SERVICE_FEE_IN_THOUSANDTHS), "contract creation successful");
    }));

    it("Throws if ROUND_PERIOD_IN_DAYS >= MAX_ROUND_PERIOD_IN DAYS", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let deployed = ROSCATest.deployed();
        const MAX_ROUND_PERIOD = yield deployed.MAX_ROUND_PERIOD_IN_DAYS.call();

        yield utils.assertThrows(ROSCATest.new(
            MAX_ROUND_PERIOD.add(1), CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, MEMBER_LIST,
            SERVICE_FEE_IN_THOUSANDTHS), "contract creation successful");
    }));

    it("Throws if CONTRIBUTION_SIZE < MIN_CONTRIBUTION_SIZE", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let deployed = ROSCATest.deployed();
        const MIN_CONTRIBUTION_SIZE = yield deployed.MIN_CONTRIBUTION_SIZE.call();

        yield utils.assertThrows(ROSCATest.new(
            ROUND_PERIOD_IN_DAYS, MIN_CONTRIBUTION_SIZE.sub(1), blockTime + START_TIME_DELAY, MEMBER_LIST,
            SERVICE_FEE_IN_THOUSANDTHS), "contract creation successful");
    }));

    it("Throws if CONTRIBUTION_SIZE > MAX_CONTRIBUTION_SIZE", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let deployed = ROSCATest.deployed();
        let MAX_CONTRIBUTION_SIZE = yield deployed.MAX_CONTRIBUTION_SIZE.call();

        yield utils.assertThrows(ROSCATest.new(
            ROUND_PERIOD_IN_DAYS, MAX_CONTRIBUTION_SIZE.add(1), blockTime + START_TIME_DELAY, MEMBER_LIST,
            SERVICE_FEE_IN_THOUSANDTHS), "contract creation successful");
    }));

    it("Throws if startTime < now + MINIMUM_TIME_BEFORE_ROSCA_START", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let deployed = ROSCATest.deployed();
        let MINIMUM_TIME_BEFORE_ROSCA_START = yield deployed.MINIMUM_TIME_BEFORE_ROSCA_START.call();

        yield utils.assertThrows(ROSCATest.new(
            ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, blockTime + MINIMUM_TIME_BEFORE_ROSCA_START / 2, MEMBER_LIST,
            SERVICE_FEE_IN_THOUSANDTHS));
    }));

    it("Throws if feeInThousandths > MAX_FEE_IN_THOUSANTHS", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let deployed = ROSCATest.deployed();
        let MAX_FEE = yield deployed.MAX_FEE_IN_THOUSANDTHS.call();

        yield utils.assertThrows(ROSCATest.new(
            ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, MEMBER_LIST,
            MAX_FEE.add(1)), "contract creation successful");
    }));

    it("checks if ROSCA is created when valid parameters are passed", co(function* () {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;

        let rosca = yield ROSCATest.new(
            ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, MEMBER_LIST,
            SERVICE_FEE_IN_THOUSANDTHS);

        if (!rosca) {
            assert.isNotOk(true, "rosca with valid parameter is not working");
        }
    }));
});
