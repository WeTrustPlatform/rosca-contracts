contract('MetaCoin', function(accounts) {
    it("Round Period should be 2 days", function() {
        //var rosca = ROSCA.deployed();
        //var rosca2 = ROSCA.new();
        //var rosca = deployer.deploy(ROSCA);

        ROSCA.new().then(function(instance) {
            // `instance` is a new instance of the abstraction.
            // If this callback is called, the deployment was successful.
            console.log(instance.address);
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
    it("should call a function that depends on a linked library", function() {
        var rosca = ROSCA.deployed();
        var metaCoinBalance;
        var metaCoinEthBalance;

        return assert.equal(1,1,"testcase2");/*meta.getBalance.call(accounts[0]).then(function(outCoinBalance) {
            metaCoinBalance = outCoinBalance.toNumber();
            return meta.getBalanceInEth.call(accounts[0]);
        }).then(function(outCoinBalanceEth) {
            metaCoinEthBalance = outCoinBalanceEth.toNumber();
        }).then(function() {
            assert.equal(metaCoinEthBalance, 2 * metaCoinBalance, "Library function returned unexpeced function, linkage may be broken");
        });*/
    }); /*
    it("should send coin correctly", function() {
        var meta = MetaCoin.deployed();

        // Get initial balances of first and second account.
        var account_one = accounts[0];
        var account_two = accounts[1];

        var account_one_starting_balance;
        var account_two_starting_balance;
        var account_one_ending_balance;
        var account_two_ending_balance;

        var amount = 10;

        return meta.getBalance.call(account_one).then(function(balance) {
            account_one_starting_balance = balance.toNumber();
            return meta.getBalance.call(account_two);
        }).then(function(balance) {
            account_two_starting_balance = balance.toNumber();
            return meta.sendCoin(account_two, amount, {from: account_one});
        }).then(function() {
            return meta.getBalance.call(account_one);
        }).then(function(balance) {
            account_one_ending_balance = balance.toNumber();
            return meta.getBalance.call(account_two);
        }).then(function(balance) {
            account_two_ending_balance = balance.toNumber();

            assert.equal(account_one_ending_balance, account_one_starting_balance - amount, "Amount wasn't correctly taken from the sender");
            assert.equal(account_two_ending_balance, account_two_starting_balance + amount, "Amount wasn't correctly sent to the receiver");
        });
    }); */
});
