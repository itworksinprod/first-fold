// Conservative lexical hold triggers, NOT a semantic-preservation verifier.
// Safe paraphrases can be held; passing does not establish factual support,
// unchanged subjects/conditions, or completeness. Manual before/after review stays mandatory.
const cues = /\b(?:can|could|may|might|must|should|better|worse|best|worst|more|less|most|least|than|not|no|none|nothing|never|without|unless|cannot|always|guarantee|guarantees|guaranteed)\b/gu;
function qualificationSignature(text) {
  return (text.normalize('NFKC').toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/n't\b/g, ' not')
    .match(cues) ?? []).sort().join('|');
}

export function assertCopyeditQualifications(before, after) {
  for (const field of ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch']) {
    if (!Array.isArray(before?.[field]) || !Array.isArray(after?.[field]) || before[field].length !== after[field].length ||
        before[field].some((unit, index) => typeof unit !== 'string' || typeof after[field][index] !== 'string' ||
          qualificationSignature(unit) !== qualificationSignature(after[field][index]))) {
      throw Object.assign(new Error('FACT_SUMMARY_COPYEDIT_QUALIFICATION'), { code: 'FACT_SUMMARY_COPYEDIT_QUALIFICATION' });
    }
  }
  return true;
}
