// These are deliberately narrow contradiction/prerequisite checks, not a
// replacement for source attribution or the grounded draft's semantic review.
// Pass the complete text of the supporting source(s), rather than only the
// sentence selected by the writer: prerequisites often live next to the claim.
const normalize = (value) => typeof value === "string"
  ? value.normalize("NFKC").replace(/[’‘]/gu, "'").replace(/[‐‑–—]/gu, "-").replace(/\s+/gu, " ").trim()
  : "";

// A decimal/version dot is not a sentence boundary. Contrast clauses receive
// their own scope so "no evidence ..., but attacks are confirmed" is rejected.
const clauses = (value) => value.split(/(?<=[!?;])\s+|(?<!\d)\.\s+|(?<=\d)\.(?!\d)\s+|\s+(?:but|however|nevertheless)\s+/iu)
  .map((value) => value.trim()).filter(Boolean);
const secureBootOff = /\b(?:secure boot\s+(?:(?:is|was|has been|to be|must be|needs to be|would need to be)\s+)?(?:disabled|off|not enabled)|(?:disable(?:d)?|turn(?:ed)? off)\s+secure boot|without\s+(?:enabled\s+)?secure boot)\b/iu;
const bootExecution = /\b(?:(?:arbitrary\s+)?(?:uefi(?:-level)?|firmware|pre-boot|preboot)\s+(?:(?:level|arbitrary)\s+)?(?:code\s+)?execut(?:e|ion)|execut(?:e|ing|ion of)\s+(?:arbitrary\s+)?(?:uefi(?:-level)?|firmware|pre-boot|preboot)\s+code|code\s+(?:execution|execut(?:es|ed))\s+(?:before|prior to)\s+(?:the\s+)?(?:operating system|os)\b|execut(?:e|ing)\s+(?:arbitrary\s+)?code\s+(?:before|prior to)\s+(?:the\s+)?(?:operating system|os)\b|(?:code execution|execut(?:e|ing)\s+(?:arbitrary\s+)?code)\s+(?:at|in|within)\s+(?:the\s+)?(?:uefi|firmware)(?:\s+level)?)/giu;

function explicitBootPrerequisite(clause) {
  const match = secureBootOff.exec(clause);
  if (!match) return false;
  const before = clause.slice(0, match.index);
  const after = clause.slice(match.index + match[0].length);
  // A mention on its own is not a condition. In particular, mentioning another
  // machine with the control disabled must not bless an unconditional impact.
  if (/\b(?:on|for|in)\s+(?:(?:an?|the)\s+)?(?:other|another|different|unrelated)\b/iu.test(after)) return false;
  if (/\b(?:not|never|doesn't|needn't)\s+(?:[a-z]+\s+){0,2}(?:require|need)\s*$/iu.test(before) ||
      /^\s*,?\s*(?:or|and|\/)\s+(?:(?:with\s+)?secure boot\s+)?(?:enabled|on)\b/iu.test(after)) return false;
  return /^without\b/iu.test(match[0]) ||
    /\b(?:when|if|with|requires?|needs?)\s+(?:the\s+)?$/iu.test(before) ||
    (/\b(?:must be|needs to be|would need to be)\b/iu.test(match[0]) && /^\s+(?:for|to|before)\b/iu.test(after));
}

const negativePrefix = /\b(?:no|not|never|neither|without|cannot|can't|doesn't|does not|didn't|did not|hasn't|has not|haven't|have not|isn't|is not|wasn't|was not|aren't|are not|weren't|were not|couldn't|could not|wouldn't|would not)\b[^.!?;]{0,100}$/iu;
const uncertainPrefix = /\b(?:watch(?:ing)?|monitor(?:ing)?|check(?:ing)?|whether|if|could|might|may|would|possible|potential|risk of|prevent(?:ing)?)\b[^.!?;]{0,75}$/iu;
const uncertainSuffix = /^.{0,45}\b(?:unknown|unconfirmed|unverified|not (?:known|confirmed|established|reported)|has not been (?:confirmed|established|reported))\b/iu;

function positiveMatches(clause, pattern, { allowUncertain = false, bootCondition = false } = {}) {
  return [...clause.matchAll(pattern)].filter((match) => {
    const before = clause.slice(0, match.index);
    const prefix = bootCondition ? before.replace(secureBootOff, "") : before;
    const suffix = clause.slice(match.index + match[0].length);
    if (negativePrefix.test(prefix) || uncertainSuffix.test(suffix)) return false;
    return allowUncertain || !uncertainPrefix.test(prefix);
  });
}

const exploitation = /\b(?:actively exploit(?:ed|ing)|exploit(?:ed|ing|ation)\s+(?:(?:the|this)\s+(?:flaw|bug|issue|vulnerability)\s+)?(?:in\s+)?(?:the\s+)?(?:wild|real[- ]world)|(?:exploitation|attacks)\s+(?:(?:has|have|is|are|was|were|been|being|now)\s+){0,4}(?:observed|reported|detected|confirmed|ongoing|occurred)|(?:known|confirmed|observed|reported|ongoing)\s+(?:active\s+)?exploitation|used\s+in\s+(?:real[- ]world\s+)?attacks|(?:attackers?|threat actors?)\s+(?:(?:are|were|have|has|had|been)\s+){1,3}(?:(?:actively|currently)\s+)?exploit(?:ed|ing))\b/giu;
const exploitationUnknown = /\b(?:(?:no|without)\s+(?:(?:known|confirmed|reported|observed|public|credible)\s+)*(?:evidence|reports?)\s+(?:of|for|that)\s+.{0,90}(?:exploitation|exploited|exploiting|attacks?)|(?:does not|did not|has not|cannot|can't|could not|hasn't)\s+(?:establish|confirm|identify|report|verify)\s+.{0,70}(?:exploitation|exploited|exploiting|attacks?)|(?:not|never)\s+(?:aware|heard)\s+of\s+.{0,50}(?:exploitation|exploited|exploiting|attacks?)|(?:no|not)\s+(?:(?:known|confirmed|observed|reported|active)\s+)*(?:exploitation|attacks)|exploitation\s+(?:status\s+)?(?:is\s+|remains\s+)?(?:unknown|unconfirmed|unverified)|exploitation\s+(?:has|have)\s+not\s+been\s+(?:reported|confirmed|observed|established))\b/iu;
const noFix = /\b(?:(?:no|without)\s+(?:(?:known|available|released|official)\s+)*(?:fix|patch|remediation)\b|(?:fix|patch|remediation)\s+(?:is|was|remains)\s+(?:not available|unavailable|unreleased)|(?:fix|patch)\s+has\s+not\s+been\s+(?:released|issued))\b/iu;
const fixAvailable = /\b(?:(?:fix|patch|remediation|corrected driver)\s+(?:(?:is|was|has|have|been|now|already)\s+){0,4}(?:available|released|issued|published)|(?:released|issued|published)\s+(?:a\s+|the\s+|an?\s+)?(?:fix|patch|corrected driver)|(?:vendor|developer)\s+(?:has\s+)?(?:fixed|patched|resolved)\s+(?:the\s+)?(?:issue|bug|vulnerability))\b/giu;

const version = "(\\d+(?:\\.\\d+){1,3})";
const fixVersionPatterns = [
  new RegExp(`\\b(?:fix(?:ed|es)?|patch(?:ed|es)?|resolv(?:ed|es)?|correct(?:ed|s)?|remediat(?:ed|es)?)\\b.{0,45}?\\b(?:v(?:ersion)?\\s*)?${version}\\b`, "giu"),
  new RegExp(`\\b(?:v(?:ersion)?\\s*)?${version}\\b.{0,45}?\\b(?:fixes|patches|resolves|corrects|remediates|(?:is|was)\\s+(?:the\\s+)?(?:fixed|patched|corrected)\\s+(?:version|release))\\b`, "giu"),
];
const updateVersion = new RegExp(`\\b(?:update|upgrade)\\s+(?:(?:the|your)\\s+)?(?:[a-z][a-z0-9_-]*\\s+){0,5}to\\s+(?:version\\s+|v)?${version}\\b`, "giu");

function versionReferences(text, patterns, { requireAssertion = false } = {}) {
  return new Set(clauses(text).flatMap((clause) => patterns.flatMap((pattern) =>
    positiveMatches(clause, pattern, { allowUncertain: !requireAssertion }).map((match) => match[1]))));
}

function unsupersededCaveat(sourceClauses, negative, positive) {
  const index = sourceClauses.findLastIndex((clause) => negative.test(clause));
  if (index < 0) return false;
  const historical = /\b(?:at disclosure|at publication|at the time|initially|previously|formerly|originally|had (?:been|not)|was not|were not|was unavailable)\b/iu.test(sourceClauses[index]);
  // Only an explicit later source update can supersede the historical caveat.
  // This is not a general chronology resolver; competing dates/publishers still
  // require the semantic review and retain their own attribution.
  return !sourceClauses.slice(index + 1).some((clause) => positiveMatches(clause, positive).length > 0 &&
    (historical || /\b(?:now|today|later|subsequently|since then|updated?|newly)\b/iu.test(clause)));
}

function sourceRequiresBootCondition(sourceClauses) {
  const hasImpact = (clause) => positiveMatches(clause, bootExecution, { allowUncertain: true, bootCondition: true }).length > 0;
  return sourceClauses.some((clause, index) => {
    if (!explicitBootPrerequisite(clause)) return false;
    if (hasImpact(clause)) return true;
    const next = sourceClauses[index + 1] ?? "";
    if (/^(?:it|this|that|the exploit|the attack|this impact|this capability)\b/iu.test(next) && hasImpact(next)) return true;
    return /^(?:it|this|that|the exploit|the attack|this impact|this capability)\b/iu.test(clause) &&
      index > 0 && hasImpact(sourceClauses[index - 1]);
  });
}

const defaultEnablement = /\b(?:(?:enabled|on|active|activated|available)\s+by\s+default|default[- ](?:on|enabled)|automatically\s+(?:enabled|activated))\b/giu;
const organizationEnablement = /\b(?:organizations?|orgs?|tenants?)\s+(?:with|where|that)\s+(?:already\s+)?(?:have\s+)?([a-z][a-z0-9]*(?:[ -][a-z][a-z0-9]*){0,5}?)\s+(?:(?:is|has been)\s+)?(?:already\s+)?enabled\b/giu;

function defaultAssertions(clause) {
  // A task such as "fact-checking" before the assertion is not uncertainty
  // about the asserted default. Only an actual whether/if question scopes it.
  return positiveMatches(clause, defaultEnablement, { allowUncertain: true }).filter((match) =>
    !/\b(?:whether|if)\b[^,;.!?]{0,75}$/iu.test(clause.slice(0, match.index)));
}

function defaultConditions(sourceClauses) {
  return sourceClauses.flatMap((clause) => defaultAssertions(clause).length
    ? [...clause.matchAll(organizationEnablement)].map((match) => match[1].toLowerCase()) : []);
}

function preservesDefaultCondition(clause, names) {
  // General availability is different from default enablement. The prerequisite
  // must qualify this assertion, not appear in another sentence or organization.
  if (/\b(?:personal\s+(?:google\s+)?(?:users?|accounts?)|everyone|regardless\s+of|all\s+(?:eligible\s+)?(?:google\s+workspace\s+)?accounts?)\b/iu.test(clause)) return false;
  return [...clause.matchAll(organizationEnablement)].some((match) => {
    if (!names.includes(match[1].toLowerCase())) return false;
    const before = clause.slice(0, match.index);
    const after = clause.slice(match.index + match[0].length);
    if (/\b(?:other|another|different|unrelated)\b/iu.test(before.slice(-45)) ||
        /^\s+(?:on|for|in)\s+(?:an?\s+)?(?:other|another|different|unrelated)\b/iu.test(after)) return false;
    return /\b(?:for|in|within|at|if|when)\s+(?:(?:all|the|those|your)\s+)?$/iu.test(before);
  });
}

const appDownloadInstruction = /\b(?:download|install)\s+(?:(?:the|a|your)\s+)?(?:[a-z][a-z0-9-]*\s+){0,5}(?:app|application|client)\b/iu;
const installationBypass = /\b(?:pre[- ]?installed|(?:already|automatically)\s+installed|(?:no|without(?:\s+(?:any|a))?)\s+(?:download(?:ing)?|install(?:ation|ing)?)(?:\s+(?:or|and)\s+(?:download(?:ing)?|install(?:ation|ing)?))?(?:\s+(?:is\s+)?(?:needed|required))?|(?:does\s+not|doesn't|need\s+not|needn't)\s+(?:require\s+)?(?:a\s+)?(?:download|install(?:ation)?))\b/giu;

/**
 * Return stable, deduplicated reasons for a small set of source caveats that
 * must not be silently removed. An empty array means only that these bounded
 * checks passed; it does not prove the prose is factually supported.
 */
export function claimCaveatErrors(text, evidenceText) {
  const copy = normalize(text);
  const evidence = normalize(evidenceText);
  if (!copy || !evidence) return [];
  const reasons = [];
  const sourceClauses = clauses(evidence);
  const copyClauses = clauses(copy);
  const bootPrerequisite = sourceRequiresBootCondition(sourceClauses);
  if (bootPrerequisite && copyClauses.some((clause) =>
    positiveMatches(clause, bootExecution, { allowUncertain: true, bootCondition: true }).length > 0 &&
    !explicitBootPrerequisite(clause))) {
    reasons.push("CAVEAT_SECURE_BOOT_REQUIRED");
  }
  if (unsupersededCaveat(sourceClauses, exploitationUnknown, exploitation) &&
      copyClauses.some((clause) => positiveMatches(clause, exploitation).length > 0)) {
    reasons.push("CAVEAT_EXPLOITATION_UNKNOWN");
  }
  if (unsupersededCaveat(sourceClauses, noFix, fixAvailable) &&
      copyClauses.some((clause) => positiveMatches(clause, fixAvailable).length > 0)) {
    reasons.push("CAVEAT_FIX_UNAVAILABLE");
  }
  const sourceFixed = versionReferences(evidence, fixVersionPatterns, { requireAssertion: true });
  const sourceUpdates = versionReferences(evidence, [...fixVersionPatterns, updateVersion], { requireAssertion: true });
  if ([...versionReferences(copy, fixVersionPatterns)].some((value) => !sourceFixed.has(value)) ||
      [...versionReferences(copy, [updateVersion])].some((value) => !sourceUpdates.has(value))) {
    reasons.push("CAVEAT_FIX_VERSION_UNSUPPORTED");
  }
  const enablementConditions = defaultConditions(sourceClauses);
  if (enablementConditions.length && copyClauses.some((clause) =>
    defaultAssertions(clause).length > 0 && !preservesDefaultCondition(clause, enablementConditions))) {
    reasons.push("CAVEAT_DEFAULT_ENABLEMENT_SCOPE");
  }
  // "No end-user setting" never establishes that a separately downloaded app
  // is preinstalled. This only catches explicit bypass claims, not suggestions
  // to try a feature or verify its setup with the publisher.
  if (sourceClauses.some((clause) => appDownloadInstruction.test(clause)) &&
      copyClauses.some((clause) => /\b(?:app|application|client)\b/iu.test(clause) &&
        positiveMatches(clause, installationBypass).length > 0)) {
    reasons.push("CAVEAT_INSTALLATION_REQUIRED");
  }
  return reasons;
}
