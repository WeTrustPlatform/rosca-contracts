contract('ROSCA Bidding test', function(accounts) {
    it("Foreman placing Bid before start, should throw", function () {
        var rosca;
        ROSCA.new(3, "10000000000", 3, 1479576961 , 20).then(function(receipt) {
            rosca = receipt;
            rosca.bid(100000000).then(function(result){
                assert.isOk(false, "Foreman tries to call bid before round start");
            }).catch(function(e) {
                assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
                // There was an error! Handle it.
            });
        });
    });
    it("Foreman placing Bid before start, should throw", function () {
        var rosca;
        var now = Math.round(new Date().getTime()/1000);
        ROSCAtest.new(1, "10000000000", 2, now + 1, 20 ).then(function(receipt) {
            rosca = receipt;
            this.timeout(1000);
            rosca.startRound().then(function(receipt){
               rosca.currentRound().then(function(result){
                  assert.equal(result.toString(),"1", "Current did not increment");
               });
            });
        });
    });
});