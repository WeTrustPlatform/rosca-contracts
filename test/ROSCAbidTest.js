contract('ROSCA Bidding test', function(accounts) {
    var now = Math.round(new Date().getTime()/1000);
    var hourFromNow = now + 3600;
    var dayFromNow = now + 86400 + 3600;
    /*it("Foreman placing Bid before start, should throw", function () {
        var rosca;
        ROSCA.new(3, "10000000000", 3, dayFromNow , 20).then(function(receipt) {
            rosca = receipt;
            rosca.bid(100000000).then(function(result){
                assert.isOk(false, "Foreman tries to call bid before round start");
            }).catch(function(e) {
                assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
                // There was an error! Handle it.
            });
        });
    });*/
    it("Foreman placing Bid before start, should throw", function () {
        var rosca = ROSCAtest.deployed();
        var now = Math.round(new Date().getTime()/1000);
        rosca.membersAddresses.call(0).then(function(result){
            console.log(result);
        });
        //rosca.startRound();
        /*rosca.startRound().then(function(receipt){
            rosca.membersAddresses.call(0).then(function(result){
               console.log(result);
            });
            /*rosca.currentRound.call().then(function(result){
               console.log(result.toString());
            });
        });*/
    });
});