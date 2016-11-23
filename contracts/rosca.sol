pragma solidity ^0.4.4;

contract rosca {
    address WETRUST = 0;  // constant
    
    event LogParticipantRegistered(string uniqName);
    event LogContributionMade(string uniqName);
    event LogBidPlaced(string uniqName);
    event LogRoundFundsRelease(string winnerUniqName, uint amountInWei);
    
    
    enum Period { Weekly, Monthly }
    
    modifier onlyForeman {
        _;
    }
    
    /**
     * Creates a new ROSCA in which every roundPeriod each person contributes
     * roundSum, for numRounds
     */
    function ROSCA(
        Period roundPeriod, 
        uint roundSum, 
        int16 numRounds, 
        int8 minParticipants, 
        int startTime, 
        int16 feeInThousandths, 
        address feeAddress);
    
    /**
     * Registers another user-proxy for this ROSCA (msg.sender is the proxy).
     */
    function joinRequest();
    
    function acceptJoinRequest(address requestor) onlyForeman;
    
    // v2: function leave();
    
    /**
     * Processes a periodic contribution from msg.sender (the user-proxy).
     * Any excess funds will be withdrawable through withdraw().
     */
    function contribute() payable;

    /**
     * Registers a bid from msg.sender. If msg.sender has already won a round,
     * this method will do nothing (or throw?).
     */
    function bid(uint distrubtionAmountInWei);
    
    /**
     * Withdraws available funds for msg.sender. If opt_destination is specified,
     * sends the fund to that address.
     */
    function withdraw(address opt_destination);
    
    // TODO(ron): escape hatch.
    
    /**
     * Vouches that uniqName is now using newWallet as its primary account.
     * If X-out-of-Y people vouch, the address is updated after a timelock, 
     * unless cancelRestoreAccess() is called from the old address.
     */
    function restoreAccess(string uniqName, address newWallet);
    
    /**
     * May be called by a participant to stop the account recovery process.
     */
    function cancelRestoreAccess();
}

