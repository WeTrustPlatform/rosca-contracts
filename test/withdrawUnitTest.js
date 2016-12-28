"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA withdraw Unit Test', function(accounts) {
    // Parameters for new ROSCA creation
    const ROUND_PERIOD_IN_DAYS = 3;
    const MIN_DAYS_BEFORE_START = 1;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const CONTRIBUTION_SIZE = 1e16;
    const SERVICE_FEE_IN_THOUSANDTHS = 2;

    const MEMBER_COUNT = MEMBER_LIST.length + 1;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
    const START_TIME_DELAY = 86400 * MIN_DAYS_BEFORE_START + 10; // 10 seconds buffer
    const ROUND_PERIOD_DELAY = 86400 * ROUND_PERIOD_IN_DAYS;


    it("Throws when calling withdraw from a non-member", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        yield Promise.all([
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE}),
            rosca.withdraw({from: accounts[0]}),
            rosca.withdraw({from: accounts[1]}),
            rosca.withdraw({from: accounts[2]}),
            rosca.withdraw({from: accounts[3]})
        ]);

        yield utils.assertThrows(rosca.withdraw({from: accounts[4]}),
            "expected calling withdraw from a non-member to throw");
    }));

    it("Watches for event LogFundsWithdrawal()", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const ACTUAL_CONTRIBUTION = CONTRIBUTION_SIZE * 0.8;

        yield rosca.contribute({from: accounts[0], value: ACTUAL_CONTRIBUTION});

        let eventFired = false;
        let fundsWithdrawalEvent = rosca.LogFundsWithdrawal();
        fundsWithdrawalEvent.watch(function(error, log) {
            fundsWithdrawalEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.user, accounts[0], "LogContributionMade doesn't display proper user value");
            assert.equal(log.args.amount.toNumber(), ACTUAL_CONTRIBUTION / 1000 * (1000 - SERVICE_FEE_IN_THOUSANDTHS),
                "LogContributionMade doesn't display proper amount value");
        });

        yield rosca.withdraw({from: accounts[0]});

        yield Promise.delay(300); // 300ms delay to allow the event to fire properly
        assert.isOk(eventFired, "LogContributionMade didn't fire");
    }));

    it("Throws when calling withdraw when totalDebit > totalCredit", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE * 0.8})
        ]);

        yield utils.assertThrows(rosca.withdraw({from: accounts[2]}),
            "expected calling withdraw when totalDebit is greater than totalCredit to throw");
    }));

    it("fires LogCannotWithdrawFully when contract balance is less than what the user is entitled to", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}), // contract's balance = CONTRIBUTION_SIZE
            rosca.bid(DEFAULT_POT, {from: accounts[2]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound(); // 2nd Member will be entitled to DEFAULT_POT which is greater than CONTRIBUTION_SIZE

        let withdrewAmount = 0;
        let creditBefore = (yield rosca.members.call(accounts[2]))[0];
        let memberBalanceBefore = web3.eth.getBalance(accounts[2]).toNumber();

        let eventFired = false;
        let withdrawalEvent = rosca.LogCannotWithdrawFully();
        withdrawalEvent.watch(function(error,log){
            withdrewAmount = log.args.contractBalance;
            withdrawalEvent.stopWatching();
            eventFired = true;
        });

        yield rosca.withdraw({from: accounts[2]});

        yield Promise.delay(300); // 300ms delay to allow the event to fire properly
        assert.isOk(eventFired, "LogCannotWithrawFully event did not fire");

        let creditAfter = (yield rosca.members.call(accounts[2]))[0];
        let memberBalanceAfter = web3.eth.getBalance(accounts[2]).toNumber();
        let contractCredit = yield utils.contractNetCredit(rosca);

        assert.equal(contractCredit, 0);
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter, 
        creditBefore - (withdrewAmount * 1000 / (1000 - SERVICE_FEE_IN_THOUSANDTHS)), 
        "partial withdraw didn't work properly");
    }));

    it("checks withdraw when the contract balance is more than what the user is entitled to", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE * 3}),
            rosca.bid(DEFAULT_POT, {from: accounts[2]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);
        rosca.startRound();

        let memberBalanceBefore = web3.eth.getBalance(accounts[2]).toNumber();

        yield rosca.withdraw({from: accounts[2]});

        let creditAfter = (yield rosca.members.call(accounts[2]))[0];
        let currentRound = yield rosca.currentRound.call();
        let memberBalanceAfter = web3.eth.getBalance(accounts[2]).toNumber();
        let contractCredit = web3.eth.getBalance(rosca.address).toNumber();

        assert.isAbove(contractCredit, 0); // contract should have some balance leftover after the withdraw
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter, currentRound * CONTRIBUTION_SIZE, "withdraw doesn't send the right amount");
    }));

    it("withdraw when contract can't send what the user is entitled while totalDiscount != 0", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            // to make sure contract's balance is less than winning bid
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE * 0.3}),
            rosca.bid(DEFAULT_POT * 0.80, {from: accounts[2]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();

        let withdrewAmount = 0;
        let creditBefore = (yield rosca.members.call(accounts[2]))[0];
        let memberBalanceBefore = web3.eth.getBalance(accounts[2]).toNumber();

        let eventFired = false;
        let withdrawalEvent = rosca.LogCannotWithdrawFully();
        withdrawalEvent.watch(function(error,log){
            withdrewAmount = log.args.contractBalance;
            withdrawalEvent.stopWatching();
            eventFired = true;
        });

        yield rosca.withdraw({from: accounts[2]});

        yield Promise.delay(300);
        assert.isOk(eventFired, "LogCannotWithdrawFully didn't fire");

        let creditAfter = (yield rosca.members.call(accounts[2]))[0];
        let memberBalanceAfter = web3.eth.getBalance(accounts[2]).toNumber();
        let contractCredit = yield utils.contractNetCredit(rosca);

        assert.equal(contractCredit, 0);
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter.toNumber(), 
            creditBefore - withdrewAmount * 1000 / (1000 - SERVICE_FEE_IN_THOUSANDTHS), 
            "partial withdraw didn't work properly");
    }));

    it("withdraw when the contract can send what the user is entitled to while totalDiscount != 0", co(function *() {
        let rosca = yield utils.createROSCA(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
            MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS);

        const BID_TO_PLACE = DEFAULT_POT * 0.80;

        utils.increaseTime(START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.bid(BID_TO_PLACE, {from: accounts[2]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();

        let memberBalanceBefore = web3.eth.getBalance(accounts[2]).toNumber();

        yield rosca.withdraw({from: accounts[2]});

        let creditAfter = (yield rosca.members.call(accounts[2]))[0];
        let currentRound = yield rosca.currentRound.call();
        let totalDiscount = DEFAULT_POT - BID_TO_PLACE;
        let expectedCredit = (currentRound * CONTRIBUTION_SIZE) - (totalDiscount / MEMBER_COUNT);

        let memberBalanceAfter = web3.eth.getBalance(accounts[2]).toNumber();
        let contractCredit = web3.eth.getBalance(rosca.address).toNumber();

        assert.isAbove(contractCredit, 0); // If this fails, there is a bug in the test.
        assert.isAbove(memberBalanceAfter, memberBalanceBefore);
        assert.equal(creditAfter, expectedCredit , "withdraw doesn't send the right amount");
    }));
});