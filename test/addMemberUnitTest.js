var co = require("co").wrap;
contract('ROSCA addMember Unit test', function(accounts) {

    it("throws when adding an existing member", function () {
        var rosca = ROSCATest.deployed();

        return rosca.addMember(accounts[1]).then(function() {
            assert.isNotOk(true, "adding existing member succeed when it should have thrown");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("check if membersAddresses.length goes up by 1 after calling", co(function *() {
        var rosca = ROSCATest.deployed();

        yield rosca.addMember(accounts[4]);
        var memberAddresses = yield rosca.membersAddresses.call(4);
        var member = yield rosca.members.call(accounts[4]);
        yield assert.equal(memberAddresses, accounts[4], "member's address didn't get registered properly");
        yield assert.isOk(member[2], "member.alive didn't get registered properly");
    }));
});