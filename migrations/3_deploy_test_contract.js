var ROSCATest = artifacts.require('ROSCATest.sol');

module.exports = function(deployer) {
    var simulatedTimeNow;
    var accounts = ["0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1","0xffcf8fdee72ac11b5c542428b35eef5769c409f0","0x22d491bde2303f2f43325b2108d26f1eaba1e32b", "0xe11ba2b4d45eaed5996cd0823791e0c93114882d"];

    var latestBlock = web3.eth.getBlock("latest");
    simulatedTimeNow = latestBlock.timestamp; // timestamp of the latest block of in testrpc
    deployer.deploy(ROSCATest, 0 /* use ETH */ , 0,  30, 1e16 , simulatedTimeNow + (86400 + 10) ,
        [accounts[0], accounts[1],accounts[2],accounts[3]], 2);
};
