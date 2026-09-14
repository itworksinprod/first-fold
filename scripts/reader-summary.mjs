// Minimum reader usefulness, separate from factual/source checks. Never repair
// a fragment by guessing its missing subject or adding an unsupported claim.
export function readerSummaryErrors(story) {
  const errors = [];
  const headline = story?.headline ?? "";
  if (/^(?:[^“"]{1,80}\breports\s+)?[“"](?:and|but|we|they|it|this|that|he|she)\b/iu.test(headline)) {
    errors.push("SUMMARY_UNRESOLVED_HEADLINE");
  }
  const copy = [headline, story?.deck, story?.whatHappened, story?.whyItMatters, story?.whatToDoOrWatch].join(" ");
  if (/\b(?:new development|reviewed development|editorial threshold|deterministic|bounded evidence|cleared the bar|no short direct quotation was safe|treat this as a source lead|retained excerpt is too limited|reports a new [\w &]+ development)\b/iu.test(copy)) {
    errors.push("SUMMARY_GENERIC_FILLER");
  }
  return errors;
}
