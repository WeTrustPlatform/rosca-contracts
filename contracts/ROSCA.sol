pragma solidity ^0.4.7;

import "./deps/ERC20TokenInterface.sol";

/**
 * @title ROSCA on a blockchain.
 *
 * A ROSCA (Rotating and Savings Credit Association) is an agreement between
 * trusted friends to contribute funds on a periodic basis to a "pot", and in
 * each round one of the participants receives the pot (termed "winner").
 * The winner is selected as the person who makes the lowest bid in that round
 * among those who have not won a bid before.
 * The discount (gap between bid and total round contributions) is dispersed
 * evenly between the participants.
 *
 * Supports ETH and ERC20-compliant tokens.
 */
contract ROSCA {

  uint16 public constant CONTRACT_VERSION  = 2;
  ////////////
  // CONSTANTS
  ////////////
  // Maximum fee (in 1/1000s) from dispersements that is shared between foreperson and other stakeholders..
  uint16 constant internal MAX_FEE_IN_THOUSANDTHS = 20;

  // Start time of the ROSCA must be not more than this much time ago when the ROSCA is created
  // This is to prevent accidental or malicious deployment of ROSCAs that are supposedly
  // already in round number X > 1 and participants are supposedly delinquent.
  uint32 constant internal MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS = 900;  // 15 minutes

  // the winning bid must be at least this much of the maximum (aka default) pot value
  uint8 constant internal MIN_DISTRIBUTION_PERCENT = 65;

  // Every new bid has to be at most this much of the previous lowest bid
  uint8 constant internal MAX_NEXT_BID_RATIO = 98;

  // TODO(ron): replace this with an actual wallet. Right now this is accounts[9] of the testrpc used
  // by tests.
  // WeTrust's account from which Escape Hatch can be enabled.
  address constant internal ESCAPE_HATCH_ENABLER = 0x1dF62f291b2E969fB0849d99D9Ce41e2F137006e;

  /////////
  // EVENTS
  /////////
  event LogContributionMade(address user, uint256 amount);
  event LogStartOfRound(uint256 currentRound);
  event LogNewLowestBid(uint256 bid, address winnerAddress);
  event LogRoundFundsReleased(address winnerAddress, uint256 amount);
  event LogRoundNoWinner(uint256 currentRound);
  event LogFundsWithdrawal(address user, uint256 amount);
  // Fired when withdrawer is entitled for a larger amount than the contract
  // actually holds (excluding fees). A LogFundsWithdrawal will follow
  // this event with the actual amount released, if send() is successful.
  event LogCannotWithdrawFully(uint256 creditAmount);
  event LogUnsuccessfulBid(address bidder, uint256 bid, uint256 lowestBid);
  event LogEndOfROSCA();
  event LogForepersonSurplusWithdrawal(uint256 amount);
  event LogFeesWithdrawal(uint256 amount);

  // Escape hatch related events.
  event LogEscapeHatchEnabled();
  event LogEscapeHatchActivated();
  event LogEmergencyWithdrawalPerformed(uint256 fundsDispersed);

  ////////////////////
  // STORAGE VARIABLES
  ////////////////////

  // ROSCA parameters
  uint256 internal roundPeriodInSecs;
  uint16 internal serviceFeeInThousandths;
  uint16 internal currentRound;  // set to 0 when ROSCA is created, becomes 1 when ROSCA starts
  address internal foreperson;
  uint128 internal contributionSize;
  uint256 internal startTime;
  ERC20TokenInterface public tokenContract;  // public - allow easy verification of token contract.

  // ROSCA state
  bool internal endOfROSCA = false;
  bool internal forepersonSurplusCollected = false;
  // A discount is the difference between a winning bid and the pot value. totalDiscounts is the amount
  // of discounts accumulated so far, divided by the number of ROSCA participants.
  uint256 internal totalDiscounts = 0;

  // Amount of fees reserved in the contract for fees.
  uint256 internal totalFees = 0;

  // Round state variables
  uint256 internal lowestBid = 0;
  address internal winnerAddress = 0;  // bidder who bid the lowest so far

  mapping(address => User) internal members;
  address[] internal membersAddresses;  // for iterating through members' addresses

  // Other state
  // An escape hatch is used in case a major vulnerability is discovered in the contract code.
  // The following procedure is then put into action:
  // 1. WeTrust sends a transaction to make escapeHatchEnabled true.
  // 2. foreperson is notified and can decide to activate the escapeHatch.
  // 3. If escape hatch is activated, no contributions and/or withdrawals are allowed. The foreperson
  //    may call withdraw() to withdraw all of the contract's funds and then disperse them offline
  //    among the participants.
  bool internal escapeHatchEnabled = false;
  bool internal escapeHatchActive = false;

  struct User {
    uint256 credit;  // amount of funds user has contributed - winnings (not including discounts) so far
    bool debt; // true if user won the pot while not in good standing and is still not in good standing
    bool paid; // yes if the member had won a Round
    bool alive; // needed to check if a member is indeed a member
  }

  ////////////
  // MODIFIERS
  ////////////
  modifier onlyFromMember {
    if (!members[msg.sender].alive) {
      throw;
    }
    _;
  }

  modifier onlyFromForeperson {
    if (msg.sender != foreperson) {
      throw;
    }
    _;
  }

  modifier onlyIfRoscaNotEnded {
    if (endOfROSCA) {
      throw;
    }
    _;
  }

  modifier onlyIfRoscaEnded {
    if (!endOfROSCA) {
      throw;
    }
    _;
  }

  modifier onlyIfEscapeHatchActive {
    if (!escapeHatchActive) {
      throw;
    }
    _;
  }

  modifier onlyIfEscapeHatchInactive {
    if (escapeHatchActive) {
      throw;
    }
    _;
  }

  modifier onlyFromEscapeHatchEnabler {
    if (msg.sender != ESCAPE_HATCH_ENABLER) {
      throw;
    }
    _;
  }

  ////////////
  // FUNCTIONS
  ////////////

  /**
    * @dev Creates a new ROSCA and initializes the necessary variables. ROSCA starts after startTime.
    * Creator of the contract becomes foreperson and a participant.
    *
    * If erc20TokenContract is 0, ETH is taken to be the currency of this ROSCA. Otherwise, this
    * contract assumes `erc20tokenContract` specifies an ERC20-compliant token contract.
    * Note it's the creator's responsibility to check that the provided contract is ERC20 compliant and that
    * it's safe to use.
    */
  function ROSCA(
      ERC20TokenInterface erc20tokenContract,  // pass 0 to use ETH
      uint256 roundPeriodInSecs_,
      uint128 contributionSize_,
      uint256 startTime_,
      address[] members_,
      uint16 serviceFeeInThousandths_) {
    if (roundPeriodInSecs_ == 0) {
      throw;
    }
    roundPeriodInSecs = roundPeriodInSecs_;

    contributionSize = contributionSize_;

    if (startTime_ < (now - MAXIMUM_TIME_PAST_SINCE_ROSCA_START_SECS)) {
      throw;
    }
    startTime = startTime_;
    if (serviceFeeInThousandths_ > MAX_FEE_IN_THOUSANDTHS) {
      throw;
    }
    tokenContract = erc20tokenContract;
    serviceFeeInThousandths = serviceFeeInThousandths_;

    foreperson = msg.sender;
    addMember(msg.sender);

    for (uint16 i = 0; i < members_.length; i++) {
      addMember(members_[i]);
    }
  }

  function addMember(address newMember) internal {
    if (members[newMember].alive) {  // already registered
      throw;
    }
    members[newMember] = User({paid: false , credit: 0, alive: true, debt: false});
    membersAddresses.push(newMember);
  }

  /**
    * @dev Calculates the winner of the current round's pot, and credits her.
    * If there were no bids during the round, winner is selected semi-randomly.
    * Priority is given to non-delinquent participants.
    */
  function startRound() onlyIfRoscaNotEnded external {
    uint256 roundStartTime = startTime + (uint(currentRound)  * roundPeriodInSecs);
    if (now < roundStartTime ) {  // too early to start a new round.
      throw;
    }

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
        LogEndOfROSCA();
    }
  }

  function cleanUpPreviousRound() internal {
    address delinquentWinner = 0x0;
    uint256 winnerIndex;
    bool winnerSelectedThroughBid = (winnerAddress != 0);
    uint16 numUnpaidParticipants = uint16(membersAddresses.length) - (currentRound - 1);
    if (winnerAddress == 0) {
      // There was no bid in this round. Find an unpaid address for this epoch.
      // Give priority to members in good standing (not delinquent).
      // Note this randomness does not require high security, that's why we feel ok with using the block's timestamp.
      // Everyone will be paid out eventually.
      uint256 semi_random = now % numUnpaidParticipants;
      for (uint16 i = 0; i < numUnpaidParticipants; i++) {
        uint256 index = (semi_random + i) % numUnpaidParticipants;
        address candidate = membersAddresses[index];
        if (!members[candidate].paid) {
          winnerIndex = index;
          if (members[candidate].credit + totalDiscounts >= (currentRound * contributionSize)) {
            // We found a non-delinquent winner.
            winnerAddress = candidate;
            break;
          }
          delinquentWinner = candidate;
        }
      }
      if (winnerAddress == 0) {  // we did not find any non-delinquent winner.
        // Perform some basic sanity checks.
        if (delinquentWinner == 0 || members[delinquentWinner].paid) throw;
        winnerAddress = delinquentWinner;
        // Set the flag to true so we know this user cannot withdraw until debt has been paid.
        members[winnerAddress].debt = true;
      }
      // Set lowestBid to the right value since there was no winning bid.
      lowestBid = contributionSize * membersAddresses.length;
    }
    // We keep the unpaid participants at positions [0..num_participants - current_round) so that we can uniformly select
    // among them (if we didn't do that and there were a few consecutive paid participants, we'll be more likely to select the
    // next unpaid member).
    swapWinner(winnerIndex, winnerSelectedThroughBid, numUnpaidParticipants - 1);

    uint256 currentRoundTotalDiscounts = removeFees(contributionSize * membersAddresses.length - lowestBid);
    totalDiscounts += currentRoundTotalDiscounts / membersAddresses.length;
    members[winnerAddress].credit += removeFees(lowestBid);
    members[winnerAddress].paid = true;
    LogRoundFundsReleased(winnerAddress, lowestBid);
    recalculateTotalFees();
  }

  // Recalculates that total fees that should be allocated in the contract.
  function recalculateTotalFees() {
    // Start with the max theoretical fees if no one was delinquent, and
    // reduce funds not actually contributed because of delinquencies.
    uint256 requiredContributions = currentRound * contributionSize;
    uint256 grossTotalFees = requiredContributions * membersAddresses.length;

    for (uint16 j = 0; j < membersAddresses.length; j++) {
      User member = members[membersAddresses[j]];
      uint256 credit = member.credit;
      uint256 debit = requiredContributions;
      if (member.debt) {
        // As a delinquent member won, we'll reduce the funds subject to fees by the default pot they must have won (since
        // they could not bid), to correctly calculate their delinquency.
        debit += removeFees(membersAddresses.length * contributionSize);
      }
      if (credit + totalDiscounts < debit) {
        grossTotalFees -= debit - credit - totalDiscounts;
      }
    }

    totalFees = grossTotalFees * serviceFeeInThousandths / 1000;
  }

  // Swaps membersAddresses[winnerIndex] with membersAddresses[indexToSwap]. However,
  // if winner was selected through a bid, winnerIndex was not set, and we find it first.
  function swapWinner(
    uint256 winnerIndex, bool winnerSelectedThroughBid, uint256 indexToSwap) internal {
    if (winnerSelectedThroughBid) {
      // Since winner was selected through a bid, we were not able to set winnerIndex, so search
      // for the winner among the unpaid participants.
      for (uint16 i = 0; i <= indexToSwap; i++) {
        if (membersAddresses[i] == winnerAddress) {
          winnerIndex = i;
          break;
        }
      }
    }
    // We now want to swap winnerIndex with indexToSwap, but we already know membersAddresses[winnerIndex] == winnerAddress.
    membersAddresses[winnerIndex] = membersAddresses[indexToSwap];
    membersAddresses[indexToSwap] = winnerAddress;
  }

  // Calculates the specified amount net amount after fees.
  function removeFees(uint256 amount) internal returns (uint256) {
    // First multiply to reduce roundoff errors.
    return amount * (1000 - serviceFeeInThousandths) / 1000;
  }

  // Validates a non-zero contribution from msg.sender and returns
  // the amount.
  function validateAndReturnContribution() internal returns (uint256) {  // dontMakePublic
    bool isEthRosca = (tokenContract == address(0));
    if (!isEthRosca && msg.value > 0) {  // token ROSCAs should not accept ETH
      throw;
    }
    uint256 value = (isEthRosca ? msg.value : tokenContract.allowance(msg.sender, address(this)));
    if (value == 0) {
      throw;
    }
    if (isEthRosca) {
      return value;
    }
    if (!tokenContract.transferFrom(msg.sender, address(this), value)) {
      throw;
    }
    return value;
  }

  /**
   * Processes a periodic contribution. msg.sender must be one of the participants and will thus
   * identify the contributor.
   *
   * Any excess funds are withdrawable through withdraw() without fee.
   */
  function contribute() payable onlyFromMember onlyIfRoscaNotEnded onlyIfEscapeHatchInactive external {
    User member = members[msg.sender];
    uint256 value = validateAndReturnContribution();
    member.credit += value;
    if (member.debt) {
      // Check if user comes out of debt. We know they won an entire pot as they could not bid,
      // so we check whether their credit w/o that winning is non-delinquent.
      // check that credit must defaultPot (when debt is set to true, defaultPot was added to credit as winnings) +
      // currentRound in order to be out of debt
      uint256 requiredContributions = currentRound * contributionSize;
      if (member.credit + totalDiscounts - removeFees(membersAddresses.length * contributionSize) >= requiredContributions) {
          member.debt = false;
      }
    }

    LogContributionMade(msg.sender, value);
  }

  /**
   * Registers a bid from msg.sender. Participant should call this method
   * only if all of the following holds for her:
   * + Never won a round.
   * + Is in good standing (i.e. actual contributions, including this round's,
   *   plus any past earned discounts are together greater than required contributions).
   * + New bid is lower than the lowest bid so far.
   */
  function bid(uint256 bid) onlyFromMember onlyIfRoscaNotEnded onlyIfEscapeHatchInactive external {
    if (members[msg.sender].paid  ||
        currentRound == 0 ||  // ROSCA hasn't started yet
        // participant not in good standing
        members[msg.sender].credit + totalDiscounts < (currentRound * contributionSize) ||
        // bid is less than minimum allowed
        bid < contributionSize * membersAddresses.length * MIN_DISTRIBUTION_PERCENT / 100) {
      throw;
    }

    // If winnerAddress is 0, this is the first bid, hence allow full pot.
    // Otherwise, make sure bid is low enough compared to previous bid.
    uint256 maxAllowedBid = winnerAddress == 0
        ? contributionSize * membersAddresses.length
        : lowestBid * MAX_NEXT_BID_RATIO / 100;
    if (bid > maxAllowedBid) {
      // We don't throw as this may be hard for the frontend to predict on the
      // one hand because someone else might have bid at the same time,
      // and we'd like to avoid wasting the caller's gas.
      LogUnsuccessfulBid(msg.sender, bid, lowestBid);
      return;
    }
    lowestBid = bid;
    winnerAddress = msg.sender;
    LogNewLowestBid(lowestBid, winnerAddress);
  }

  // Sends funds (either ETH or tokens) to msg.sender. Returns whether successful.
  function sendFundsToMsgSender(uint256 value) internal returns (bool) {
    bool isEthRosca = (tokenContract == address(0));
    if (isEthRosca) {
      return msg.sender.send(value);
    }
    return tokenContract.transfer(msg.sender, value);
  }

  /**
   * Withdraws available funds for msg.sender.
   */
  function withdraw() onlyFromMember onlyIfEscapeHatchInactive external returns(bool success) {
    if (members[msg.sender].debt && !endOfROSCA) {  // delinquent winners need to first pay their debt
      throw;
    }
    uint256 totalCredit = members[msg.sender].credit + totalDiscounts;

    uint256 totalDebit = members[msg.sender].debt
        ? removeFees(membersAddresses.length * contributionSize)  // this must be end of rosca
        : currentRound * contributionSize;
    if (totalDebit >= totalCredit) {  // nothing to withdraw
        throw;
    }

    uint256 amountToWithdraw = totalCredit - totalDebit;
    uint256 amountAvailable = getBalance() - totalFees;

    if (amountAvailable < amountToWithdraw) {
      // This may happen if some participants are delinquent.
      LogCannotWithdrawFully(amountToWithdraw);
      amountToWithdraw = amountAvailable;
    }
    members[msg.sender].credit -= amountToWithdraw;
    if (!sendFundsToMsgSender(amountToWithdraw)) {   // if the send() fails, restore the allowance
      // No need to call throw here, just reset the amount owing. This may happen
      // for nonmalicious reasons, e.g. the receiving contract running out of gas.
      members[msg.sender].credit += amountToWithdraw;
      return false;
    }
    LogFundsWithdrawal(msg.sender, amountToWithdraw);
    return true;
  }

  /**
   * Returns how much a user can withdraw (positive return value),
   * or how much they need to contribute to be in good standing (negative return value)
   */
  function getParticipantBalance(address user) onlyFromMember external constant returns(int256) {
    int256 totalCredit = int256(members[user].credit + totalDiscounts);

    // if rosca have ended, we don't need to subtract as totalDebit should equal to default winnings
    if (members[user].debt && !endOfROSCA) {
        totalCredit -= int256(removeFees(membersAddresses.length * contributionSize));
    }
    int256 totalDebit = int256(currentRound * contributionSize);

    return totalCredit - totalDebit;
  }

  /**
   * Returns the amount of funds this contract holds excluding fees. This is
   * the amount withdrawable by participants.
   */
  function getContractNetBalance() external constant returns(uint256) {
    return getBalance() - totalFees;
  }

  /**
   * Returns the balance of this contract, in ETH or the ERC20 token involved.
   */
  function getBalance() internal constant returns (uint256) {
    bool isEthRosca = (tokenContract == address(0));

    return isEthRosca ? this.balance : tokenContract.balanceOf(address(this));
  }

  /**
   * @dev Allows the foreperson to retrieve any surplus funds, one roundPeriodInSecs after
   * the end of the ROSCA. Note this does not retrieve the foreperson's fees, which should
   * be retireved by calling endOfROSCARetrieveFees.
   *
   * Note that startRound() must be called first after the last round, as it
   * does the bookeeping of that round.
   */
  function endOfROSCARetrieveSurplus() onlyFromForeperson onlyIfRoscaEnded external {
    uint256 roscaCollectionTime = startTime + ((membersAddresses.length + 1) * roundPeriodInSecs);
    if (now < roscaCollectionTime || forepersonSurplusCollected) {
        throw;
    }

    forepersonSurplusCollected = true;
    uint256 amountToCollect = getBalance() - totalFees;
    if (!sendFundsToMsgSender(amountToCollect)) {   // if the send() fails, restore the flag
      // No need to call throw here, just reset the amount owing. This may happen
      // for nonmalicious reasons, e.g. the receiving contract running out of gas.
      forepersonSurplusCollected = false;
    } else {
      LogForepersonSurplusWithdrawal(amountToCollect);
    }
  }

  /**
   * @dev Allows the foreperson to extract the fees in the contract. Can be called
   * after the end of the ROSCA.
   *
   * Note that startRound() must be called first after the last round, as it
   * does the bookeeping of that round.
   */
  function endOfROSCARetrieveFees() onlyFromForeperson onlyIfRoscaEnded external {
    uint256 tempTotalFees = totalFees;  // prevent re-entry.
    totalFees = 0;
    if (!sendFundsToMsgSender(tempTotalFees)) {   // if the send() fails, restore totalFees
      // No need to call throw here, just reset the amount owing. This may happen
      // for nonmalicious reasons, e.g. the receiving contract running out of gas.
      totalFees = tempTotalFees;
    } else {
      LogFeesWithdrawal(tempTotalFees);
    }
  }

  /**
   * Allows the Escape Hatch Enabler (controlled by WeTrust) to enable the Escape Hatch in case of
   * emergency (e.g. a major vulnerability found in the contract).
   */
  function enableEscapeHatch() onlyFromEscapeHatchEnabler external {
    escapeHatchEnabled = true;
    LogEscapeHatchEnabled();
  }

  /**
   * Allows the foreperson to active the Escape Hatch after the Enabled enabled it. This will freeze all
   * contributions and withdrawals, and allow the foreperson to retrieve all funds into their own account,
   * to be dispersed offline to the other participants.
   */
  function activateEscapeHatch() onlyFromForeperson external {
    if (!escapeHatchEnabled) {
      throw;
    }
    escapeHatchActive = true;
    LogEscapeHatchActivated();
  }

  /**
   * Can only be called by the foreperson after an escape hatch is activated,
   * this sends all the funds to the foreperson by selfdestructing this contract.
   */
  function emergencyWithdrawal() onlyFromForeperson onlyIfEscapeHatchActive {
    LogEmergencyWithdrawalPerformed(getBalance());
    // Send everything, including potential fees, to foreperson to disperse offline to participants.
    bool isEthRosca = (tokenContract == address(0));
    if (!isEthRosca) {
      uint256 balance = tokenContract.balanceOf(address(this));
      // we don't care much about the success of transfer` here as there's not much we can do.
      tokenContract.transfer(foreperson, balance);
    }
    selfdestruct(foreperson);
  }
}
