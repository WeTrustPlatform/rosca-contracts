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
  uint64 constant internal MIN_CONTRIBUTION_SIZE = 1 finney;  // 1e-3 ether
  uint128 constant internal MAX_CONTRIBUTION_SIZE = 10 ether;

  // Maximum fee (in 1/1000s) from dispersements that goes to project stakeholders.
  uint16 constant internal MAX_FEE_IN_THOUSANDTHS = 20;

  // startTime of the ROSCA must be at least this much time ahead of when the ROSCA is created
  uint32 constant internal MINIMUM_TIME_BEFORE_ROSCA_START = 1 days;

  uint8 constant internal MIN_ROUND_PERIOD_IN_DAYS = 1;
  uint8 constant internal MAX_ROUND_PERIOD_IN_DAYS = 30;
  uint8 constant internal MIN_DISTRIBUTION_PERCENT = 65;  // the winning bid must be at least 65% of the Pot value

  uint8 constant internal MAX_NEXT_BID_RATIO = 98;  // Means every new bid has to be at least 2% less than the one before

  // TODO: MUST change this prior to production. Currently this is accounts[9] of the testrpc config
  // used in tests.
  address constant internal FEE_ADDRESS = 0x1df62f291b2e969fb0849d99d9ce41e2f137006e;

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
  bool internal forepersonSurplusCollected = false;
  uint256 internal totalDiscounts; // a discount is the difference between a winning bid and the pot value
  uint256 internal totalFees = 0;

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

  modifier onlyFromFeeAddress {
    if (msg.sender != FEE_ADDRESS) throw;
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
      lowestBid = 0;
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
          winnerAddress = candidate;
          break;
        }
      }
      // Also - set lowestBid to the right value.
      lowestBid = contributionSize * membersAddresses.length;
    }
    if (winnerAddress == 0) { // no potential winner
      LogRoundNoWinner(currentRound);
    } else {
      totalDiscounts += contributionSize * membersAddresses.length - lowestBid;
      members[winnerAddress].credit += lowestBid;
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
  function contribute() payable onlyFromMember external {
    members[msg.sender].credit += msg.value;
    // TODO(ron): this has a bad edge case: it will take fees of any excessive contributions made.
    // Fix this once we switch to the contributions/winnings model.
    totalFees += msg.value / 1000 * serviceFeeInThousandths;

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
        bidInWei < ((contributionSize * membersAddresses.length) / 100) * MIN_DISTRIBUTION_PERCENT)
      throw;

    // If winnerAddress is 0, this is the first bid, hence allow full pot.
    // Otherwise, make sure bid is lower enough compared to previous bid.
    uint256 maxAllowedBid = (winnerAddress == 0 ?
        contributionSize * membersAddresses.length :
        lowestBid / 100 * MAX_NEXT_BID_RATIO);
    if (bidInWei > maxAllowedBid) {
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
    uint256 amountAfterFee = amountToWithdraw / 1000 * (1000 - serviceFeeInThousandths);

    uint256 amountAvailable = this.balance - totalFees;
    if (amountAvailable < amountAfterFee) {
      // This may happen if some participants are delinquent.
      amountAfterFee = amountAvailable;
      LogCannotWithdrawFully(amountToWithdraw, amountAvailable);
      amountToWithdraw = amountAvailable * 1000 / (1000 - serviceFeeInThousandths);
    }
    members[msg.sender].credit -= amountToWithdraw;
    if (!msg.sender.send(amountAfterFee)) {   // if the send() fails, put the allowance back to its original place
      // No need to call throw here, just reset the amount owing. This may happen
      // for nonmalicious reasons, e.g. the receiving contract running out of gas.
      members[msg.sender].credit += amountToWithdraw;
      return false;
    }
    LogFundsWithdrawal(msg.sender, amountAfterFee);
    return true;
  }

  /**
   * Allows the foreperson to end the ROSCA and retrieve any surplus funds, one
   * roundPeriodInDays after the end of the ROSCA.
   *
   * Note that startRound() must be called first after the last round, as it
   * does the bookeeping of that round.
   */
  function endOfROSCARetrieveSurplus() onlyFromForeperson roscaEnded external returns (bool) {
    uint256 roscaCollectionTime = startTime + ((membersAddresses.length + 1) * roundPeriodInDays * 1 days);
    if (now < roscaCollectionTime || forepersonSurplusCollected) throw;

    forepersonSurplusCollected = true;
    uint256 amountToCollect = this.balance - totalFees;
    if (!foreperson.send(amountToCollect)) {   // if the send() fails, put the allowance back to its original place
      // No need to call throw here, just reset the amount owing. This may happen
      // for nonmalicious reasons, e.g. the receiving contract running out of gas.
      forepersonSurplusCollected = false;
      return false;
    } else {
      LogFundsWithdrawal(foreperson, amountToCollect);
    }
  }

 /**
   * Allows the foreperson to end the ROSCA and retrieve any surplus funds, one
   * roundPeriodInDays after the end of the ROSCA.
   *
   * Note that startRound() must be called first after the last round, as it
   * does the bookeeping of that round.
   */
  function endOfROSCARetrieveFees() onlyFromFeeAddress roscaEnded external returns (bool) {
    uint256 roscaCollectionTime = startTime + ((membersAddresses.length + 1) * roundPeriodInDays * 1 days);
    if (now < roscaCollectionTime || totalFees == 0) throw;

    uint256 tempTotalFees = totalFees;  // prevent re-entry.
    totalFees = 0;
    if (!FEE_ADDRESS.send(tempTotalFees)) {   // if the send() fails, put the allowance back to its original place
      // No need to call throw here, just reset the amount owing. This may happen
      // for nonmalicious reasons, e.g. the receiving contract running out of gas.
      totalFees = tempTotalFees;
      return false;
    } else {
      LogFundsWithdrawal(FEE_ADDRESS, totalFees);
    }
  }
}
