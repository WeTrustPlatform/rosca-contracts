#!/usr/bin/env python3

"""
Usage: publicizer.py SomeContract.sol

Prepares a contract for testing by creating a new file SomeContractTest.sol
which contains a modified version of the original contents:
* the contract name "SomeContract" is replaced with "SomeContractTest"
* "internal" and "private" are replaced with "public"

"""

import math
import re
from shutil import copyfile
import sys
import time


def substitute(content):
  """Does the actual substitution"""

  internalOrPrivateRe = re.compile(r'\s+(internal|private)\s*')
  replaceWith = ' public /* modifiedForTest */ '

  replacedContent = internalOrPrivateRe.sub(replaceWith, content)

  contractNameMatch = re.search(r'contract\s+(\w+)\s*{', replacedContent)
  if not contractNameMatch:
    return replacedContent

  contractNameRe = re.compile("(contract|function)\s+(%s)\s*" % contractNameMatch.group(1))
  replaceWith = r'\1 \2Test '
  replacedContent = contractNameRe.sub(replaceWith, replacedContent)
  return replacedContent

if __name__ == "__main__":
  content = open(sys.argv[1], 'r').read()
  outputFile = sys.argv[1].split('.sol')[0] + 'Test.sol'
  with open(outputFile, "w") as file:
    newcontent = substitute(content)
    file.write(newcontent)

