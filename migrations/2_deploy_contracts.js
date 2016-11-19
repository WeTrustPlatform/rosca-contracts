module.exports = function(deployer) {
  var now = Math.round(new Date().getTime()/1000);
  deployer.deploy(ROSCA, 3, "10000000000", 3, now + 100000 , 20);
};

