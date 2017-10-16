"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let roscaHelper;

contract('ROSCA startRound Unit Test', function(accounts) {
    before(function() {
      consts.setMemberList(accounts);
    });

    beforeEach(co(function* () {
      roscaHelper = new ROSCAHelper(accounts, (yield utils.createEthROSCA()));
    }));

  it("checks that round 1 can be longer one roundPeriod", co(function* () {
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield utils.assertThrows(roscaHelper.startRound(),
      "expected calling startRound before roundStartTime to throw");
    utils.increaseTime(consts.START_TIME_DELAY);
    yield roscaHelper.startRound();
  }));

    it("watches for LogstartOfRound event", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY + consts.ROUND_PERIOD_IN_SECS);
        let result = yield roscaHelper.startRound();
        let log = result.logs[1];

        assert.equal(log.args.currentRound.toString(), 2, "Log didnt show currentRound properly");
    }));

    it("watches for LogEndOfROSCA event", co(function* () {
        let eventFired = false;
        let endOfRoscaEvent = roscaHelper.getCurrentRosca().LogEndOfROSCA();  // eslint-disable-line new-cap
        endOfRoscaEvent.watch(function(error, log) {
            endOfRoscaEvent.stopWatching();
            eventFired = true;
        });
        utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

        for (let i = 0; i < consts.memberCount(); i++) { // +1, to startRound
            utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
            yield roscaHelper.startRound();
            assert.isNotOk(eventFired);
        }

        yield Promise.delay(1000); // 1000ms delay to allow the event to fire properly
        assert.isOk(eventFired, "endOfROSCA event didn't fire");
    }));

    it("Throws when calling startRound before roundStartTime", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY);
        for (let i = 0; i < consts.memberCount(); i++) {
            yield utils.assertThrows(roscaHelper.startRound(),
              "expected calling startRound before roundStartTime to throw");

            yield roscaHelper.contribute(2, consts.CONTRIBUTION_SIZE);

            utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
            yield roscaHelper.startRound();
        }
        // Unfortunately, we need to check the internal var directly.
        assert.isOk(yield roscaHelper.getCurrentRosca().endOfROSCA.call());
    }));
});
