contract('ROSCA join test', function(accounts) {
    it("Requesting to join and checking if user's address exist in pendingJoinRequest", function () {
        var rosca = ROSCA.deployed();
        return rosca.joinRequest({from: accounts[1], gas:3000000}).then(function(receipt){
            rosca.pendingJoinRequest(accounts[1]).then(function(result){
                assert.isOk(result,"User is not in joinRequest ");
            });
        });
    });
    it("Foreman requesting to join, Should Throw", function () {
        var rosca = ROSCA.deployed();

        return rosca.joinRequest({from: accounts[0], gas:3000000}).then(function(receipt){
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            // There was an error! Handle it.
        });
    });
    it("Foreman Accepting join request that is not in pendingJoinRequest, should throw ", function () {
        var rosca = ROSCA.deployed();
        return rosca.acceptJoinRequest(accounts[0],{from: accounts[0], gas:3000000}).then(function(receipt){
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            // There was an error! Handle it.
        });
    });
    it("Requesting to join and foreman Accepting, checking if accepted member is in ", function () {
        var rosca = ROSCA.deployed();

        return rosca.joinRequest({from: accounts[1], gas:3000000}).then(function(receipt){
            rosca.acceptJoinRequest(accounts[1]).then(function(receipt){
                rosca.membersAddresses.call(1).then(function(result){
                    assert.equal(result,accounts[1],"Accepted account is not in membersAddresses");
                });
            });
        });
    });
    it("Requesting to join and foreman Accepting, checking if accepted member is in ", function () {
        var rosca = ROSCA.deployed();

        return rosca.joinRequest({from: accounts[1], gas:3000000}).then(function(receipt){
            rosca.acceptJoinRequest(accounts[1]).then(function(receipt){
                rosca.membersAddresses.call(1).then(function(result){
                    assert.equal(result,accounts[1],"Accepted account is not in membersAddresses");
                });
            });
        });
    });
    it("Requesting to join and foreman Accepting, checking if accepted member is in ", function () {
        var rosca = ROSCA.deployed();

        return rosca.joinRequest({from: accounts[1], gas:3000000}).then(function(receipt){
            rosca.acceptJoinRequest(accounts[1]).then(function(receipt){
                rosca.membersAddresses.call(1).then(function(result){
                    assert.equal(result,accounts[1],"Accepted account is not in membersAddresses");
                });
            });
        });
    });

});