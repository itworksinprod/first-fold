import test from "node:test";
import assert from "node:assert/strict";
import { claimCaveatErrors } from "../scripts/automation/free/claim-caveats.mjs";

const advisory = `The backup driver permits a local user to write to physical disks.
When Secure Boot is disabled, this can allow execution of arbitrary UEFI-level code before the operating system starts.
The advisory does not establish exploitation in the wild or identify a fixed version.
Version 8.4.0 is affected. The vendor recommends updating to a corrected driver when available.`;

test("conditional firmware impact retains its Secure Boot prerequisite", () => {
  for (const copy of [
    "The issue allows attackers to execute arbitrary UEFI-level code by writing to disk devices.",
    "The driver enables code execution before the OS starts.",
    "UEFI-level code execution can bypass protections.",
    "Attackers could execute arbitrary code before the operating system starts.",
    "The issue allows code execution at the UEFI level.",
    "Secure Boot is disabled. The bug allows UEFI code execution.",
    "Secure Boot is disabled on another system, and the bug allows UEFI code execution.",
    "When Secure Boot is disabled on another system, the bug allows UEFI code execution.",
    "With Secure Boot disabled, disk writes are possible. The bug permits UEFI code execution.",
    "With Secure Boot disabled, UEFI code execution is possible, but UEFI code execution also works without that prerequisite.",
    "UEFI code execution does not require Secure Boot to be disabled.",
    "UEFI code execution doesn't require Secure Boot to be disabled.",
    "UEFI code execution works with Secure Boot disabled or enabled.",
  ]) assert.deepEqual(claimCaveatErrors(copy, advisory), ["CAVEAT_SECURE_BOOT_REQUIRED"], copy);
});

test("safe prerequisite paraphrases and unrelated impacts remain eligible", () => {
  for (const copy of [
    "With Secure Boot off, the disk writes could enable UEFI code execution.",
    "Without Secure Boot, attackers could execute code before the OS starts.",
    "UEFI-level code execution requires Secure Boot to be disabled.",
    "Secure Boot must be disabled for UEFI code execution to be possible.",
    "The disk writes may corrupt stored data.",
    "The advisory describes arbitrary physical disk writes in the local driver.",
    "The advisory does not establish that the driver enables UEFI code execution.",
  ]) assert.deepEqual(claimCaveatErrors(copy, advisory), [], copy);
});

test("condition checks do not invent prerequisites absent from evidence", () => {
  assert.deepEqual(claimCaveatErrors("The issue allows UEFI code execution.", "The issue allows UEFI code execution."), []);
  assert.deepEqual(claimCaveatErrors("The issue allows UEFI code execution.", "Without Secure Boot, this permits UEFI code execution."), ["CAVEAT_SECURE_BOOT_REQUIRED"]);
});

test("adjacent source sentences cannot hide a necessary boot condition", () => {
  for (const evidence of [
    "The exploit requires Secure Boot to be disabled. It permits execution of arbitrary UEFI-level code before the operating system starts.",
    "The flaw permits UEFI code execution. This requires Secure Boot to be disabled.",
  ]) assert.deepEqual(claimCaveatErrors("The flaw permits UEFI code execution.", evidence), ["CAVEAT_SECURE_BOOT_REQUIRED"]);
  assert.deepEqual(claimCaveatErrors("The flaw permits UEFI code execution.", "This requires Secure Boot to be disabled. An unrelated platform implements UEFI code execution."), []);
});

test("unknown exploitation cannot become a confirmed attack", () => {
  for (const copy of [
    "Attackers are exploiting the flaw in the wild.",
    "The bug is actively exploited.",
    "Attackers are currently exploiting the bug.",
    "Threat actors have exploited the vulnerability.",
    "The driver was used in attacks.",
    "Exploitation has been confirmed.",
    "There is no evidence of attacks, but the flaw is actively exploited.",
  ]) assert.deepEqual(claimCaveatErrors(copy, advisory), ["CAVEAT_EXPLOITATION_UNKNOWN"], copy);
});

test("negative and conditional exploitation wording does not assert attacks", () => {
  for (const copy of [
    "There is no evidence that the bug is actively exploited.",
    "Exploitation in the wild remains unconfirmed.",
    "The source has not confirmed exploitation in the wild.",
    "Watch for reports of exploitation in the wild.",
    "The bug could be exploited in the wild.",
    "The advisory does not establish exploitation in the wild.",
  ]) assert.deepEqual(claimCaveatErrors(copy, advisory), [], copy);
});

test("an affected version is not evidence of a fixed version", () => {
  for (const copy of [
    "The issue is fixed in version 8.4.0.",
    "Version 8.4.0 fixes the bug.",
    "Update to version 8.4.0.",
    "Update the backup software to version 8.4.0.",
    "The fixed release is 8.4.1.",
  ]) assert.deepEqual(claimCaveatErrors(copy, advisory), ["CAVEAT_FIX_VERSION_UNSUPPORTED"], copy);
  assert.deepEqual(claimCaveatErrors("The vulnerable product is version 8.4.0. A fixed version was not identified.", advisory), []);
});

test("supported remediation versions remain valid and speculative fixes do not", () => {
  const evidence = "Version 8.4.0 is vulnerable. Version 8.4.1 fixes the bug. The vendor recommends users update to version 8.4.1.";
  for (const copy of [
    "The bug is fixed in version 8.4.1.",
    "Update to version 8.4.1.",
    "Version 8.4.1 fixes the issue.",
  ]) assert.deepEqual(claimCaveatErrors(copy, evidence), [], copy);
  assert.deepEqual(claimCaveatErrors("Watch for a fix in version 8.4.0.", evidence), ["CAVEAT_FIX_VERSION_UNSUPPORTED"]);
  assert.deepEqual(claimCaveatErrors("The issue is not fixed in version 8.4.0.", evidence), []);
  assert.deepEqual(claimCaveatErrors("The issue is fixed in version 8.4.1.", "The issue might be fixed in version 8.4.1."), ["CAVEAT_FIX_VERSION_UNSUPPORTED"]);
});

test("unavailable fixes cannot become released patches", () => {
  const evidence = "No official patch is available. The vendor is investigating the issue.";
  for (const copy of ["A patch is now available.", "The vendor released a fix.", "The vendor has fixed the issue."]) {
    assert.deepEqual(claimCaveatErrors(copy, evidence), ["CAVEAT_FIX_UNAVAILABLE"], copy);
  }
  for (const copy of ["Watch for a patch to be released.", "No patch is available.", "A patch has not been released."]) {
    assert.deepEqual(claimCaveatErrors(copy, evidence), [], copy);
  }
});

test("a fixed version not being identified does not itself establish no patch exists", () => {
  assert.deepEqual(claimCaveatErrors("The vendor recommends checking for a patch.", advisory), []);
  assert.deepEqual(claimCaveatErrors("The source did not identify a fixed version.", advisory), []);
});

test("explicit subsequent source updates can supersede historical caveats", () => {
  const patchUpdate = "No patch was available at disclosure. The vendor released a patch today.";
  assert.deepEqual(claimCaveatErrors("The vendor released a patch.", patchUpdate), []);
  const exploitUpdate = "No exploitation was known at disclosure. Attacks have now been confirmed.";
  assert.deepEqual(claimCaveatErrors("Exploitation has been confirmed.", exploitUpdate), []);
  const currentCaveat = "The vendor released a patch previously. No patch is available for this issue.";
  assert.deepEqual(claimCaveatErrors("A patch is available.", currentCaveat), ["CAVEAT_FIX_UNAVAILABLE"]);
});

test("stable reason ordering and non-text inputs are bounded", () => {
  const copy = "The issue allows UEFI code execution. The flaw is actively exploited. Version 8.4.0 fixes it.";
  assert.deepEqual(claimCaveatErrors(copy, advisory), ["CAVEAT_SECURE_BOOT_REQUIRED", "CAVEAT_EXPLOITATION_UNKNOWN", "CAVEAT_FIX_VERSION_UNSUPPORTED"]);
  assert.deepEqual(claimCaveatErrors(undefined, advisory), []);
  assert.deepEqual(claimCaveatErrors("Text", null), []);
});
