/**
 * Testing joinRequest and acceptJoinRequest
 *
 * JoinRequest
 *  throw cases :
 *  - if msg.sender is already a member (done) 2nd
 *  - call after ROSCA started (currentRound > 0) (done) 6th
 *  flow cases :
 *  - call successfully and check if exist in pendingJoinRequest (done) 1st
 *
 * acceptJoinRequest
 *  throw cases :
 *  - call from a non-foreman address (doen) 5th
 *  - call after roundStart (currentRound > 0) (done) 7th
 *  - requestor address not in pendingJoinRequest (done) 3rd
 *  flow cases :
 *  - when a user is accepted, check membersAddress and members for existence, make sure its deleted from pending list (done) 4th
 */
contract('ROSCA join & accept test', function(accounts) {
    const MIN_START_DELAY = 2000;

    it("Requesting to join and checking if user's address exist in pendingJoinRequest", function () {
        var rosca = ROSCAtest.deployed();
        return rosca.joinRequest({from: accounts[1], gas:3000000}).then(function(receipt){
            rosca.pendingJoinRequest(accounts[1]).then(function(result){
                assert.isOk(result,"User is not in joinRequest");
            });
        });
    });
    it("Foreman requesting to join, Should Throw", function () {
        var rosca = ROSCAtest.deployed();

        return rosca.joinRequest({from: accounts[0], gas:3000000}).then(function(receipt){
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });
    it("Foreman Accepting join request that is not in pendingJoinRequest, should throw ", function () {
        var rosca = ROSCAtest.deployed();
        return rosca.acceptJoinRequest(accounts[0],{from: accounts[0], gas:3000000}).then(function(receipt){
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });
    it("Requesting to join and foreman Accepting, checking if accepted member is in membersAddresses and check deletion", function () {
        var rosca = ROSCAtest.deployed();

        return rosca.joinRequest({from: accounts[1], gas:3000000}).then(function(receipt){
            rosca.acceptJoinRequest(accounts[1]).then(function(receipt){
                rosca.membersAddresses.call(1).then(function(result){
                    assert.equal(result,accounts[1],"Accepted account is not in membersAddresses");
                });
                rosca.pendingJoinRequest.call(accounts[1]).then(function(result){
                    assert.isNotOk(result,"accepted member still exist in pending list");
                });
            });
        });
    });
    it("Call acceptJoinRequest from non-foreman account , should throw ", function () {
        var rosca = ROSCAtest.deployed();

        return rosca.acceptJoinRequest(accounts[1], {from: accounts[2]}).then(function(receipt){
            assert.isNotOk(true,"acceptJoinRequest function successfuly ran from non-foreman account");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });
    it("Calling joinRequest after ROSCA started , should throw", function () {
        var rosca = ROSCAtest.deployed();

        return setTimeout(function(){
            rosca.startRound();
            rosca.joinRequest(accounts[0],{from: accounts[0]}).then(function(receipt){
                assert.isNotOk(true,"join request went through even though ROSCA started");
            }).catch(function(e) {
                assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            });
        }, MIN_START_DELAY);
    });
    it("Calling acceptJoinRequest after ROSCA started , should throw", function () {
        var rosca = ROSCAtest.deployed();

        return setTimeout(function(){
            rosca.acceptJoinRequest(accounts[0],{from: accounts[0]}).then(function(receipt){
                assert.isNotOk(true,"accept join request was successful even though ROSCA started");
            }).catch(function(e) {
                assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            });
        }, MIN_START_DELAY);
    });
});