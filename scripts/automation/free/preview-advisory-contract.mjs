// Preview-only writing obligations. These alarms detect known editorial defects;
// neither their absence nor a matching citation establishes factual entailment.
import { intactAdvisoryContext } from './preview-evidence-gate.mjs';

const ids = passages => passages.map(p => p.evidenceId);
export function advisoryWritingContract(dossier) {
  if (dossier?.sources?.length !== 1) return null;
  const source = dossier.sources[0];
  if (!intactAdvisoryContext(source)) return null;
  const passages = source.passages;
  const select = pattern => passages.filter(p => pattern.test(p.text));
  const descriptions = select(/ — Vulnerabilities — CVE-\d{4}-\d+ — (?!Affected Products|Metrics|View CVE Details)/u);
  const scope = select(/ — Product Version: /u);
  const remedies = select(/ — Remediations — Vendor fix /u);
  const origin = select(/ — Advisory Conversion Disclaimer — .*verbatim republication/u);
  const originalDate = select(/ — Revision History — Initial Release Date: \d{4}-\d{2}-\d{2}$/u);
  const republicationDate = select(/ — Revision History — Date: \d{4}-\d{2}-\d{2}; .*Initial CISA Republication/u);
  const singleCve = new Set(descriptions.flatMap(p => p.text.match(/CVE-\d{4}-\d+/gu) ?? [])).size === 1;
  const republication = origin.length === 1 && originalDate.length === 1 && republicationDate.length === 1 ? {
    vendor: origin[0].text.match(/verbatim republication of (.+?) SSA-/u)?.[1] ?? null,
    originalDate: originalDate[0].text.match(/\d{4}-\d{2}-\d{2}$/u)[0],
    republicationDate: republicationDate[0].text.match(/ — Date: (\d{4}-\d{2}-\d{2});/u)[1],
  } : null;
  const chronologyTask = republication
    ? 'Also distinguish the original vendor release from the later CISA republication. Use the supplied exact dates. These are one originating account, not two independent reports.'
    : origin.length ? 'The source declares republication but complete chronology is unavailable. Do not invent dates or a publication sequence; retain the uncertainty for review.'
    : 'Attribute the originating account. Do not infer a separate vendor release or republication sequence that the source does not identify.';
  return {
    version: 'advisory-writing-obligations-v1', singleCve,
    // Full context is still sent. This outline does not excerpt or rewrite facts.
    outline: {
      headline: 'Name the actual issue, not a generic development. Do not imply new discovery.',
      deck: { task: 'State the source-described impact WITH its attack conditions in the same sentence.', evidenceIds: ids(descriptions) },
      claims: { task: `Report the defect and conditional impact. ${chronologyTask}`,
        evidenceIds: ids([...descriptions, ...origin, ...originalDate, ...republicationDate]) },
      whyItMatters: { task: 'Use concrete affected-product and compatibility scope to explain who should check their installation. Do not explain why a score was assigned, infer an operator mistake, or invent consequences. You may omit the score entirely.', evidenceIds: ids(scope) },
      whatToDoOrWatch: { task: 'Tell readers to identify their installed product/compatibility branch and verify its corresponding vendor fix before choosing an update. Product and remedy lists may differ in order: never zip or pair them by position. Do not present all updates as interchangeable. Advice is an editorial check, not a promise of safety.', evidenceIds: ids([...scope, ...remedies]) },
    },
    checks: {
      ssoCondition: singleCve && descriptions.some(p => /in specific SSO configurations/u.test(p.text)),
      descriptions: ids(descriptions), scope: ids(scope), remedies: ids(remedies),
      republication, chronologyIncomplete: origin.length > 0 && !republication,
    },
    limitation: 'A source-based outline and known-defect alarms are not semantic approval. Independent field-by-field review of the raw output remains mandatory.',
  };
}

export function advisoryDraftAlarms(draft, dossier, map) {
  const contract = advisoryWritingContract(dossier);
  if (!contract) return [];
  const holds = [];
  const add = (code, field) => holds.push({ code, field });
  if (contract.checks.chronologyIncomplete) add('ADVISORY_CHRONOLOGY_CONTEXT_REQUIRED', 'story');
  const fieldTexts = ['headline','deck','whyItMatters','whatToDoOrWatch'].map(f => draft?.[f] ?? '');
  const all = [...fieldTexts, ...(draft?.claims ?? []).map(c => c.text)].join(' ');
  if (contract.checks.ssoCondition && (!/\b(?:specific|certain|particular) (?:SSO|single.sign.on) configurations?\b/iu.test(draft?.deck ?? '') ||
      !map?.deck?.some(id => contract.checks.descriptions.includes(id)))) add('ADVISORY_ATTACK_CONDITION_REQUIRED', 'deck');
  if (contract.checks.scope.length && !map?.whyItMatters?.some(id => contract.checks.scope.includes(id))) add('ADVISORY_SCOPE_EVIDENCE_REQUIRED', 'whyItMatters');
  const why = draft?.whyItMatters ?? '';
  if (/\b(?:score|rating|CVSS)\b(?:[^.!?]|\.(?=\d)){0,160}\b(?:because|due to|owing to|as it|since it)\b/iu.test(why)) add('ADVISORY_SCORE_CAUSALITY_REVIEW', 'whyItMatters');
  if (/\b(?:deployed|configured|installed) improperly\b|\b(?:improper|incorrect) (?:deployment|configuration|installation)\b|\bmisconfigur(?:ed|ation)\b/iu.test(why)) add('ADVISORY_OPERATOR_FAULT_REVIEW', 'whyItMatters');
  if (contract.checks.remedies.length > 1 && (!/\b(?:check|verify|confirm|consult|match|identify)\b/iu.test(draft?.whatToDoOrWatch ?? '') ||
      !/\b(?:compatib\w*|branch(?:es)?|version-specific)\b/iu.test(draft?.whatToDoOrWatch ?? '') ||
      !map?.whatToDoOrWatch?.some(id => contract.checks.scope.includes(id)))) add('ADVISORY_FIX_COMPATIBILITY_REVIEW', 'whatToDoOrWatch');
  const r = contract.checks.republication;
  if (r && (!/\brepublicat\w*|\brepublish\w*/iu.test(all) || (r.vendor && !all.includes(r.vendor)) ||
      !all.includes(r.originalDate) || !all.includes(r.republicationDate))) add('ADVISORY_ORIGIN_CHRONOLOGY_REQUIRED', 'story');
  return holds;
}
