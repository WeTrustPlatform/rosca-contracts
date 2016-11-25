pragma solidity ^0.4.4;

/**
 * ROSCA contract allows participants to get into an agreement with each other to contribute a certain amount of ether every round
 * In every round, one participant will recieve ether that everyone contributed.
 * The winner of the pot is decided by reverse auction (lowest Bid wins).
 */
contract ROSCA {
  uint64 constant MIN_CONTRIBUTION_SIZE = 1 finney;
  uint128 constant MAX_CONTRIBUTION_SIZE = 10 ether;
  uint16 constant MAX_FEE_IN_THOUSANDTHS = 200;
  uint32 constant MINIMUM_TIME_BEFORE_ROSCA_START = 1 days;   // startTime of the ROSCA must be at least 1 day away from when the ROSCA is created
  uint8 constant MIN_ROUND_PERIOD_IN_DAYS = 1;
  uint8 constant MAX_ROUND_PERIOD_IN_DAYS = 30;
  uint8 constant MIN_DISTRIBUTION_PERCENT = 65;  // the winning bid must be at least 65% of the Pot value
  address constant WETRUST_FEE_ADDRESS = 0x0;           // TODO: needs to be updated

  event LogContributionMade(address user, uint amount);
  event LogNewLowestBid(uint bid,address winnerAddress);
  event LogRoundFundsReleased(address winnerAddress, uint amountInWei);
  event LogFundsWithdrawal(address user, uint amount,address destination);
  event LogStartOfRound(uint currentRound);

  // state variables
  uint16 roundPeriodInDays;
  uint16 serviceFeeInThousandths;
  uint16 currentRound;  // currentRound will be set to 0 when ROSCA is created and will turn to one when the ROSCA actually starts
  uint16 minParticipants;
  bool endOfROSCA = false;
  address foreman;
  uint128 contributionSize;
  uint startTime;

  struct User {
    uint contributed; // Total amount contributed
    bool paid; // yes if the member had been paid
    uint pendingWithdrawal; // how much they are allowed to withdraw, i.e if someone wins , their pendingWithdrawal will go up by the bid.
    bool alive; // needed to check if a member is indeed a member
  }

  mapping(address => User) members;
  address[] membersAddresses;    // this is the only way to iterate through all the member's address

   // bidding related state variable
  uint lowestBid;
  address winnerAddress;

  modifier onlyForeman {
    if(msg.sender != foreman) throw;
    _;
  }
  modifier onlyBeforeStart {
    if(currentRound != 0) throw;
    _;
  }

  /**
    * Creates a new ROSCA and initializes the necessary variables, ROSCA doesnt start until the specified startTime
    * Creator of the contract becomes foreman and also added as the first member of the ROSCA
    */
  function ROSCA (
    uint16 roundPeriodInDays_,
    uint128 contributionSize_,
    uint startTime_,
    address[] members_,
    uint16 serviceFeeInThousandths_) {
    if (roundPeriodInDays_ < MIN_ROUND_PERIOD_IN_DAYS || roundPeriodInDays_ > MAX_ROUND_PERIOD_IN_DAYS) throw;
    roundPeriodInDays = roundPeriodInDays_;
    if (contributionSize_ < MIN_CONTRIBUTION_SIZE || contributionSize_ > MAX_CONTRIBUTION_SIZE) throw;
    contributionSize = contributionSize_;



    if (startTime_ < (now + MINIMUM_TIME_BEFORE_ROSCA_START)) throw;
    startTime = startTime_;
    if (serviceFeeInThousandths_ > MAX_FEE_IN_THOUSANDTHS) throw;
    serviceFeeInThousandths = serviceFeeInThousandths_;

    foreman = msg.sender;
    addMember(msg.sender);

    for(uint i = 0; i < members_.length; i++)
    {
      addMember(members_[i]);
    }

  }

  function addMember(address newMember) internal {
    members[newMember] = User({paid: false , contributed: 0, alive: true, pendingWithdrawal: 0});
    membersAddresses.push(newMember);
  }

  /** startRound() check if the round has ended, if so, get the winner of the currentRound's pot
    * and add the amount to the winner's pending withdrawal
    * if there were no bid during the round, address selected at semi-random
    *
    * if currentRound = 0(ROSCA hasnt started), no winner is declared
    */

  function startRound() {
    uint roundStartTime = startTime + (uint(currentRound)  * (uint(roundPeriodInDays) * 1 days));
    if (now < roundStartTime || membersAddresses.length < minParticipants)
      throw;

    if (currentRound != 0) {
      if (winnerAddress == 0) {
        // there is no bid in this round so find an unpaid address for this epoch
        uint semi_random = now % membersAddresses.length;
        for (uint i = 0; i < membersAddresses.length; i++) {
          if(!members[membersAddresses[(semi_random + i) % membersAddresses.length]].paid)
            winnerAddress = membersAddresses[semi_random + i];
          break;
        }
      }
      members[winnerAddress].pendingWithdrawal += lowestBid - ((lowestBid / 10000) * serviceFeeInThousandths);
      members[winnerAddress].paid = true;
      LogRoundFundsReleased(winnerAddress, lowestBid);
    }
    if (currentRound < membersAddresses.length) {  // reset variables related to bidding
      lowestBid = contributionSize * membersAddresses.length + 1;
      winnerAddress = 0;

      currentRound++;
      LogStartOfRound(currentRound);
    } else {
        endOfROSCA = true;
    }
  }

  /**
   * try to send the fund to the destination from participant account
   */
  function sendFund (address participant ,address destination) internal returns(bool success){
    uint amountToWithdraw = members[participant].pendingWithdrawal  ;  // use a temporary variable to avoid the receiver calling the withdraw function again before
    if (this.balance < amountToWithdraw) amountToWithdraw = this.balance;
    members[participant].pendingWithdrawal = members[participant].pendingWithdrawal - amountToWithdraw;
    if (!destination.send(amountToWithdraw)) {   // if the send() fails, put the allowance back to its original place
      // No need to call throw here, just reset the amount owing
      members[participant].pendingWithdrawal += amountToWithdraw;
      return false;
    } else {
      LogFundsWithdrawal(participant, amountToWithdraw, destination);
      return true;
    }
  }

  /**
   * cleanUp is to make sure that fees are send to where they are owed and
   * make sure contract doesn't hold any ether after it ends.
   *
   */
  function cleanUp() {
    if(!endOfROSCA || this.balance > 0) throw;
    selfdestruct(foreman);
  }

  /**
   * Processes a periodic contribution from msg.sender ().
   * Any excess funds will be withdrawable through withdraw().
   */
  function contribute() payable {
    if (!members[msg.sender].alive || currentRound == 0 || endOfROSCA) throw;
    members[msg.sender].contributed += msg.value;
    if (members[msg.sender].contributed > contributionSize * membersAddresses.length) {
      uint excessContribution = members[msg.sender].contributed - (contributionSize * membersAddresses.length);
      members[msg.sender].contributed -= excessContribution;
      members[msg.sender].pendingWithdrawal += excessContribution;
    }
    LogContributionMade(msg.sender, msg.value);
  }

  /**
   * Registers a bid from msg.sender. If msg.sender has already won a round or bid is higher than lowestBid,
   * this method will throw.
   */
  function bid(uint bidInWei) {
    if (bidInWei >= lowestBid ||
        members[msg.sender].paid  ||
        currentRound == 0 ||
        members[msg.sender].contributed / contributionSize < currentRound ||
        bidInWei < ((contributionSize * membersAddresses.length)/100) * MIN_DISTRIBUTION_PERCENT) throw;
    lowestBid = bidInWei;
    winnerAddress = msg.sender;
    LogNewLowestBid(lowestBid, winnerAddress);
  }

  /**
   * Withdraws available funds for msg.sender. If opt_destination is specified,
   * sends the fund to that address.
   */
  function withdraw(address opt_destination) returns(bool success) {
    if (opt_destination == 0)
      opt_destination = msg.sender;
    if (!members[msg.sender].alive || members[msg.sender].pendingWithdrawal == 0 || currentRound == 0) throw;
    return sendFund(msg.sender, opt_destination);
  }
}


