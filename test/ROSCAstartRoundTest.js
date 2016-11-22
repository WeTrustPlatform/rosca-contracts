/**
 * Testing startRound function
 *
 *  throw condition:
 *    - calling it before startTime (done) 1st
 *    - calling it w/o min_participants requirement (done) 2nd
 *  flow cases:
 *    - currentRound == 0 , change lowestBid,currentRuond increment and winnerAddress (done) 3rd
 *    - currentRound != 0 , set winner and pendingwithdrawal,
 *    - currentRound != 0 , no bids,
 */
contract('ROSCA startRound test', function(accounts) {
    const MIN_START_DELAY = 2000;
    const ROUND_PERIOD_DELAY = 5000;

    it("Calling startRound before StartTime, should throw", function () {
        var rosca = ROSCAtest.deployed();
        return rosca.startRound().then(function(){
            assert.isNotOK(true, "startRound should've thrown, now < startTime not met");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });
    it("calling startTime w/o min_participants requirements, should throw", function () {
        var rosca = ROSCAtest.deployed();

        setTimeout(function(){
            rosca.startRound().then(function(){
                assert.isNotOK(true, "startRound should've thrown, min_participants not met");
            }).catch(function(e) {
                assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            });
        }, MIN_START_DELAY);
    });
    it("startRound while currentRound == 0 , change lowestBid and currentRuond increment", function () {
        var rosca = ROSCAtest.deployed();

        setTimeout(function(){
            rosca.joinRequest({from:accounts[1]});
            rosca.acceptJoinRequest(accounts[1]);
            rosca.joinRequest({from:accounts[2]});
            rosca.acceptJoinRequest(accounts[2]);
            rosca.joinRequest({from:accounts[3]});
            rosca.acceptJoinRequest(accounts[3]);
            rosca.joinRequest({from:accounts[4]});
            rosca.acceptJoinRequest(accounts[4]);

            rosca.startRound();
            rosca.lowestBid.call().then(function(result){
               assert.equal(result.toString(),"50000000001", "lowest bid should've equal to contributionSize * number of members + 1");
            });
            rosca.currentRound.call().then(function(result){
                assert.equal(result.toString(), "1", "currentRound should've incremented");
            });
            rosca.winnerAddress.call().then(function(result){
                assert.equal(result, "0x0000000000000000000000000000000000000000", "winnerAddress should be 0x0");
            });
        }, MIN_START_DELAY +100);
    });
    it("1st Round ends, no bids, check if random address is selected ", function () {
        var rosca = ROSCAtest.deployed();

        setTimeout(function(){
            rosca.startRound();

            var event = rosca.LogRoundFundsReleased();
            event.watch(function(error,log){
                rosca.members.call(log.args.winnerAddress).then(function(result){
                    assert.equal(result[2], "50000000001", "Member wasn't randomly chosen when there were no bids");
                    event.stopWatching();
                });
            });

        }, MIN_START_DELAY + ROUND_PERIOD_DELAY);
    });
    it("2nd Round ends, there is bid, check if the winner gets proper values ", function () {
        var rosca = ROSCAtest.deployed();
        var bidder_account;
        setTimeout(function(){
            rosca.members.call(accounts[0]).then(function(result){
                if(result[1]) {
                    bidder_account = 1;
                    rosca.bid(47000000000,{from: accounts[1]});
                } else {
                    bidder_account = 0;
                    rosca.bid(47000000000, {from: accounts[0]});
                }
            });

        }, MIN_START_DELAY + ROUND_PERIOD_DELAY + 100);

        setTimeout(function(){
            rosca.startRound();

            rosca.members.call(accounts[bidder_account]).then(function(result){
                assert.equal(result[2].toString(),"47000000000" , "lowest Bid of winner is not placed in the pending withdrawal account");
                assert.isOk(result[1], "Paid value havent been set");
            });
        }, MIN_START_DELAY + (ROUND_PERIOD_DELAY * 2) + 100);
    });
});