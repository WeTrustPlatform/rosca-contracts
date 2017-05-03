"use strict";
let memberList;
module.exports = {

  MAX_GAS_COST_PER_TX: 1e5 /* gas used per tx */ * 2e10, /* gas price */  // keep in sync with truffle.js
  ROUND_PERIOD_IN_SECS: 100,
  CONTRIBUTION_SIZE: 1e16,
  MEMBER_LIST: function() {
    if(!memberList) {
      console.log('Member list needs to be set first before calling MEMBER_LIST')
    }
    return memberList
  },
  setMemberList: function(accounts) {
    memberList = [accounts[1], accounts[2], accounts[3]]
  },
  MEMBER_COUNT: function() {
    return memberList.length + 1
  },
  DEFAULT_POT : function() {
    return (this.CONTRIBUTION_SIZE * this.MEMBER_COUNT())
  },
  SERVICE_FEE_IN_THOUSANDTHS: 2,
  START_TIME_DELAY: 10,
};
