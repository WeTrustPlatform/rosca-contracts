contract('ROSCA constructor test', function(accounts) {
    var now = Math.round(new Date().getTime()/1000);
    var hourFromNow = now + 3600;
    var dayFromNow = now + 86400 + 3600;
    it("Throw if roundPeriodInDays < MIN_ROUND_PERIOD_IN_DAYS: Passing 0 as parameter ", function() {
        //var rosca = ROSCA.deployed();
        //var rosca2 = ROSCA.new();
        //var rosca = deployer.deploy(ROSCA);
        return ROSCA.new(0, "10000000000", 3, dayFromNow , 20).then(function(instance) {
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            // There was an error! Handle it.
        });

        /*return rosca.roundPeriodInDays.call().then(function(result){
            assert.equal(result.valueOf(),3, "Round Period is not 3 days")
        }).catch(function (e) {
            if ((e + "").indexOf("invalid JUMP") || (e + "").indexOf("out of gas") > -1) {
                return true;// We are in TestRPC
            } else if ((e + "").indexOf("please check your gas amount") > -1) {
                return true;// We are in Geth for a deployment
            } else {
                throw e;
            }
        });*/

        /* return rosca.joinRequest({from: accounts[1], gas:3000000}).then(function(){
            assert.equal()
        });*/
        // return assert.equal(1,1,"testing");
          // rosca.getBalance.call(accounts[0]).then(function(balance) {
            // assert.equal(balance.valueOf(), 10000, "10000 wasn't in the first account");
        });
    it("Throw if roundPeriodInDays >= MAX_ROUND_PERIOD_IN DAYS: Passing 31 as parameter ", function() {
        return ROSCA.new(31, "10000000000", 3, dayFromNow , 20).then(function(instance) {
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            // There was an error! Handle it.
        });
    });
    it("Throw if contributionSize < MIN_ROUND_SUM : passing 100000 as parameter", function() {

        return ROSCA.new(3, "100000", 3, dayFromNow , 20).then(function(instance) {
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            // There was an error! Handle it.
        });
    });
    it("Throw if contributionSize > MAX_CONTRIBUTION_SIZE : passing 100000000000000000000 as parameter", function() {

        return ROSCA.new(3, "100000000000000000000", 3, dayFromNow , 20).then(function(instance) {
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            // There was an error! Handle it.
        });
    });
    it("Throw if minimum_participants < 2 : passing 1 as parameter", function() {

        return ROSCA.new(3, "10000000000", 1, dayFromNow , 20).then(function(instance) {
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            // There was an error! Handle it.
        });
    });
    it("Throw if MINIMUM_TIME_BEFORE_ROSCA_START < 1 day : passing now + 1 hour as parameter", function() {

        return ROSCA.new(3, "10000000000", 2, hourFromNow , 20).then(function(instance) {
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            // There was an error! Handle it.
        });
    });
    it("Throw if feeInThousandths < 0 : passing -1 as parameter", function() {

        return ROSCA.new(3, "10000000000", 2, dayFromNow , -1).then(function(instance) {
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            // There was an error! Handle it.
        });
    });
    it("Throw if feeInThousandths > MAX_FEE_IN_THOUSANTHS : passing 201 as parameter", function() {

        return ROSCA.new(3, "10000000000", 2, dayFromNow , 201).then(function(instance) {
            assert.isNotOk(true,"contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            // There was an error! Handle it.
        });
    });
});
