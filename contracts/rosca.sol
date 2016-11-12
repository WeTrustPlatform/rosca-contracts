pragma solidity ^0.4.4;

/*
*  Possible missing functions
* - Start() onlyForeman;
* - check? to perform check and make sure certain values are available and correct
*/
contract rosca {
    address constant WETRUST = 0x0;

    enum Period { Weekly, Monthly } // are we only allwing 2 options?

    event LogParticipantRegistered(string uniqName);
    event LogContributionMade(string uniqName);
    event LogBidPlaced(uint bid,address winnerAddress);
    event LogRoundFundsRelease(string winnerUniqName, uint amountInWei);

    //added
    event LogRoundEnded(uint currentRound, address winner);

    //state variables
    address foreman;
    uint roundSum;
    int16 numRounds;
    int8 minParticipants;
    Period roundPeriod;
    int startTime;
    int16 feeToService;
    address feeAddress;

    /*
        not sure about which structures to use yet
    */
    struct USER{
        uint contributed; // number of times contributed
        uint paid; // number of times bid Won
        uint allowance; // how much they are allowed to withdraw, i.e if someone win , their allowance will go up by the bid.
        bool alive; //needed to check if a member is indeed a member

    }
    mapping(address => USER) members; //using struct USER to keep track of contributions and paid, allowance and etc.
    address[] memberAddress;    //this is the only way to iterate through all the member's address

    mapping(address => bool) pendingJoinRequest; // this way , address can be used as index, if we use address[] , we'll have to go thru a whole array

    //deposit and withdrawal related
    uint totalAmountInContract;
    //bidding related state variable
    uint lowestBid;
    address winnerAddress;


    modifier onlyForeman {
        if(msg.sender != foreman)
        throw;
        _;
    }

    /**
     * Creates a new ROSCA in which every roundPeriod each person contributes
     * roundSum, for numRounds
     */
    function rosca(
        Period _roundPeriod,
        uint _roundSum,
        int16 _numRounds,
        int8 _minParticipants,
        int _startTime,
        int16 _feeInThousandths,
        address _feeAddress)
    {
        roundPeriod = _roundPeriod;
        roundSum = _roundSum;
        numRounds = _numRounds;
        minParticipants = _minParticipants;
        startTime = _startTime;
        feeToService = _feeInThousandths;
        feeAddress = _feeAddress;
    }

    /**
     * Registers another user-proxy for this ROSCA (msg.sender is the proxy).
     */
    function joinRequest()
    {
        //only put the request in the pending list if they are not in the ROSCA already
        if(!members[msg.sender].alive)
            pendingJoinRequest[msg.sender] = true;
        else
            throw;
    }

    function acceptJoinRequest(address requestor) onlyForeman
    {
        if(pendingJoinRequest[requestor])
        {
            members[requestor] = USER({paid: 0 , contributed: 0, alive: true, allowance: 0});
            memberAddress.push(requestor);
            delete(pendingJoinRequest[requestor]); // take out the requestor's address in the pending list
        }
        else throw;


    }

    // v2: function leave();

    /**
     * Processes a periodic contribution from msg.sender (the user-proxy).
     * Any excess funds will be withdrawable through withdraw().
     */
    function contribute() payable
    {
        //Product condsideration : are we gonna limit how much ether could be sent? is it total, or how much sent each time?
        if(members[msg.sender].alive)
        {
            members[msg.sender].contributed = msg.value;
            totalAmountInContract = msg.value;
            //TODO(shine) : look into security about deposit and withdrawal
        }
        else
           throw;
    }

    /**
     * Registers a bid from msg.sender. If msg.sender has already won a round,
     * this method will do nothing (or throw?).
     */
    function bid(uint distrubtionAmountInWei)
    {
        if(distrubtionAmountInWei < lowestBid)
        {
            //set new lowestBid and winnerAddress, also trigger event new Bid placed
            lowestBid = distrubtionAmountInWei;
            winnerAddress = msg.sender;
            LogBidPlaced(lowestBid, winnerAddress);

        }else
            throw;
    }

    /**
     * Withdraws available funds for msg.sender. If opt_destination is specified,
     * sends the fund to that address.
     */
    function withdraw(address opt_destination) returns(bool success){

        if(members[msg.sender].alive && members[msg.sender].allowance > 0)
        {
            uint amountToWithdraw = members[msg.sender].allowance;  //use a temporary variable to avoid the receiver calling the withdraw function again before
            members[msg.sender].allowance = 0;                      // send() completes its task


            if (!msg.sender.send(amountToWithdraw)) {   //if the send() fails, put the allowance back to its original place
                // No need to call throw here, just reset the amount owing
                members[msg.sender].allowance = amountToWithdraw;
                return false;
            //TODO(shine) : look into security about withdraw
             }
             else return true;
        }
        else
            throw;

    }


    // TODO(ron): escape hatch.

    /**
     * Vouches that uniqName is now using newWallet as its primary account.
     * If X-out-of-Y people vouch, the address is updated after a timelock,
     * unless cancelRestoreAccess() is called from the old address.
     */
    function restoreAccess(string uniqName, address newWallet){
        throw; //for now
    }

    /**
     * May be called by a participant to stop the account recovery process.
     */
    function cancelRestoreAccess(){
        throw; //for now
    }
}

