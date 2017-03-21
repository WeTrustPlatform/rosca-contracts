"use strict";

let utils = require("../../test/utils/utils.js");

/**
 * Runs a full ROSCA with a given number of participants (up to 10) and prints out
 * each transaction's gas usage, and also the maximum transaction gas usage.
 *
 * usage: truffle exec path/to/gas_usage.js <number of rosca participants>
 */
let accounts = web3.eth.accounts;
const ROSCA_START_TIME_DELAY = 86400 + 10;
const CONTRIBUTION_SIZE = 1e16;
let memberList;
const ROUND_PERIOD_IN_SECS = 100;

let maxGas = 0;
let maxMethod;


function createROSCA() {
  const SERVICE_FEE_IN_THOUSANDTHS = 2;

  let latestBlock = web3.eth.getBlock("latest");
  let blockTime = latestBlock.timestamp;
  return ROSCA.new(
      0 /* use ETH */,
      ROUND_PERIOD_IN_SECS, CONTRIBUTION_SIZE, blockTime + ROSCA_START_TIME_DELAY, memberList,
      SERVICE_FEE_IN_THOUSANDTHS);
}

function* runRosca(rosca, numParticipants) {
  // Get to the start of the ROSCA.
  utils.increaseTime(ROSCA_START_TIME_DELAY + 10);

  for (let round = 1; round <= numParticipants; round++) {
    yield utils.getGasUsage(rosca.startRound({from: accounts[0]}), "startRound");

    if (round > 1) {
      yield utils.getGasUsage(rosca.withdraw({from: accounts[round - 2]}), "withdraw");
    }

    for (let participant = 0; participant < numParticipants; participant++) {
      yield utils.getGasUsage(rosca.contribute({from: accounts[participant], value: CONTRIBUTION_SIZE}), "contribute");
    }

    yield utils.getGasUsage(rosca.bid(CONTRIBUTION_SIZE * (memberList.length + 1), {from: accounts[round - 1]}), "bid");
    utils.increaseTime(ROUND_PERIOD_IN_SECS);
  }
}

function getNumParticipants() {
  if (process.argv.length < 5) {
    console.log("usage: truffle exec path/to/gas_usage.js <number of rosca participants>");
    process.exit(1);
  }
  let numParticipants = Number(process.argv[4]);
  if (numParticipants < 1 || numParticipants > 10) {
    console.log("number of rosca participants has to be betwen 1 and 10");
    process.exit(1);
  }
  return numParticipants;
}

function registerTransaction(gasUsed, method) {
  console.log("gasUsed for " + method + ": " + gasUsed);
  if (gasUsed > maxGas) {
    maxGas = gasUsed;
    maxMethod = method;
  }
}

function serializeYieldsAndGetMaxGas(gen, cb) {

  // Serialize the yields using recursion (ugh).
  function nextYield() {
    let iter = gen.next();
    if (iter.done) {
      cb(maxGas, maxMethod);
      return;
    }
    iter.value.then(function(result) {
      registerTransaction(result.gasUsed, result.extraData);
      nextYield();
    });
  }

  // Call the first nextYield().
  nextYield();
}

module.exports = function() {

  let numParticipants = getNumParticipants();

  utils.setWeb3(web3);

  // First mine one block to reset testrpc of any leftovers.
  utils.mineOneBlock();

  memberList = accounts.slice(1, numParticipants);
  createROSCA().then(function(rosca) {
    let gasUsed = web3.eth.getTransactionReceipt(rosca.transactionHash).gasUsed;
    registerTransaction(gasUsed, "deploy contract");
    serializeYieldsAndGetMaxGas(runRosca(rosca, numParticipants), function(maxGas, maxMethod) {
      console.log(
        "\n\n(" + numParticipants + " participants): max gas was used for " + maxMethod + " - " + maxGas);
    });
  });
};
