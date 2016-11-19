/**
 * four throw cases,
 * - before round starts (done) 1st
 * - bid is higher than lowestBid (done) 2nd
 * - member had been paid already (done) 5th
 * - bid must be over 65% of the pot (done) 3rd
 *
 * flow cases:
 * - place bid, see if it register (lowestBid & winnerAddress) (done) 4th
 */
contract('ROSCA Bidding test', function(accounts) {
    const MIN_START_DELAY = 2000;
    const ROUND_PERIOD_DELAY = 10000;
    var now = Math.round(new Date().getTime()/1000);

    it("Foreman placing Bid before start, should throw", function () {
        var rosca = ROSCAtest.deployed();
        // add members to avoid startRound issue
        rosca.joinRequest({from:accounts[1]});
        rosca.joinRequest({from:accounts[2]});
        rosca.joinRequest({from:accounts[3]});
        rosca.joinRequest({from:accounts[4]});
        rosca.acceptJoinRequest(accounts[1]);
        rosca.acceptJoinRequest(accounts[2]);
        rosca.acceptJoinRequest(accounts[3]);
        rosca.acceptJoinRequest(accounts[4]);

        return rosca.bid(50000000000,{from:accounts[0]}).catch(function(e) {
            return assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });
    it("Placing a bid higher than lowest Bid, should throw", function () {
        var rosca = ROSCAtest.deployed();
        return setTimeout(function(){
            rosca.startRound();
            rosca.bid(50000000002, {from:accounts[0]}).catch(function(e) {
                return assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
                // There was an error! Handle it.
            });
            /*rosca.currentRound.call().then(function(result){
                console.log(result.toString());
            });*/
        }, MIN_START_DELAY);
    });
    it("Placing a bid lower than 65% of the Pot, should throw", function () {
        var rosca = ROSCAtest.deployed();
        setTimeout(function(){
            return rosca.bid((50000000000 * 0.64), {from:accounts[1]}).then(function(receipt){
                return assert.isNotOk(true, "Bid placed successful when its suppose to throw");
            }).catch(function(e) {
                return assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
                // There was an error! Handle it.
            });
        }, MIN_START_DELAY);
    });
    it("Placing a valid bid and check if it register, lowestBid and winner change", function () {
        var rosca = ROSCAtest.deployed();
        setTimeout(function(){
            return rosca.bid(40000000000, {from:accounts[2]}).then(function(receipt){
                rosca.lowestBid.call().then(function(result){
                    assert.equal(result.toString(), "40000000000" ,"lowestBid value did not change after placing valid Bid");
                });
                rosca.winnerAddress.call().then(function(result){
                    assert.equal(result, accounts[2] ,"winner Address did not change");
                });
            });
        }, MIN_START_DELAY);
    });
    it("placing Bid after paid, throw", function () {
        var rosca = ROSCAtest.deployed();
        setTimeout(function(){
            // wait until end of round and call startRound() to end it;
            rosca.startRound();

            // place a new Bid from previous round winner
            return rosca.bid(50000000000 , {from:accounts[2]}).then(function(receipt){
                return assert.isNotOk(true, "Bid placed successful when its suppose to throw");
            }).catch(function(e) {
                return assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
                // There was an error! Handle it.
            });

        }, MIN_START_DELAY + ROUND_PERIOD_DELAY);
    });
});