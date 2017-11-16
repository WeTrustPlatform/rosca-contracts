"use strict";

let co = require("co").wrap;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let rosca;

contract('lottery ROSCA Test', function(accounts) {
  before(function() {
    consts.setMemberList(accounts);
  });

  beforeEach(co(function* () {
    rosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA(consts.memberList(), 1)));
  }));

  it("Checks that calling bid throws in a valid scenario for bidding ROSCA", co(function* () {
    const VALID_BID = 0.98 * consts.defaultPot();
    utils.increaseTime(consts.START_TIME_DELAY);

    yield utils.assertRevert(rosca.bid(1, VALID_BID));
    yield rosca.contribute(0, consts.CONTRIBUTION_SIZE);
    yield utils.assertRevert(rosca.bid(0, VALID_BID));
  }));
});
