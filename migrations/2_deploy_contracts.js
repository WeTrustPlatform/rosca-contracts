module.exports = function(deployer) {
  deployer.deploy(ROSCA, 3, "10000000000", 3, 1479576961 , 20);
  var now = Math.round(new Date().getTime()/1000);
  deployer.deploy(ROSCAtest, 1, "10000000000", 2, now + 5, 20 );
};

