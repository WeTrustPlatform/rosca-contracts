'use strict';

let fs = require('fs');
let solc = require('solc');
let path = require('path');

let contractCache;

let WeTrustContract = {
  /**
   * Returns a compiled version of the ROSCA contract:
   * {
   *   abi: an object version (not JSON) of the contract's ABI.
   *   bytecode: the bytecode of the contract.
   * }
   */
  getContract: function() {
    if (!contractCache) {
      throw Error("unexpected error, contract was not compiled");
    }
    return contractCache;
  },
};

let init = function() {
  let roscaContractLocation = path.join(__dirname, 'contracts/ROSCA.sol');

  let contractCode = fs.readFileSync(roscaContractLocation, 'utf8');
  let output = solc.compile(contractCode, 1);
  let roscaContractAbi = JSON.parse(output.contracts.ROSCA.interface);
  let bytecode = output.contracts.ROSCA.bytecode;
  contractCache = {abi: roscaContractAbi, bytecode: bytecode};
};

init();

module.exports = WeTrustContract;