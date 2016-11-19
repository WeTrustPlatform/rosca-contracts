/**
 * Testing contribute and withdrawal functions
 *  contribute
 *    throw condition:
 *    - msg.sender is not a member (done) 1st
 *    flow Cases:
 *    - send money and and check if contributed value of member goes up (done) 4th
 *
 *  withdraw
 *    throw condition:
 *    - msg.sender is not a member  (done) 2nd
 *    - pendingWithdrawal is zero   (done) 3rd
 *    flow Cases:
 *    - send opt_destination(assume address is valid) and check successful receipt , check changes in pendingWithdrawal (done) 5th
 *    - send without opt_destination and check successful receipt, check changes in pendingWithdrawal (done) 6th
 */
contract('ROSCA contribute & withdrawl test', function(accounts) {
    var now = Math.round(new Date().getTime()/1000);
    var hourFromNow = now + 3600;
    var dayFromNow = now + 86400 + 3600;
    const MIN_START_DELAY = 2000;
    const ROUND_PERIOD_DELAY = 5000;
    it("Calling contribute from a non member, should throw", function () {
        var rosca = ROSCAtest.deployed();

        //add members to ROSCA first before roundStart Time is over
        rosca.joinRequest({from:accounts[1]});
        rosca.joinRequest({from:accounts[2]});
        rosca.joinRequest({from:accounts[3]});
        rosca.joinRequest({from:accounts[4]});
        rosca.acceptJoinRequest(accounts[1]);
        rosca.acceptJoinRequest(accounts[2]);
        rosca.acceptJoinRequest(accounts[3]);
        rosca.acceptJoinRequest(accounts[4]);

        rosca.contribute({from:accounts[5], value:10000000000000000000 }).then(function(result){
            assert.isOk(false, "A non member tries to contribute");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });

    });
    it("Calling withdraw from a non member, should throw", function () {
        var rosca = ROSCAtest.deployed();

        rosca.withdraw(0x0, {from:accounts[5]}).then(function(result){
            assert.isOk(false, "A non member tries to withdraw");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });
    it("Foreman calling withdraw with zero pendingWithdrawal, should throw", function () {
        var rosca = ROSCAtest.deployed();

        rosca.withdraw(0x0).then(function(result){
            assert.isOk(false, "Foreman tries to withdraw without prior contribute");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("Contribution flow, add contribution and check if it register", function () {
        var rosca = ROSCAtest.deployed();
        return setTimeout(function(){
            rosca.startRound();
            rosca.contribute({from:accounts[1], value:1000000000000000000}).then(function(){
               rosca.members.call(accounts[1]).then(function(result){
                  assert.equal(result[0].toString(),"1000000000000000000", "Contribute deposited but not registering")
               });
            });
        }, MIN_START_DELAY);
    });
    it("withdraw with a valid opt_destination, check pendingWithdrawal of user", function () {
        var rosca = ROSCAtest.deployed();
        //place bid
        setTimeout(function(){
            rosca.bid(40000000000,{from:accounts[1]});
        }, MIN_START_DELAY);
        // win round, check pending withdrawal
        setTimeout(function(){
            rosca.startRound();

            rosca.withdraw(accounts[2],{from:accounts[1]}).then(function(receipt){
                rosca.members.call(accounts[1]).then(function(result){
                    assert.equal(result[2],"0","pendingWithdrawal Values did not change after successful withdrawal");
                });
            });
            /*rosca.contribute({from:accounts[1], value:1000000000000000000}).then(function(){
                rosca.members.call(accounts[1]).then(function(result){
                    assert.equal(result[0].toString(),"1000000000000000000", "Contribute deposited but not registering")
                });
            });*/
        }, MIN_START_DELAY + ROUND_PERIOD_DELAY);
    });
    it("withdraw with a no opt_destination, check pendingWithdrawal of user", function () {
        var rosca = ROSCAtest.deployed();

        //place bid
        setTimeout(function(){
            rosca.bid(40000000000,{from:accounts[2]});
        }, MIN_START_DELAY + ROUND_PERIOD_DELAY +100);

        // win round, check pending withdrawal
        setTimeout(function(){
            rosca.startRound();
            rosca.withdraw(0x0,{from:accounts[2]}).then(function(){
               rosca.members.call(accounts[2]).then(function(result){
                  assert.equal(result[2],"0","pendingWithdrawal Values did not change after successful withdrawal");
               });
            });
        }, MIN_START_DELAY + (ROUND_PERIOD_DELAY * 2));
    });

});