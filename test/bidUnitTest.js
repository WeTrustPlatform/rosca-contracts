let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require("chai").assert;

contract('ROSCA bid Unit Test', function(accounts) {
    const MIN_START_DELAY = 86400 + 60;
    const ROUND_PERIOD_DELAY = 86400 * 3;
    const MEMBER_COUNT = 4;
    const CONTRIBUTION_SIZE = 1e16;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
    const FEE = 1 - 0.002;

    const ROUND_PERIOD_IN_DAYS = 3;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const SERVICE_FEE = 2;

    it("Throws when calling Bid with valid parameters before ROSCA starts", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        return rosca.bid(DEFAULT_POT, {from: accounts[1]}).then(function() {
            assert.isNotOk(true, "expected calling bid in round 0 to throw");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));

    it("Throws when calling bid without being in good Standing", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });
        yield rosca.startRound();

        return rosca.bid(DEFAULT_POT , {from: accounts[1]} ).then(function() {
            assert.isNotOk(true, "expected calling bid before contributing to throw");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));

    it("Throws Placing bid less than 65% of the Pot", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });
        yield rosca.startRound();
        yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE});
        const MIN_DISTRIBUTION_PERCENT = yield rosca.MIN_DISTRIBUTION_PERCENT.call();

        return rosca.bid(DEFAULT_POT * (MIN_DISTRIBUTION_PERCENT / 100 * 0.99) , {from: accounts[2]}).then(function() {
            assert.isNotOk(true, "expected placing bid less than MIN_DISTRIBUTION_PERCENT threshold to throw");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });

    }));

    it("generates a LogNewLowestBid event when placing a valid new bid", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);
        const BID_TO_PLACE = DEFAULT_POT * 0.94;

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });
        yield rosca.startRound();
        yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE});

        var bidEvent = rosca.LogNewLowestBid();
        var eventFired = false;
        bidEvent.watch(function(error, log) {
            bidEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.bid, BID_TO_PLACE, "Log doesn't show the proper bid value");
            assert.equal(log.args.winnerAddress, accounts[2], "Log doesn't show proper winnerAddress");
        });
        yield rosca.bid(BID_TO_PLACE , {from: accounts[2]});

        yield Promise.delay(300);
        assert.isOk(eventFired,"Bid event did not fire");

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [ROUND_PERIOD_DELAY],
            id: new Date().getTime()
        });
        yield rosca.startRound();

        var credit = (yield rosca.members.call(accounts[2]))[0];
        var expected_credit = CONTRIBUTION_SIZE + (BID_TO_PLACE * FEE);

        assert.equal(credit, expected_credit, "bid placed didn't affect winner's credit");
    }));

    it("Throws when placing a valid bid from paid member", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });
        yield rosca.startRound();
        yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE});
        yield rosca.bid(DEFAULT_POT, {from: accounts[2]});

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [ROUND_PERIOD_DELAY],
            id: new Date().getTime()
        });
        yield rosca.startRound();

        return rosca.bid(DEFAULT_POT, {from: accounts[2]}).then(function () {
            assert.isNotOk(true, "calling bid from paid member succeed, didn't throw");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));

    it("new Higher bid is ignored" , co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        const BID_PERCENT = 0.95;

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });
        yield rosca.startRound();
        yield rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE});
        yield rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE});
        yield rosca.bid(DEFAULT_POT * BID_PERCENT, {from: accounts[3]});
        yield rosca.bid(DEFAULT_POT , {from: accounts[1]});

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [ROUND_PERIOD_DELAY],
            id: new Date().getTime()
        });
        yield rosca.startRound();

        var credit = (yield rosca.members.call(accounts[1]))[0];
        var expected_credit = CONTRIBUTION_SIZE + (DEFAULT_POT * FEE);

        assert.notEqual(credit, expected_credit, "new higher bid won");
    }));
});