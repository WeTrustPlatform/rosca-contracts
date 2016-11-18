contract('ROSCA contribute & withdrawl test', function(accounts) {
    it("Calling contribute from a non member, should throw", function () {
        var rosca;
        ROSCA.new(3, "10000000000", 3, 1479576961 , 20).then(function(receipt) {
            rosca = receipt;
            rosca.contribute({from:accounts[1], value:10000000000000000000 }).then(function(result){
              assert.isOk(false, "A non member tries to contribute");
            }).catch(function(e) {
                assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
                // There was an error! Handle it.
            });
        });
    });
    it("Calling withdraw from a non member, should throw", function () {
        var rosca;
        ROSCA.new(3, "10000000000", 3, 1479576961 , 20).then(function(receipt) {
            rosca = receipt;
            rosca.withdraw(0x0, {from:accounts[1]}).then(function(result){
                assert.isOk(false, "A non member tries to withdraw");
            }).catch(function(e) {
                assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
                // There was an error! Handle it.
            });
        });
    });
    it("Foreman calling withdraw with no prior contribute, should throw", function () {
        var rosca;
        ROSCA.new(3, "10000000000", 3, 1479576961 , 20).then(function(receipt) {
            rosca = receipt;
            rosca.withdraw(0x0).then(function(result){
                assert.isOk(false, "Foreman tries to withdraw without prior contribute");
            }).catch(function(e) {
                assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
                // There was an error! Handle it.
            });
        });
    });
    // needs to add accessor for the
    it("Contribution flow, add contribution and check if it register", function () {
        var rosca;
        ROSCA.new(3, "10000000000", 3, 1479576961 , 20).then(function(receipt) {
            rosca = receipt;
            rosca.joinRequest({from: accounts[1], gas: 3000000}).then(function (receipt) { // request join first
                rosca.acceptJoinRequest(accounts[1]).then(function (result) { // foreman accepts the request
                    rosca.contribute({from:accounts[1], value: 10000000000000000000 }).then(function (result){ // user contribute
                        rosca.members(accounts[1]).then(function (result){
                           assert.equal(result[0].toString(), "10000000000000000000", "contributed but not registering");
                        });
                    });
                });
            });
        });
    });
    // withdrawal flow needs member to win the Pot first
    /*it("Withdrawal flow ", function () {
        var rosca;
        ROSCA.new(3, "10000000000", 3, 1479576961 , 20).then(function(receipt) {
            rosca = receipt;
            rosca.joinRequest({from: accounts[1], gas: 3000000}).then(function (receipt) { // request join first
                rosca.acceptJoinRequest(accounts[1]).then(function (result) { // foreman accepts the request
                    rosca.contribute({from:accounts[1], value: 10000000000000000000 }).then(function (result){ // user contribute
                        rosca.withdraw(0x0,{from:accounts[1]}).then(function (result){
                            rosca.members(accounts[1]).then(function (result){
                                assert.equal(result[0].toString(), "10000000000000000000", "contributed but not registering");
                            });
                        });
                    });
                });
            });
        });
    });*/
});