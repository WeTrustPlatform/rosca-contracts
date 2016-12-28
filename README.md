[![Build Status](https://travis-ci.org/WeTrustPlatform/rosca-contracts.svg?branch=develop)](https://travis-ci.org/WeTrustPlatform/rosca-contracts)
# An implementation of a [ROSCA](https://en.wikipedia.org/wiki/Rotating_savings_and_credit_association) over Ethereum.
## By [WeTrust](https://www.wetrust.io)

This repository holds the [smart contract](https://github.com/WeTrustPlatform/rosca-contracts/blob/develop/contracts/ROSCA.sol) for the ROSCA MVP and its associated [tests](https://github.com/WeTrustPlatform/rosca-contracts/blob/develop/tests).


## Running tests

Make sure you have [testrpc](https://github.com/ethereumjs/testrpc) and [truffle](https://github.com/ConsenSys/truffle) installed.

First, run
```
npm install
```

from the repository's root directory.

Then run testrpc which will serve as the blockchain provider:

```
./testrpc_command.sh
```

In another terminal, run the tests using

```
tools/build/run-test.sh
```

This will create a copy of the smart contract that exposes its internal state variable and functions, then run all tests on that "publicized" copy.
