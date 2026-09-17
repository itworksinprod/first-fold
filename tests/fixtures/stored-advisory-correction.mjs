import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { captureStructuredArticle } from '../../scripts/automation/free/structured-article-evidence.mjs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function storedAdvisoryCorrectionFixture() {
  const record = JSON.parse(await readFile(new URL('./rejected-preview-run11.json', import.meta.url), 'utf8'));
  const { body } = JSON.parse(await readFile(new URL('./cisa-mendix-http-main.json', import.meta.url), 'utf8'));
  const url = 'https://www.cisa.gov/news-events/ics-advisories/icsa-26-258-06';
  const capture = await captureStructuredArticle({ title: 'Siemens Mendix SAML', url, publisherKey: 'cisa' },
    async () => ({ body, finalUrl: url, redirects: [] })); // NO live fetch
  const passages = capture.blocks.map((text, i) => ({ evidenceId: `S1P${i + 1}`, text }));
  if (capture.status !== 'usable' || passages.length !== 59 ||
      capture.structuredContext.textSha256 !== record.sourceTextSha256 ||
      hash(passages) !== record.passagesSha256 || hash(record.draft) !== record.originalDraftSha256 ||
      hash(record.evidenceForFields) !== record.originalEvidenceMapSha256) throw Error('STORED_CORRECTION_BINDING_FAILED');
  const dossier = { candidateId: record.draft.candidateId, desk: 'security-and-privacy', evidenceTier: 'authoritative-single', sources: [{
    sourceId: 'source-1-cisa-advisories', publisher: 'CISA', publisherKey: 'cisa', relationship: 'originating',
    publishedAt: '2026-09-15T12:00:00.000Z', text: capture.excerpt,
    // Fixture HTML differs from run11's full HTTP response. Never transplant
    // run11's body hash or timestamps, or imply this local replay fetched a page.
    articleIdentity: { ...capture.identity, retrievedAt: null, inspectedAt: null, captureMode: 'stored-public-fixture' },
    structuredContext: capture.structuredContext, passages,
  }] };
  return { record, dossier, provenance: { mode: 'stored-evidence-correction', sourceRun: record.sourceRun,
    identicalExtractedText: true, identicalHttpResponse: false, freshResearch: false,
    sourceTextSha256: record.sourceTextSha256, passagesSha256: record.passagesSha256 } };
}
