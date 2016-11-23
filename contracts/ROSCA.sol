 pragma solidity ^0.4.4;

 /**
  * ROSCA contract allows participants to get into an agreement with each other to contribute a certain amount of ether every round
  * In every round, one participant will recieve ether that everyone contributed.
  * The winner of the pot is decided by reverse auction (lowest Bid wins).
  *
  * Things still missing/needs fixing:
  * in withdraw() , add fee related logic (done, Sol should still be discussed)
  *   Sol: will keep deduct a fee, and keep it in contract untill the end?
  * if there are contribution than what is required, put them in pendingWithdrawal (done)
  *   Sol: in contribute , check if contributed is enough to last the whole ROSCA, if it is put the excess in pendingWithdrawal
  * when the rosca ends all the money should go out to the account user (done, still needs to work out sending fees to wetrust address)
  *   Sol: added endOfROSCA, cleanUp and sendFUND function
  * checkingContribution, check whether or not a member as contributed as least contributionSize at the end of Round (goodStanding var takes care of this i think)
  *  -startRound should check?
  * if user doesnt contribute , dont allow bidding EVER! have to be in good standing to bid/win the Pot (done)
  *   Sol: used goodStanding variable to keep track of how many round a person can bet
  * contribute and withdraw doesnt check if round has started (done)
  *
  * Product Decision to think about:
  *   - biding when not everyone had contributed, total contributed is less than the bid amount
  *     Possible Solution:
  *       - owed variable? before paying the next round winner, owed is paid first?
  *       - startRound Check ? if balance is less than lowest Bid ? if it is, what to do?
  *       - in withdraw, check balance of contract first and if its less than pending withdrawal, subtract that amount only (I think this is the simplest option) (implement for now)
  *
  * Things brought up that needs considering:
  *   - allowing constructor to have initial list of members specified by foreman on ROSCA deployment
  *   - using a better unit than wei to represent ether i.e finney (we shouldn't be dealing with any value less than finney anyways)
  *   - getters for necessary variables (making variables public would work)
  *   - optimizing , contract deployment currently cost over 20 cents on test-net
  *   - someway to kill the contract when ROSCA is ended? (currently cleanUp functions includes selfdestruct)
  *   - frontend should try a call function and if it throws, warns user of possible throw before allowing transaction.
  */
 contract ROSCA {
   uint64 constant MIN_CONTRIBUTION_SIZE = 1 finney;  // 1e12
   uint64 constant MAX_CONTRIBUTION_SIZE = 10 ether;//uint64(10000000000000000000); // 10 ether in Wei
   uint16 constant MAX_FEE_IN_THOUSANDTHS = 200;
   uint32 constant MINIMUM_TIME_BEFORE_ROSCA_START = 1 days;   // startTime of the ROSCA must be at least 1 day away from when the ROSCA is created
   uint8 constant MINIMUM_PARTICIPANTS = 2;           // minimum participants for the ROSCA to start
   uint8 constant MIN_ROUND_PERIOD_IN_DAYS = 1;
   uint8 constant MAX_ROUND_PERIOD_IN_DAYS = 30;
   uint8 constant MIN_DISTRIBUTION_RATIO = 65;  // the winning bid must be at least 65% of the Pot value
   address constant WETRUST_FEE_ADDRESS = 0x0;           // TODO: needs to be updated


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
   bool endOfROSCA = false;
   address foreman;
   uint32 contributionSize;
   uint startTime;

   struct User {
     uint contributed; // Total amount contributed
     bool paid; // yes if the member had been paid
     uint pendingWithdrawal; // how much they are allowed to withdraw, i.e if someone wins , their pendingWithdrawal will go up by the bid.
     bool alive; // needed to check if a member is indeed a member
     uint goodStanding;
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
     uint32 contributionSize_,
     uint16 minParticipants_,
     uint startTime_,
     uint16 serviceFeeInThousandths_) {
     if (roundPeriodInDays_ < MIN_ROUND_PERIOD_IN_DAYS || roundPeriodInDays_ > MAX_ROUND_PERIOD_IN_DAYS) throw;
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
     members[newMember] = User({paid: false , contributed: 0, alive: true, pendingWithdrawal: 0,goodStanding: 0});
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
       members[winnerAddress].pendingWithdrawal += (lowestBid / 100000) * MAX_FEE_IN_THOUSANDTHS;
       members[winnerAddress].paid = true;
       LogRoundFundsReleased(winnerAddress, lowestBid);
     }
     if (currentRound < membersAddresses.length) {  // reset variables related to bidding
       lowestBid = contributionSize * membersAddresses.length + 1;
       winnerAddress = 0;

       currentRound++;
       LogStartOfRound(currentRound);
     } else if (currentRound == membersAddresses.length) {
         endOfROSCA = true;
     }
   }

   /**
    * try to send the fund to the opt_destination from source account
    */
   function sendFund(address source,address opt_destination) internal returns(bool success){
     uint amountToWithdraw = members[source].pendingWithdrawal  ;  // use a temporary variable to avoid the receiver calling the withdraw function again before
     if(this.balance < amountToWithdraw) amountToWithdraw = this.balance;
     members[source].pendingWithdrawal = members[source].pendingWithdrawal - amountToWithdraw;                      // send() complete its task
     if (!opt_destination.send(amountToWithdraw)) {   // if the send() fails, put the allowance back to its original place
       // No need to call throw here, just reset the amount owing
       members[source].pendingWithdrawal = amountToWithdraw;
       return false;
     } else {
       LogFundsWithdrawal(source, amountToWithdraw, opt_destination);
       return true;
     }
   }

   /**
    * cleanUp is to make sure that fees are send to where they are owed and
    * make sure contract doesn't hold any ether after it ends.
    *
    */
   function cleanUp() {
     if(!endOfROSCA || this.balance == 0) throw;

     for(uint8 i = 0; i < membersAddresses.length; i++) {
       if(members[membersAddresses[i]].pendingWithdrawal > 0){
         sendFund(membersAddresses[i],membersAddresses[i]);
       }
     }
     //send the rest to WETRUST_FEE_ADDRESS because all that is left should be the fees to service
     if(!WETRUST_FEE_ADDRESS.send(this.balance))
         throw;
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
    */
   function acceptJoinRequest(address requestor)
     onlyForeman
     onlyBeforeStart {
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
     if (!members[msg.sender].alive || currentRound == 0) throw;
     members[msg.sender].contributed += msg.value;
     members[msg.sender].goodStanding = members[msg.sender].contributed / contributionSize;
     if(members[msg.sender].contributed > contributionSize * membersAddresses.length) {
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
   function bid(uint distrubtionAmountInWei) {
     if (distrubtionAmountInWei >= lowestBid ||
         members[msg.sender].paid  ||
         currentRound == 0 ||
         members[msg.sender].goodStanding < currentRound ||
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
     if (!members[msg.sender].alive || members[msg.sender].pendingWithdrawal == 0 || currentRound == 0) throw;
     return sendFund(msg.sender, opt_destination);
   }

 }

