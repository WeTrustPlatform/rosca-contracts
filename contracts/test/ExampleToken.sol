// Based on https://github.com/OpenZeppelin/zeppelin-solidity/blob/master/contracts/token/StandardToken.sol .
//
// An example ERC20 token, used for testing.
pragma solidity ^0.4.8;

import '../deps/ERC20TokenInterface.sol';
import './deps/SafeMath.sol';


/**
 * Standard ERC20 token
 *
 * https://github.com/ethereum/EIPs/issues/20
 * Based on code by FirstBlood:
 * https://github.com/Firstbloodio/token/blob/master/smart_contract/FirstBloodToken.sol
 */
contract ExampleToken is ERC20TokenInterface, SafeMath {

  mapping(address => uint256) balances;
  mapping(address => mapping (address => uint256)) allowed;

  // This is a method used only for tests.
  function injectTokens(address to, uint256 howMuch) external {
      balances[to] = balances[to] + howMuch;
  }

  function transfer(address _to, uint256 _value) external returns (bool success) {
    balances[msg.sender] = safeSub(balances[msg.sender], _value);
    balances[_to] = safeAdd(balances[_to], _value);
    Transfer(msg.sender, _to, _value);
    return true;
  }

  function transferFrom(address _from, address _to, uint256 _value) external returns (bool success) {
    uint256 _allowance = allowed[_from][msg.sender];

    // Check is not needed because safeSub(_allowance, _value) will already throw if this condition is not met
    // if (_value > _allowance) throw;

    balances[_to] = safeAdd(balances[_to], _value);
    balances[_from] = safeSub(balances[_from], _value);
    allowed[_from][msg.sender] = safeSub(_allowance, _value);
    Transfer(_from, _to, _value);
    return true;
  }

  function balanceOf(address _owner) constant external returns (uint256 balance) {
    return balances[_owner];
  }

  function approve(address _spender, uint256 _value) external returns (bool success) {
    allowed[msg.sender][_spender] = _value;
    Approval(msg.sender, _spender, _value);
    return true;
  }

  function allowance(address _owner, address _spender) constant external returns (uint256 remaining) {
    return allowed[_owner][_spender];
  }
}
