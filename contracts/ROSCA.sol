pragma solidity ^0.4.4;

/**
 * A ROSCA (Rotating and Savings Credit Association) is an agreement between
 * trusted friends to contribute funds on a periodic basis to a "pot", and in
 * each round one of the participants receives the pot (termed "winner").
 * The winner is selected as the person who makes the lowest bit in that round
 * among those who have not won a bid before.
 * The discount (gap between bid and total round contributions) is dispersed
 * evenly between the participants.
 */
contract ROSCA {
  uint64 constant MIN_CONTRIBUTION_SIZE = 1 finney;  // 1e-3 ether
  uint128 constant MAX_CONTRIBUTION_SIZE = 10 ether;

  // Maximum fee (in 1/1000s) from dispersements that goes to project stakeholders.
  uint16 constant MAX_FEE_IN_THOUSANDTHS = 20;

  // startTime of the ROSCA must be at least this much time ahead of when the ROSCA is created
  uint32 constant MINIMUM_TIME_BEFORE_ROSCA_START = 1 days;

  uint8 constant MIN_ROUND_PERIOD_IN_DAYS = 1;
  uint8 constant MAX_ROUND_PERIOD_IN_DAYS = 30;
  uint8 constant MIN_DISTRIBUTION_PERCENT = 65;  // the winning bid must be at least 65% of the Pot value

  address constant WETRUST_FEE_ADDRESS = 0x0;           // TODO: needs to be updated

  event LogContributionMade(address user, uint256 amount);
  event LogStartOfRound(uint256 currentRound);
  event LogNewLowestBid(uint256 bid,address winnerAddress);
  event LogRoundFundsReleased(address winnerAddress, uint256 amountInWei);
  event LogRoundNoWinner(uint256 currentRound);
  event LogFundsWithdrawal(address user, uint256 amount);
  event LogCannotWithdrawFully(uint256 requestedAmount,uint256 contractBalance);
  event LogUnsuccessfulBid(address bidder,uint256 bidInWei,uint256 lowestBid);

  // ROSCA parameters
  uint16 internal roundPeriodInDays;
  uint16 internal serviceFeeInThousandths;
  uint16 internal currentRound;  // set to 0 when ROSCA is created, becomes 1 when ROSCA starts
  address internal foreperson;
  uint128 internal contributionSize;
  uint256 internal startTime;

  // ROSCA state
  bool internal endOfROSCA = false;
  uint256 internal totalDiscounts; // a discount is the difference between a winning bid and the pot value

  // Round state
  uint256 internal lowestBid;
  address internal winnerAddress;

  mapping(address => User) internal members;
  address[] internal membersAddresses;    // for  iterating through members' addresses

  struct User {
    uint256 credit;  // amount of funds user has contributed so far
    bool paid; // yes if the member had won a Round
    bool alive; // needed to check if a member is indeed a member
  }

  modifier onlyFromMember {
    if (!members[msg.sender].alive) throw;
    _;
  }

  modifier onlyFromForeperson {
    if (msg.sender != foreperson) throw;
    _;
  }

  modifier roscaNotEnded {
    if (endOfROSCA) throw;
    _;
  }

  modifier roscaEnded {
    if (!endOfROSCA) throw;
    _;
  }

  /**
    * Creates a new ROSCA and initializes the necessary variables. ROSCA starts after startTime.
    * Creator of the contract becomes foreperson and a participant.
    */
  function ROSCA (
    uint16 roundPeriodInDays_,
    uint128 contributionSize_,
    uint256 startTime_,
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

    foreperson = msg.sender;
    addMember(msg.sender);

    for (uint16 i = 0; i < members_.length; i++) {
      addMember(members_[i]);
    }
  }

  function addMember(address newMember) internal {
    if (members[newMember].alive) throw;
    members[newMember] = User({paid: false , credit: 0, alive: true});
    membersAddresses.push(newMember);
  }

  /**
    * Calculates the winner of the current round's pot, and credits her.
    * If there were no bids during the round, winner is selected semi-randomly.
    */
  function startRound() roscaNotEnded external {
    uint256 roundStartTime = startTime + (uint(currentRound)  * roundPeriodInDays * 1 days);
    if (now < roundStartTime )  // too early to start a new round.
      throw;

    if (currentRound != 0) {
      cleanUpPreviousRound();
    }
    if (currentRound < membersAddresses.length) {
      // We reset to one more than the pot, so that participants can bid the actual
      // pot size.
      lowestBid = contributionSize * membersAddresses.length + 1;
      winnerAddress = 0;

      currentRound++;
      LogStartOfRound(currentRound);
    } else {
        endOfROSCA = true;
    }
  }

  function cleanUpPreviousRound() internal {
    if (winnerAddress == 0) {
      // There is no bid in this round. Find an unpaid address for this epoch.
      uint256 semi_random = now % membersAddresses.length;
      for (uint16 i = 0; i < membersAddresses.length; i++) {
        address candidate = membersAddresses[(semi_random + i) % membersAddresses.length];
        if (!members[candidate].paid &&
            members[candidate].credit + (totalDiscounts / membersAddresses.length) >= (currentRound * contributionSize)) { // check if the member is in good standing
          winnerAddress = membersAddresses[candidate];
          break;
        }
      }
      // Also - lowestBid was initialized to 1 + pot size in startRound(). Fix that.
      lowestBid--;
    }
    if (winnerAddress == 0) { // no potential winner
      LogRoundNoWinner(currentRound);
    } else {
      totalDiscounts += contributionSize * membersAddresses.length - lowestBid;
      members[winnerAddress].credit += lowestBid - ((lowestBid / 1000) * serviceFeeInThousandths);
      members[winnerAddress].paid = true;
      LogRoundFundsReleased(winnerAddress, lowestBid);
    }
  }

  /**
   * Processes a periodic contribution. Note msg.sender must be one of the participants
   * (this will let the contract identify the contributor).
   *
   * Any excess funds are withdrawable through withdraw().
   */
  function contribute() payable onlyFromMember roscaNotEnded external {
    members[msg.sender].credit += msg.value;

    LogContributionMade(msg.sender, msg.value);
  }

  /**
   * Registers a bid from msg.sender. Participant should call this method
   * only if all of the following holds for her:
   * + Never won a round.
   * + Is in good standing (i.e. actual contributions, including this round's,
   *   plus earned discounts are together greater than required contributions).
   * + New bid is lower than the lowest bid so far.
   */
  function bid(uint256 bidInWei) external {
    if (members[msg.sender].paid  ||
        currentRound == 0 ||  // ROSCA hasn't started yet
        // participant not in good standing
        members[msg.sender].credit + (totalDiscounts / membersAddresses.length) < (currentRound * contributionSize) ||
        // bid is less than minimum allowed
        bidInWei < ((contributionSize * membersAddresses.length)/100) * MIN_DISTRIBUTION_PERCENT)
      throw;
    if (bidInWei >= lowestBid) {
      // We don't throw as this may be hard for the frontend to predict on the
      // one hand, and would waste the caller's gas on the other.
      LogUnsuccessfulBid(msg.sender, bidInWei, lowestBid);
      return;
    }
    lowestBid = bidInWei;
    winnerAddress = msg.sender;
    LogNewLowestBid(lowestBid, winnerAddress);
  }

  /**
   * Withdraws available funds for msg.sender. If opt_destination is nonzero,
   * sends the fund to that address, otherwise sends to msg.sender.
   */
  function withdraw() onlyFromMember external returns(bool success) {
    uint256 totalCredit = members[msg.sender].credit + totalDiscounts / membersAddresses.length;
    uint256 totalDebit = currentRound * contributionSize;
    if (totalDebit >= totalCredit) throw;  // nothing to withdraw
    uint256 amountToWithdraw = totalCredit - totalDebit;

    if (this.balance < amountToWithdraw) { // this should never happen, indicates a bug
      LogCannotWithdrawFully(amountToWithdraw, this.balance);
      amountToWithdraw = this.balance;  // Let user withdraw the funds into a safe place
    }
    members[msg.sender].credit -= amountToWithdraw;
    if (!msg.sender.send(amountToWithdraw)) {   // if the send() fails, put the allowance back to its original place
      // No need to call throw here, just reset the amount owing. This may happen
      // for nonmalicious reasons, e.g. the receiving contract running out of gas.
      members[msg.sender].credit += amountToWithdraw;
      return false;
    }
    LogFundsWithdrawal(msg.sender, amountToWithdraw);
    return true;
  }

  /**
   * Allows the foreperson to end the ROSCA and retrieve any surplus funds, one 
   * roundPeriodInDays after the end of the ROSCA.
   * The contract is deleted from the blockchain at this stage.
   * TODO(ron): change this logic once we introduce fees.
   * TODO(ron): add tests once Shine's testing PRs get pushed.
   */
  function endROSCARetrieveFunds() onlyFromForeperson roscaEnded external {
    uint256 roscaCollectionTime = startTime + ((membersAddresses.length + 1) * roundPeriodInDays * 1 days);
    if (now < roscaCollectionTime) throw;
    selfdestruct(foreperson);
  }
}
