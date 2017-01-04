var fs = require('fs');
let solc = require('solc');

let contractCache;
let contractErr;

let WeTrustContract = {
  /**
   * Call this function upon server start. It reads and compiles the contract, and saves it in a cache variable.
   * Throws if there was an error.
   */
  init: function() {
    let roscaContractLocation = 'contracts/ROSCA.sol';

    fs.readFile(roscaContractLocation, 'utf8', function(err, contractCode) {
      if (err) {
        contractErr = err;
        throw Error(err);
      } else {
        let output = solc.compile(contractCode, 1);
        let roscaContractAbi = JSON.parse(output.contracts.ROSCA.interface);
        let bytecode = output.contracts.ROSCA.bytecode;
        contractCache = {abi: roscaContractAbi, bytecode: bytecode};
      }
    });
  },

  /**
   * Returns a compiled version of the ROSCA contract:
   * {
   *   abi: an object version (not JSON) of the contract's ABI.
   *   bytecode: the bytecode of the contract.
   * }
   */
  getContract: function(done) {
    if (contractErr) {
      done(contractErr);
    } else {
      done(undefined, contractCache);
    }
  }
};

module.exports = WeTrustContract;
