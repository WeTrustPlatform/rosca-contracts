let fs = require('fs');
let solc = require('solc');
let path = require('path');

let contractCache;

let WeTrustContract = {
  /**
   * Call this function upon server start. It reads and compiles the contract, and saves it in a cache variable.
   * Throws if there was an error.
   */
  init: function(done) {
    let roscaContractLocation = path.join(__dirname, 'contracts/ROSCA.sol');

    fs.readFile(roscaContractLocation, 'utf8', function(err, contractCode) {
      if (err) {
        if (done) {
          done(err);
        }
      } else {
        let output = solc.compile(contractCode, 1);
        let roscaContractAbi = JSON.parse(output.contracts.ROSCA.interface);
        let bytecode = output.contracts.ROSCA.bytecode;
        contractCache = {abi: roscaContractAbi, bytecode: bytecode};
        if (done) {
          done();
        }
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
  getContract: function() {
    if (!contractCache) {
      throw Error("must call wetrust-rosca-contract's init() first and let is complete");
    }
    return contractCache;
  },
};

module.exports = WeTrustContract;
