module.exports = function(deployer) {
    var now = Math.round(new Date().getTime()/1000);
    deployer.deploy(ROSCAtest, 3, "10000000000", 3, now + 5 , 20);
};

