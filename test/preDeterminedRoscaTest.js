"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let rosca;


contract('Pre-Ordered ROSCA Test', function(accounts) {
  const MEMBER_LIST = [accounts[2], accounts[4], accounts[7], accounts[0]];

  beforeEach(co(function* () {
    rosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA(MEMBER_LIST, 2)));
    consts.setMemberList(MEMBER_LIST);
  }));

  it("Checks that calling bid throws in a valid scenario for bidding ROSCA", co(function* () {
    const VALID_BID = 0.98 * consts.defaultPot();

    yield utils.assertThrows(rosca.bid(0, VALID_BID));
    yield rosca.contribute(0, consts.CONTRIBUTION_SIZE);
    yield utils.assertThrows(rosca.bid(0, VALID_BID));
  }));

  it("Checks that winners for each round follows the Pre Ordered List", co(function* () {
    utils.increaseTime(consts.START_TIME_DELAY);
    yield rosca.contribute(0, consts.defaultPot());
    yield rosca.contribute(2, consts.defaultPot());
    yield rosca.contribute(4, consts.defaultPot());
    yield rosca.contribute(7, consts.defaultPot());

    for (let i = 0; i < consts.memberCount() - 1; i++) {
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
      let receipt = yield rosca.startRound();
      let log = receipt.logs[0];
      assert.equal(log.args.winnerAddress, MEMBER_LIST[i]);
    }
  }));
});
