#!/bin/bash

runCommand() {
  echo "### $@"
  $@
}
# Create ROSCATest.sol with all the internal
# variable and functions publicized
runCommand ./tools/build/publicizer.py contracts/ROSCA.sol

runCommand truffle compile
runCommand truffle migrate --reset
runCommand truffle test
