var co = require("co").wrap;
let assert = require("chai").assert;

contract('ROSCA constructor Unit Test', function(accounts) {
    const CONTRIBUTION_SIZE = 1e17;
    const ROUND_PERIOD_IN_DAYS = 3;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const SERVICE_FEE = 20;

    it("Throws if ROUND_PERIOD_IN_DAYS < MIN_ROUND_PERIOD_IN_DAYS", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var twoDayFromNow = simulatedTimeNow + 86400 * 2 ;

        var deployed = ROSCATest.deployed();
        const MIN_ROUND_PERIOD = yield deployed.MIN_ROUND_PERIOD_IN_DAYS.call();

        return ROSCATest.new(MIN_ROUND_PERIOD.sub(1), CONTRIBUTION_SIZE,
                twoDayFromNow, MEMBER_LIST, SERVICE_FEE).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));

    it("Throws if ROUND_PERIOD_IN_DAYS >= MAX_ROUND_PERIOD_IN DAYS", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var twoDayFromNow = simulatedTimeNow + 86400 * 2 ;

        var deployed = ROSCATest.deployed();
        const MAX_ROUND_PERIOD = yield deployed.MAX_ROUND_PERIOD_IN_DAYS.call();

        return ROSCATest.new(MAX_ROUND_PERIOD.add(1), CONTRIBUTION_SIZE,
                twoDayFromNow, MEMBER_LIST, SERVICE_FEE).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));

    it("Throws if CONTRIBUTION_SIZE < MIN_CONTRIBUTION_SIZE", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var twoDayFromNow = simulatedTimeNow + 86400 * 2 ;

        var deployed = ROSCATest.deployed();
        const MIN_CONTRIBUTION_SIZE = yield deployed.MIN_CONTRIBUTION_SIZE.call();

        return ROSCATest.new(ROUND_PERIOD_IN_DAYS, MIN_CONTRIBUTION_SIZE.sub(1),
                twoDayFromNow, MEMBER_LIST, SERVICE_FEE).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));

    it("Throws if CONTRIBUTION_SIZE > MAX_CONTRIBUTION_SIZE", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var twoDayFromNow = simulatedTimeNow + 86400 * 2;

        var deployed = ROSCATest.deployed();
        var MAX_CONTRIBUTION_SIZE = yield deployed.MAX_CONTRIBUTION_SIZE.call();

        return ROSCATest.new(ROUND_PERIOD_IN_DAYS, MAX_CONTRIBUTION_SIZE.add(1),
                twoDayFromNow, MEMBER_LIST, SERVICE_FEE).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));

    it("Throws if MINIMUM_TIME_BEFORE_ROSCA_START < 1 day", function() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;

        var deployed = ROSCATest.deployed();
        var MINIMUM_TIME_BEFORE_ROSCA_START = yield deployed.MINIMUM_TIME_BEFORE_ROSCA_START.call();

        return ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE,
                MINIMUM_TIME_BEFORE_ROSCA_START - 1, MEMBER_LIST, SERVICE_FEE).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("Throws if feeInThousandths > MAX_FEE_IN_THOUSANTHS" , co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var twoDayFromNow = simulatedTimeNow + 86400 * 2 ;

        var deployed = ROSCATest.deployed();
        var MAX_FEE = yield deployed.MAX_FEE_IN_THOUSANDTHS.call();

        return ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE,
                twoDayFromNow, MEMBER_LIST, MAX_FEE.add(1)).then(function() {
            assert.isNotOk(true , "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));

    it("checks if ROSCA is created when valid parameters are passed", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var twoDayFromNow = simulatedTimeNow + 86400 * 2 ;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE,
                            twoDayFromNow, MEMBER_LIST, SERVICE_FEE);
        if (!rosca) {
            assert.isNotOk(true, "rosca with valid parameter is not working");
        }
    }));
});
