#!/usr/bin/env python3

"""
Unit test for publicizer.py
"""

import unittest
import publicizer as p

class PublicizerTest(unittest.TestCase):

  # Helpers
  def assert_publicized(self, expected, source):
    self.assertEqual(expected, p.substitute(source))

  def assert_not_publicized(self, source):
    self.assertEqual(source, p.substitute(source))

  # Tests
  def test_ignores_unrelated_strings(self):
    self.assert_not_publicized("nothing")

  def test_ignores_unrelated_multiline_strings(self):
    self.assert_not_publicized("line1\n line2\n")

  def test_empty_string(self):
    self.assert_not_publicized("")

  def test_changes_internal_to_public(self):
    self.assert_publicized(
        "uint256 public /* modifiedForTest */ x;",
        "uint256 internal x;")

  def test_changes_private_to_public(self):
    self.assert_publicized(
        "uint256 public /* modifiedForTest */ x;",
        "uint256 private x;")

  def test_does_not_changes_private_to_public_if_dontMakePublic(self):
    self.assert_not_publicized(
        "uint256 internal x;  // dontMakePublic")

  def test_does_not_changes_internal_to_public_if_dontMakePublic(self):
    self.assert_not_publicized(
        "uint256 private x;  // dontMakePublic")

  def test_does_not_change_other_modifiers(self):
    self.assert_not_publicized(
        "uint256 external x;")

  def replaces_contract_name(self):
    self.assert_publicized(
        "contract MyContractTest {",
        "contract MyContract   {")

if __name__ == "__main__":
  unittest.main()

