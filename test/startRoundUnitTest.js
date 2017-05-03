"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts')

contract('ROSCA startRound Unit Test', function(accounts) {
    before(function () {
        consts.setMemberList(accounts)
    })

    it("watches for LogstartOfRound event", co(function* () {
        let rosca = yield utils.createEthROSCA();

        utils.increaseTime(consts.START_TIME_DELAY);
        let result = yield rosca.startRound();
        let log = result.logs[0]

        assert.equal(log.args.currentRound, 1, "Log didnt show currentRound properly");
    }));

    it("watches for LogEndOfROSCA event", co(function* () {
        let rosca = yield utils.createEthROSCA();

        let eventFired = false;
        let endOfRoscaEvent = rosca.LogEndOfROSCA();  // eslint-disable-line new-cap
        endOfRoscaEvent.watch(function(error, log) {
            endOfRoscaEvent.stopWatching();
            eventFired = true;
        });

        for (let i = 0; i < consts.MEMBER_COUNT() + 1; i++) { // +1, to startRound
            utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
            yield rosca.startRound();
            assert.isNotOk(eventFired);
        }

        yield Promise.delay(1000); // 1000ms delay to allow the event to fire properly
        assert.isOk(eventFired, "endOfROSCA event didn't fire");
    }));

    it("Throws when calling startRound before roundStartTime (including round = 0)", co(function* () {
        let rosca = yield utils.createEthROSCA();

        for (let i = 0; i < consts.MEMBER_COUNT() + 1; i++) {
            yield utils.assertThrows(rosca.startRound(), "expected calling startRound before roundStartTime to throw");

            yield rosca.contribute({from: accounts[2], value: consts.CONTRIBUTION_SIZE});

            utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
            yield rosca.startRound();
        }
        assert.isOk(yield rosca.endOfROSCA.call());  // Unfortunately, we need to check the internal var directly.
    }));
});
