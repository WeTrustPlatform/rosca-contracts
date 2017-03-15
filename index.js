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


function getContractContents(filename) {
  let content = fs.readFileSync(path.join(__dirname, 'contracts/' + filename), 'utf8');
  return {contents: content};
}


let init = function() {
  let input = {'ROSCA.sol': getContractContents('ROSCA.sol').contents};
  let output = solc.compile({sources: input}, 1, getContractContents);
  let contractOutput = output.contracts['ROSCA.sol:ROSCA'];
  let roscaContractAbi = JSON.parse(contractOutput.interface);
  contractCache = {abi: roscaContractAbi, bytecode: contractOutput.bytecode};
};

init();

module.exports = WeTrustContract;
