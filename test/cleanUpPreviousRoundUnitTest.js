var Promise = require("bluebird");
var co = require("co").wrap;

contract('ROSCA cleanUpPreviousRound Unit Test', function(accounts) {
    const MIN_START_DELAY = 86400 + 20;
    const MEMBER_COUNT = 4;
    const CONTRIBUTION_SIZE = 1e16;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
    const FEE = (1 - 0.002);

    const ROUND_PERIOD_IN_DAYS = 3;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const SERVICE_FEE = 2;

    it("checks if totalDiscount is added when lowestBid < DEFAULT_POT", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        const BID_PERCENT = 0.75;

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });

        yield Promise.all([
            rosca.startRound(), // needed to set lowestBid value + winnerAddress to 0
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.bid(DEFAULT_POT * BID_PERCENT, {from: accounts[0]})
        ]);

        yield rosca.cleanUpPreviousRound();

        var discount = yield rosca.totalDiscounts.call();

        return assert.equal(discount, DEFAULT_POT * (1 - BID_PERCENT), "toalDiscount value didn't get added properly");
    }));

    it("watches for LogRoundFundsReleased event and check if winner gets proper values", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        const BID_PERCENT = 0.68;

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.bid(DEFAULT_POT * BID_PERCENT, {from: accounts[1]})
        ]);
        var eventFired = false;
        var fundsReleasedEvent = rosca.LogRoundFundsReleased();

        fundsReleasedEvent.watch(co(function *(error,log) {
            fundsReleasedEvent.stopWatching();
            eventFired = true;

            var user = yield rosca.members.call(log.args.winnerAddress);
            assert.equal(accounts[1], log.args.winnerAddress);
            assert.isOk(user[2], "chosen address is not a member"); // user.alive
            assert.isOk(user[1], "Paid member was chosen"); // user.paid
            assert.equal(user[0].toString(), CONTRIBUTION_SIZE + DEFAULT_POT * BID_PERCENT * FEE, "winningBid is not Default_POT"); // user.credit
        }));

        yield rosca.cleanUpPreviousRound();

        yield Promise.delay(100);
        assert.isOk(eventFired);
    }));

    it("checks if random unpaid member in good Standing is picked when no bid was placed", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10 ;
        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}), // member 0 will be eligible to win the pot if no bid was placed
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}), // member 2 will be eligible to win the pot if no bid was placed
        ]);
        var winner;
        var possibleWinner = [accounts[0], accounts[2]];
        var winnerAddress = 0;

        var eventFired = false;
        var fundsReleasedEvent = rosca.LogRoundFundsReleased();
        fundsReleasedEvent.watch(co(function *(error,log) {
            fundsReleasedEvent.stopWatching();
            eventFired = true;
            winnerAddress = log.args.winnerAddress;
            winner = yield rosca.members.call(log.args.winnerAddress);
        }));

        yield rosca.cleanUpPreviousRound();

        yield Promise.delay(300);
        assert.isOk(eventFired, "LogRoundFundReleased didn't occur");
        assert.include(possibleWinner, winnerAddress, "Non eligible member won the pot");
        assert.equal(winner[0], CONTRIBUTION_SIZE + DEFAULT_POT * FEE, "lowestBid is not deposited into winner's credit"); // winner.credit
        assert.isOk(winner[3], "a non member was chosen when there were no bids")
    }));
});