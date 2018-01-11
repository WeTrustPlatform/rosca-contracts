module.exports = {
  networks:{
    development : {
      host: "localhost",
      port: 8545,
      gasPrice: 2e10,
      network_id: "*"
    },
    rpc: {
      host: "localhost",
      port: 8545,
      gasPrice: 2e10  // keep in sync with test/utils/consts.js
    }
  }
};
