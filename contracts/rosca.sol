pragma solidity ^0.4.4;

/**
*  Things still missing/needs fixing:
*   in bid(), check if the ROSCA/rounds is started before allow bidding
*   in startRound() , check if minimumParticipants requirement is met (what happens if it doesn't? should we move the startTime?)
*   in withdraw() , add fee related logic
*   in startRound() , lowestBid should be contributionSize * amount of people in ROSCA
*   checkingContribution, check whether or not a member as contributed as least contributionSize at the end of Round
*   in withdraw() , check if opt_destination provided is valid address
*/
contract ROSCA {
  address constant WETRUST = 0x0;
  uint constant MIN_CONTRIBUTION_SIZE = 1000000000000;
  uint constant MAX_FEE_IN_THOUSANDTH = 20;

  event LogParticipantRegistered(address user);
  event LogContributionMade(address user, uint amount);
  event LogNewLowestBid(uint bid,address winnerAddress);
  event LogRoundFundsRelease(address winnerUniqName, uint amountInWei);
  event LogFundsWithdrawal(address user, uint amount,address destination);
  event LogStartOfPeriod(uint currentRound);

  //state variables
  uint16 numRoundsInEpoch;     //number of rounds in 1 epoch, user doesnt have control over this, it'll increment everytime a new participant is registered
  uint16 currentEpoch;
  uint16 numEpochs;     //number of Epochs this contract will run
  uint16 roundPeriodInDays;
  uint16 serviceFeeInThousandths;
  uint16 currentRound;  //currentRound will be set to 0 when ROSCA is created and will turn to one when the ROSCA actually start
  uint8 minParticipants;
  address foreman;    //address of the foreman
  address feeAddress;
  uint contributionSize;
  uint startTime;     //startTime must be in timestamp

  struct USER{
    uint contributed; // number of times contributed or could be amount contributed
    uint paid; // number of times bid Won
    uint pendingWithdrawl; // how much they are allowed to withdraw, i.e if someone win , their allowance will go up by the bid.
    bool alive; //needed to check if a member is indeed a member
  }
  mapping(address => USER) members; //using struct USER to keep track of contributions and paid, allowance and etc.
  address[] membersAddresses;    //this is the only way to iterate through all the member's address

  mapping(address => bool) pendingJoinRequest; // this way , address can be used as index, if we use address[] , we'll have to go thru a whole array

  //bidding related state variable
  uint lowestBid;
  address winnerAddress;


  modifier onlyForeman {if(msg.sender != foreman) throw;_;}
  modifier beforeStart {if(currentRound != 0)throw;_;}

  /**
    * Creates a new ROSCA and initialize the necessary variables, ROSCA doesnt start untill the specified startTime
    * Creator of the contract becomes foreman and also added as the first member of the ROSCA
    * params:
    * - roundPeriodInDays uint16
    * - contributionSize uint //In Wei, amount that every member of the ROSCA is required contribute each period
    * - numEpoch uint16
    * - startTime uint // must be as a timeStamp
    * - feeInThousandths uint16, //fee to the service
    * - address feeAddress, // a WeTrust owned address to send the fees.
    */
  function ROSCA(
    uint16 roundPeriodInDays_,
    uint contributionSize_, //i am assuming this is referring to number epochs to run
    uint16 numEpochs_,
    uint8 minParticipants_,
    uint startTime_,
    uint16 feeInThousandths_,
    address feeAddress_)
  {
    roundPeriodInDays = roundPeriodInDays_;
    if(contributionSize_ < MIN_CONTRIBUTION_SIZE) throw; //if everyone is only required to contribute 0 , whats the point of rosca
    contributionSize = contributionSize_;

    if(numEpochs_ < 1) throw;
    numEpochs = numEpochs_;

    if(minParticipants_ < 2) throw;// there should be at least 2 people to make a group
    minParticipants = minParticipants_;

    if(startTime_ < (now + 1 days)) throw;
    startTime = startTime_;

    if(feeInThousandths_ > MAX_FEE_IN_THOUSANDTH) throw; //fee must be less than max fee
    serviceFeeInThousandths = feeInThousandths_;

    if(feeAddress != 0) //feeAddress shouldnt be empty(null)
    feeAddress = feeAddress_;

    //set foreman
    foreman = msg.sender;

    //register foreman as a member of ROSCA and increment numRounds in a Epoch to 1
    members[msg.sender] = USER({paid: 0 , contributed: 0, alive: true, pendingWithdrawl: 0});
    membersAddresses.push(msg.sender);
    numRoundsInEpoch = 1;
  }

  /** startRound() check if the round has ended, if so, get the winner of the currentRound's pot
    * and add the amount to the winner's pending withdrawal
    * if there were no bid during the round, address at index "currentRoundNumber" is chosen,
    * if the address chosen already won the pot once in currentEpoch, currentRoundNumber+1 is chosen, untill a winner is found
    *
    * after the winner had been declared, bidding process reset and currentRound is incremented, if currentRound+1 is equal numRoundsInEpoch,
    * currentEpoch is incremented, and currentRound = 1;
    *
    * if currentRound = 0(ROSCA hasnt started), no winner is declared
    */
  function startRound()
  {

    if(now < startTime + (uint(currentRound + (currentEpoch * numRoundsInEpoch))  * (uint(roundPeriodInDays) * 1 days)))
      throw;
    if(currentRound != 0 ){
      if(winnerAddress == 0)
      {
        //there is no bid in this round so find an unpaid address for this epoch
        for(uint i = 0 ; i < membersAddresses.length; i++)
        {
          if(members[membersAddresses[(currentRound-1 + i) % membersAddresses.length]].paid < currentEpoch)
          winnerAddress = membersAddresses[currentRound-1 + i];
        }
      }
      members[winnerAddress].pendingWithdrawl += lowestBid;
      members[winnerAddress].paid++;
      LogRoundFundsRelease(winnerAddress, lowestBid);
    }

    if(currentRound < numRoundsInEpoch)  // reset variables related to bidding
    {
      lowestBid = contributionSize;
      winnerAddress = 0;

      currentRound++;
    }else if(currentEpoch < numEpochs) //end of Epoch reset rounds
    {
      currentEpoch++;
      currentRound = 1;
      lowestBid = contributionSize;
    }
  }
  /**
   * Anyone not already a member of ROSCA can request to join and they'll be put into
   * pendingJoinRequest untill foreman accept request or ROSCA has started
   *
   */
  function joinRequest() beforeStart
  {
    //only put the request in the pending list if they are not in the ROSCA already
    if(!members[msg.sender].alive)
      pendingJoinRequest[msg.sender] = true;
    else
      throw;
  }
  /**
   * foreman must pass in the address of the requtor to approve the ROSCA participation
   * once a requestor had been registered as member, the address will be taken out of pendingJoinRequest
   **/
  function acceptJoinRequest(address requestor)
    onlyForeman
    beforeStart
  {
    if(pendingJoinRequest[requestor])
    {
      members[requestor] = USER({paid: 0 , contributed: 0, alive: true, pendingWithdrawl: 0});
      membersAddresses.push(requestor);
      numRoundsInEpoch++;
      LogParticipantRegistered(requestor);
      delete(pendingJoinRequest[requestor]); // take out the requestor's address in the pending list
    }
    else throw;
  }

  // v2: function leave();

  /**
   * Processes a periodic contribution from msg.sender ().
   * Any excess funds will be withdrawable through withdraw().
   */
  function contribute() payable
  {
    //Product condsideration : are we gonna limit how much ether could be sent? is it total, or how much sent each time?
    if(members[msg.sender].alive)
    {
      members[msg.sender].contributed = msg.value;
      //TODO(shine) : look into security about deposit and withdrawal
      LogContributionMade(msg.sender, msg.value);
    }
    else
      throw;
  }

  /**
   * Registers a bid from msg.sender. If msg.sender has already won a round or bid is higher than lowestBid,
   * this method will throw.
   */
  function bid(uint distrubtionAmountInWei)
  {
    if(distrubtionAmountInWei < lowestBid || !(members[msg.sender].paid < currentEpoch))
    {
      //set new lowestBid and winnerAddress, also trigger event new Bid placed
      lowestBid = distrubtionAmountInWei;
      winnerAddress = msg.sender;
      LogNewLowestBid(lowestBid, winnerAddress);
    }else
      throw;
  }

  /**
   * Withdraws available funds for msg.sender. If opt_destination is specified,
   * sends the fund to that address.
   */
  function withdraw(address opt_destination)
    returns(bool success)
  {
    if(members[msg.sender].alive && members[msg.sender].pendingWithdrawl > 0)
    {
      uint amountToWithdraw = members[msg.sender].pendingWithdrawl;  //use a temporary variable to avoid the receiver calling the withdraw function again before
      members[msg.sender].pendingWithdrawl = 0;                      // send() completes its task
      if (!opt_destination.send(amountToWithdraw)) {   //if the send() fails, put the allowance back to its original place
        // No need to call throw here, just reset the amount owing
        members[msg.sender].pendingWithdrawl = amountToWithdraw;
        return false;
        //TODO(shine) : look into security about withdraw
      }
      else{
        LogFundsWithdrawal(msg.sender, amountToWithdraw, opt_destination);
        return true;
      }
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

