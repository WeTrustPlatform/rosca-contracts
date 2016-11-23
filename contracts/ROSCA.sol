pragma solidity ^0.4.4;

/**
 * ROSCA contract allows participants to get into an agreement with each other to contribute a certain amount of ether every round
 * In every round, one participant will recieve ether that everyone contributed.
 * The winner of the pot is decided by reverse auction (lowest Bid wins).
 *
 * Things still missing/needs fixing:
 * in withdraw() , add fee related logic
 * checkingContribution, check whether or not a member as contributed as least contributionSize at the end of Round
 */
contract ROSCA {
  uint32 constant MIN_CONTRIBUTION_SIZE = uint32(1000000000000);  // 1e12
  uint32 constant MAX_CONTRIBUTION_SIZE = uint32(10000000000000000000); // 10 ether in Wei
  uint32 constant MAX_FEE_IN_THOUSANDTHS = 200;
  address constant WETRUST_FEE_ADDRESS = 0x0;           // TODO: needs to be updated
  uint32 constant MINIMUM_TIME_BEFORE_ROSCA_START = 1 days;   // startTime of the ROSCA must be at least 1 day away from when the ROSCA is created
  uint32 constant MINIMUM_PARTICIPANTS = 2;           // minimum participants for the ROSCA to start
  uint32 constant MIN_ROUND_PERIOD_IN_DAYS = 1;
  uint32 constant MAX_ROUND_PERIOD_IN_DAYS = 30;
  uint32 constant MIN_DISTRIBUTION_RATIO = 65;  // the winning bid must be at least 65% of the Pot value

  event LogParticipantApplied(address user);
  event LogParticipantApproved(address user);
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
  address foreman;
  uint contributionSize;
  uint startTime;

  struct User {
    uint contributed; // Total amount contributed
    bool paid; // yes if the member had been paid
    uint pendingWithdrawl; // how much they are allowed to withdraw, i.e if someone wins , their pendingWithdrawal will go up by the bid.
    bool alive; // needed to check if a member is indeed a member
  }

  mapping(address => User) members; // using struct User to keep track of contributions and paid, allowance and etc.
  address[] membersAddresses;    // this is the only way to iterate through all the member's address

  mapping(address => bool) pendingJoinRequest; // this way , address can be used as index, if we use address[] , we'll have to go thru a whole array

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
  function ROSCA(
    uint16 roundPeriodInDays_,
    uint contributionSize_,
    uint16 minParticipants_,
    uint startTime_,
    uint16 serviceFeeInThousandths_) {
    if (roundPeriodInDays < MIN_ROUND_PERIOD_IN_DAYS || roundPeriodInDays > MAX_ROUND_PERIOD_IN_DAYS) throw;
    roundPeriodInDays = roundPeriodInDays_;
    if (contributionSize_ < MIN_CONTRIBUTION_SIZE || contributionSize_ > MAX_CONTRIBUTION_SIZE) throw;
    contributionSize = contributionSize_;


    if (minParticipants_ < MINIMUM_PARTICIPANTS) throw; // there should be at least 2 people to make a group
    minParticipants = minParticipants_;

    if (startTime_ < (now + MINIMUM_TIME_BEFORE_ROSCA_START)) throw;
    startTime = startTime_;

    if (serviceFeeInThousandths_ > MAX_FEE_IN_THOUSANDTHS) throw;
    serviceFeeInThousandths = serviceFeeInThousandths_;

    foreman = msg.sender;

    addMember(msg.sender);
  }

  function addMember(address newMember) internal {
    members[newMember] = User({paid: false , contributed: 0, alive: true, pendingWithdrawl: 0});
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
      if (winnerAddress == 0) { // only true when there is no bidder in this round
        // there is no bid in this round so find an unpaid address for this epoch
        uint semi_random = now % membersAddresses.length;
        for (uint i = 0; i < membersAddresses.length; i++) {
          if(!members[membersAddresses[(semi_random + i) % membersAddresses.length]].paid)
            winnerAddress = membersAddresses[semi_random + i];
          break;
        }
      }
      members[winnerAddress].pendingWithdrawl += lowestBid;
      members[winnerAddress].paid = true;
      LogRoundFundsReleased(winnerAddress, lowestBid);
    }
    if (currentRound < membersAddresses.length) {  // reset variables related to bidding
      lowestBid = contributionSize * membersAddresses.length + 1;
      winnerAddress = 0;

      currentRound++;
      LogStartOfRound(currentRound);
    }
  }

  /**
   * Anyone not already a member of ROSCA can request to join and they'll be put into
   * pendingJoinRequest until foreman accepts requests or ROSCA has started
   */
  function joinRequest() onlyBeforeStart {
    // only put the request in the pending list if they are not in the ROSCA already
    if (members[msg.sender].alive) throw;
    pendingJoinRequest[msg.sender] = true;
    LogParticipantApplied(msg.sender);
  }

  /**
   * foreman can call this method to approve a join request by a participant
   * once a requestor had been registered as member, the address will be taken out of pendingJoinRequest
   **/
  function acceptJoinRequest(address requestor)
    onlyForeman
    beforeStart {
    if (!pendingJoinRequest[requestor]) throw;
    addMember(requestor);
    LogParticipantApproved(requestor);
    delete(pendingJoinRequest[requestor]); // take out the requestor's address in the pending list
  }

  /**
   * Processes a periodic contribution from msg.sender ().
   * Any excess funds will be withdrawable through withdraw().
   */
  function contribute() payable {
    if (!members[msg.sender].alive) throw;
    members[msg.sender].contributed += msg.value;
    LogContributionMade(msg.sender, msg.value);
  }

  /**
   * Registers a bid from msg.sender. If msg.sender has already won a round or bid is higher than lowestBid,
   * this method will throw.
   */
  function bid(uint distrubtionAmountInWei) {
    if (distrubtionAmountInWei >= lowestBid ||
        members[msg.sender].paid  ||
        currentRound == 0 ||
        distrubtionAmountInWei < ((contributionSize * membersAddresses.length)/100) * MIN_DISTRIBUTION_RATIO) throw;
    lowestBid = distrubtionAmountInWei;
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
    if (!members[msg.sender].alive || members[msg.sender].pendingWithdrawl == 0) throw;
    uint amountToWithdraw = members[msg.sender].pendingWithdrawl;  // use a temporary variable to avoid the receiver calling the withdraw function again before
    members[msg.sender].pendingWithdrawl = 0;                      // send() completes its task
    if (!opt_destination.send(amountToWithdraw)) {   // if the send() fails, put the allowance back to its original place
      // No need to call throw here, just reset the amount owing
      members[msg.sender].pendingWithdrawl = amountToWithdraw;
      return false;
    } else {
      LogFundsWithdrawal(msg.sender, amountToWithdraw, opt_destination);
      return true;
    }
  }

}