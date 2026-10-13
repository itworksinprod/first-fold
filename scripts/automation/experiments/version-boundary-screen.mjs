// A conservative lexical screen for the isolated saved-article benchmark.
// It does NOT resolve subjects, predicates, negation or semantic equivalence.
// Matching a source comparator never establishes factual support. In particular,
// the correct comparison can still be attached to the wrong product or action.
const version = String.raw`v?\d{1,6}(?:\.\d{1,6}){1,3}`;
const end = String.raw`(?![\p{L}\p{N}_+\p{Pd}\u2212]|\.\d)`;
const prefixRelations = [
  ['lte', String.raw`at\s+most|no\s+(?:later|newer|higher)\s+than|up\s+to\s+and\s+including|<=|≤`],
  ['gte', String.raw`at\s+least|no\s+(?:earlier|older|lower)\s+than|>=|≥`],
  ['lt', String.raw`below|under|(?:earlier|older|less|lower)\s+than|before|<`],
  ['gt', String.raw`above|over|(?:later|newer|greater|higher)\s+than|after|>`],
];
const suffixRelations = [
  ['lte', String.raw`(?:or|and)\s+(?:earlier|older|below|lower)`],
  ['gte', String.raw`(?:or|and)\s+(?:later|newer|above|higher)`],
];
const patterns = [
  ...prefixRelations.map(([relation, words]) => ({relation,
    regex: new RegExp(String.raw`(?<![\p{L}\p{N}_<>=])(?:${words})\s*(?:versions?\s+)?(${version})${end}`, 'giu')})),
  ...suffixRelations.map(([relation, words]) => ({relation,
    regex: new RegExp(String.raw`(?<![\p{L}\p{N}._+\p{Pd}\u2212])(${version})${end}\s+(?:${words})\b`, 'giu')})),
];
const family = relation => relation.startsWith('lt') ? 'upper' : 'lower';
const freeze = value => {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);}
  return value;
};
const invalid = () => {throw Object.assign(new Error('BENCHMARK_VERSION_SCREEN_INPUT'), {code: 'BENCHMARK_VERSION_SCREEN_INPUT'});};

function comparisons(text) {
  const found = [];
  for (const {regex, relation} of patterns) {
    // matchAll clones the global regex; no lastIndex state is shared across calls.
    for (const match of text.matchAll(regex)) found.push({
      version: match[1].replace(/^v/i, ''), relation, start: match.index,
      end: match.index + match[0].length,
    });
  }
  // Prefer the longest prefix: "no later than" is not also "later than".
  return found.filter(c => !found.some(other => other !== c && other.start <= c.start &&
    other.end >= c.end && other.end - other.start > c.end - c.start)).sort((a, b) => a.start - b.start);
}

export function screenVersionBoundaries({units, sourceReferences, passages}) {
  if (!Array.isArray(units) || !units.length || units.length > 10 ||
      !Array.isArray(sourceReferences) || sourceReferences.length !== units.length ||
      !Array.isArray(passages) || !passages.length || passages.length > 128) invalid();
  const byId = new Map(); let sourceLength = passages.length - 1;
  for (const p of passages) {
    if (!p || typeof p.id !== 'string' || !/^P[1-9]\d{0,2}$/.test(p.id) || byId.has(p.id) ||
        typeof p.text !== 'string' || !p.text.length || p.text.length > 6000) invalid();
    sourceLength += p.text.length;
    if (sourceLength > 18000) invalid();
    byId.set(p.id, comparisons(p.text));
  }
  const issues = [], coverage = []; const seen = new Set();
  let recognizedComparisons = 0, checkedComparisons = 0, issueCount = 0, sourceDetailsTruncated = false;
  for (let i = 0; i < units.length; i++) {
    const u = units[i], ref = sourceReferences[i];
    if (!u || typeof u.id !== 'string' || !/^U[0-9]$/.test(u.id) || seen.has(u.id) || typeof u.text !== 'string' ||
        !u.text.length || u.text.length > 1200 || !ref || ref.unitId !== u.id ||
        !Array.isArray(ref.passageIds) || !ref.passageIds.length || ref.passageIds.length > 3 ||
        new Set(ref.passageIds).size !== ref.passageIds.length) invalid();
    seen.add(u.id);
    const source = [];
    for (const id of ref.passageIds) {
      if (!byId.has(id)) invalid();
      source.push(...byId.get(id).map(c => ({passageId: id, ...c})));
    }
    const claims = comparisons(u.text);
    for (const claim of claims) {
      const candidates = source.filter(c => c.version === claim.version && family(c.relation) === family(claim.relation));
      const observedRelations = [...new Set(candidates.map(c => c.relation))];
      // Only screen same-endpoint, same-direction, unambiguous source relations.
      // Opposite comparisons may legitimately describe complementary populations.
      // Missing/ambiguous mappings are explicitly uncovered, never a semantic pass.
      const checked = observedRelations.length === 1;
      const conflict = checked && observedRelations[0] !== claim.relation;
      recognizedComparisons++; checkedComparisons += Number(checked); issueCount += Number(conflict);
      if (coverage.length < 32) coverage.push({unitId: u.id, comparison: claim, checked,
        reason: !candidates.length ? 'no-comparable-selected-boundary' :
          !checked ? 'ambiguous-selected-boundary' : conflict ? 'endpoint-inclusion-drift' : 'same-comparison'});
      // Preserve offsets into immutable source/draft text, not repeated excerpts.
      // Bounded detail must not overflow the encrypted evidence envelope or turn
      // an article hold into a batch-wide evidence-storage failure.
      if (conflict) {
        sourceDetailsTruncated ||= candidates.length > 3;
        if (issues.length < 16) issues.push({code: 'VERSION_ENDPOINT_INCLUSION_DRIFT', unitId: u.id,
          draft: claim, sourceComparisonCount: candidates.length, source: candidates.slice(0, 3)});
      }
    }
  }
  return freeze({version: 1, status: issueCount ? 'needs-review' : 'no-detected-boundary-conflict',
    issueCount, recognizedComparisons, checkedComparisons, issues, coverage,
    detailsTruncated: sourceDetailsTruncated || issueCount > issues.length || recognizedComparisons > coverage.length,
    semanticApproval: false, independentReview: 'required'});
}
