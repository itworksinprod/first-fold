// Preview-only writing obligations. These alarms detect known editorial defects;
// neither their absence nor a matching citation establishes factual entailment.
import { intactAdvisoryContext } from './preview-evidence-gate.mjs';
import { previewNumericAnchors } from './preview-numeric-anchors.mjs';

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
  const ambiguousRemedyLists = new Set(remedies.map(p=>p.text.split(' — Vendor fix ')[1])).size>1;
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
    ? 'Use claim 1 ONLY for vendor origin and publication chronology, mapping the original and republication dates. If describing verbatim republication or conversion, also cite the disclaimer in that SAME claim; three supports are available for origin plus both dates. Use claim 2 for the technical defect and conditional impact, mapping the vulnerability description. Do not insert a defect assertion into a date-only claim. These are one originating account, not two independent reports.'
    : origin.length ? 'The source declares republication but complete chronology is unavailable. Do not invent dates or a publication sequence; retain the uncertainty for review.'
    : 'Attribute the originating account. Do not infer a separate vendor release or republication sequence that the source does not identify.';
  return {
    version: 'advisory-writing-obligations-v1', singleCve,
    // Keep each technical account intact rather than supplying a blended impact
    // list: credentials for different protocols may expose different data.
    perVulnerability: descriptions.map(p=>({evidenceId:p.evidenceId,
      cve:p.text.match(/CVE-\d{4}-\d+/u)?.[0]??null,description:p.text,
      task:'If using this defect, keep its protocol, affected subset, connection prerequisite and impact together in one claim. Do not borrow real-time access, stored data, affected carriers or other consequences from a different CVE. One or two accurately scoped defects are better than compressing every defect into a misleading combined claim.'})),
    // Full context is still sent. This outline does not excerpt or rewrite facts.
    outline: {
      headline: { task: 'Name the actual issue, not a generic development. Do not imply new discovery. If naming a signature or cryptographic defect, cite the technical description in this headline field; an identifier or general impact summary does not establish the mechanism.', evidenceIds: ids(descriptions) },
      deck: { task: 'State the source-described impact WITH its attack conditions in the same sentence.', evidenceIds: ids(descriptions) },
      claims: { task: `Report the defect and conditional impact. ${chronologyTask}`,
        evidenceIds: ids([...descriptions, ...origin, ...originalDate, ...republicationDate]) },
      whyItMatters: { task: 'Use concrete affected-product and compatibility scope to explain who should check their installation. This field should identify affected versions and exclusions, not re-explain the attack. Product-version passages do not support deployment sectors, cryptographic mechanisms, authentication defaults or causes. Omit those details here instead of inventing an explanation. Do not explain why a score was assigned, infer an operator mistake, or invent consequences. You may omit the score entirely.', evidenceIds: ids(scope) },
      whatToDoOrWatch: { task: ambiguousRemedyLists ? 'Tell readers to identify their installed product/compatibility branch and verify its corresponding vendor fix before choosing an update. Product and remedy lists may differ in order: never zip or pair them by position. Do not present all updates as interchangeable. Where separate lists show multiple fixed releases without explicit branch/fix associations, do not give specific fixed-version numbers or worked upgrade examples in this field: ask readers to verify the vendor mapping instead. Advice is an editorial check, not a promise of safety.' : 'Use the source-stated remediation and preserve any explicit platform/version pairing. Identical remedy instructions repeated for multiple CVEs are not conflicting fix lists. Never invent a pairing absent from the cited remediation. Distinguish reader checks from promises of safety.', evidenceIds: ids([...scope, ...remedies]) },
    },
    checks: {
      ssoCondition: singleCve && descriptions.some(p => /in specific SSO configurations/u.test(p.text)),
      descriptions: ids(descriptions), scope: ids(scope), remedies: ids(remedies), origin: ids(origin), ambiguousRemedyLists,
      unpairedFixedVersions: [...new Set(remedies.flatMap(p => [...p.text.matchAll(/Vendor fix Update to V(\d+(?:\.\d+)+)/gu)].map(m => m[1])))],
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
  if (/\b(?:signature|cryptographic|validation flaw)\b/iu.test(draft?.headline ?? '') && contract.checks.descriptions.length &&
      !map?.headline?.some(id=>contract.checks.descriptions.includes(id))) add('ADVISORY_HEADLINE_TECHNICAL_EVIDENCE_REQUIRED','headline');
  const units = [
    ...['headline','deck','whyItMatters','whatToDoOrWatch'].map(field=>({field,text:draft?.[field]??'',ids:map?.[field]??[]})),
    ...(draft?.claims??[]).map((claim,i)=>({field:`claims.${i}`,text:claim.text,ids:claim.supports?.map(s=>s.evidenceId)??[]})),
  ];
  for(const unit of units) if (/\bverbatim\b|\b(?:advisory|vendor) conversion\b/iu.test(unit.text) &&
      !unit.ids.some(id=>contract.checks.origin.includes(id))) add('ADVISORY_ORIGIN_EVIDENCE_REQUIRED',unit.field);
  for(const unit of units) if(/\bcarriers?\b/iu.test(unit.text) && !/\b(?:subset|some)\b/iu.test(unit.text) &&
    dossier.sources.some(s=>s.passages.some(p=>unit.ids.includes(p.evidenceId)&&/\bsubset of carriers\b/iu.test(p.text)))) add('ADVISORY_SUBSET_SCOPE_REQUIRED',unit.field);
  for (const [i,claim] of (draft?.claims ?? []).entries()) {
    if (/\b(?:signature|hijack\w*|cryptographic|validation flaw)\b/iu.test(claim.text) &&
        contract.checks.descriptions.length && !claim.supports?.some(s=>contract.checks.descriptions.includes(s.evidenceId))) add('ADVISORY_TECHNICAL_CLAIM_EVIDENCE_REQUIRED', `claims.${i}`);
  }
  if (contract.checks.ssoCondition && (!/\b(?:specific|certain|particular) (?:SSO|single.sign.on) configurations?\b/iu.test(draft?.deck ?? '') ||
      !map?.deck?.some(id => contract.checks.descriptions.includes(id)))) add('ADVISORY_ATTACK_CONDITION_REQUIRED', 'deck');
  if (contract.checks.scope.length && !map?.whyItMatters?.some(id => contract.checks.scope.includes(id))) add('ADVISORY_SCOPE_EVIDENCE_REQUIRED', 'whyItMatters');
  const why = draft?.whyItMatters ?? '';
  if (/\b(?:score|rating|CVSS)\b(?:[^.!?]|\.(?=\d)){0,160}\b(?:because|due to|owing to|as it|since it)\b/iu.test(why)) add('ADVISORY_SCORE_CAUSALITY_REVIEW', 'whyItMatters');
  if (/\b(?:deployed|configured|installed) improperly\b|\b(?:improper|incorrect) (?:deployment|configuration|installation)\b|\bmisconfigur(?:ed|ation)\b/iu.test(why)) add('ADVISORY_OPERATOR_FAULT_REVIEW', 'whyItMatters');
  if (contract.checks.ambiguousRemedyLists && (!/\b(?:check|verify|confirm|consult|match|identify)\b/iu.test(draft?.whatToDoOrWatch ?? '') ||
      !/\b(?:compatib\w*|branch(?:es)?|version-specific)\b/iu.test(draft?.whatToDoOrWatch ?? '') ||
      !map?.whatToDoOrWatch?.some(id => contract.checks.scope.includes(id)))) add('ADVISORY_FIX_COMPATIBILITY_REVIEW', 'whatToDoOrWatch');
  const r = contract.checks.republication;
  const calendar = new Set(previewNumericAnchors(all));
  if (r && (!/\brepublicat\w*|\brepublish\w*/iu.test(all) || (r.vendor && !all.includes(r.vendor)) ||
      !calendar.has(`calendar:${r.originalDate}`) || !calendar.has(`calendar:${r.republicationDate}`))) add('ADVISORY_ORIGIN_CHRONOLOGY_REQUIRED', 'story');
  if (contract.checks.unpairedFixedVersions.length > 1 && previewNumericAnchors(draft?.whatToDoOrWatch ?? '')
      .some(token=>contract.checks.unpairedFixedVersions.includes(token))) add('ADVISORY_UNPAIRED_FIX_VERSION_REVIEW', 'whatToDoOrWatch');
  return holds;
}
