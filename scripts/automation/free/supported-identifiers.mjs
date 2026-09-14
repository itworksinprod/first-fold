// Typography repair, not factual repair. Only expand a two-ID CVE shorthand
// when both complete identifiers occur in the caller's cited evidence. Unknown
// identifiers/ranges stay unchanged and must face the ordinary numeric veto.
export function expandSupportedCvePairs(copy, citedEvidence) {
  if (typeof copy !== "string" || typeof citedEvidence !== "string") return copy;
  const supported = new Set((citedEvidence.match(/\bCVE-\d{4}-\d{4,7}\b/giu) ?? [])
    .map(value => value.toUpperCase()));
  return copy.replace(/\bCVE-(\d{4})-(\d{4,7})\s*\/\s*(\d{4,7})\b(?![\d/-])/giu,
    (original, year, first, second, offset, whole) => {
      // Do not normalize a suffix within an unsupported identifier list.
      if (offset > 0 && /[\d/-]/u.test(whole[offset - 1])) return original;
      const left = `CVE-${year}-${first}`;
      const right = `CVE-${year}-${second}`;
      return left !== right && supported.has(left) && supported.has(right)
        ? `${left} and ${right}` : original;
    });
}
