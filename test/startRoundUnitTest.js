var Promise = require('bluebird');
var co = require("co").wrap;
contract('ROSCA startRound Unit Test', function(accounts) {
    const MIN_START_DELAY = 86400 + 60;
    const ROUND_PERIOD_DELAY = 86400 * 3;
    const MEMBER_COUNT = 4;
    const CONTRIBUTION_SIZE = 1e16;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;

    const ROUND_PERIOD_IN_DAYS = 3;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const SERVICE_FEE = 2;

    it("watches for LogstartOfRound event", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        var eventFired = false;
        var startOfRoundEvent = rosca.LogStartOfRound();

        startOfRoundEvent.watch(function(error,log){
            startOfRoundEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.currentRound, 1, "Log didnt show currentRound properly");
        });
        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [ROUND_PERIOD_DELAY],
            id: new Date().getTime()
        });

        yield rosca.startRound();
        yield Promise.delay(300);

        assert.isOk(eventFired, "startOfRound event didn't fire");
    }));

    it("Throws when calling startRound before roundStartTime (including round = 0)", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        for (var i = 0 ; i < MEMBER_COUNT + 1; i++) {
            yield rosca.startRound().then(function () {
                assert.isNotOk(true, "expected calling startRound before roundStartTime to throw");
            }).catch(function (e) {
                assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            });

            yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE});

            web3.currentProvider.send({
                jsonrpc: "2.0",
                method: "evm_increaseTime",
                params: [ROUND_PERIOD_DELAY],
                id: new Date().getTime()
            });
            yield rosca.startRound();
        }
        // checks if endOfROSCA has been set to true by calling contribute which should throw
        yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}).then(function() {
            assert.isNotOk(true, "Calling contribute after ROSCA ended was expected to throw");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));
});