#!/usr/bin/env node
// One fixed regression experiment. No research, approval, retry or email path.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { storedAdvisoryCorrectionFixture } from '../../tests/fixtures/stored-advisory-correction.mjs';
import { previewGeminiLite, renderHumanReview } from './preview-gemini-lite.mjs';
import { advisoryWritingContract } from './free/preview-advisory-contract.mjs';
import { FREE_PROJECT_CONFIRMATION } from './check-gemini-writer.mjs';
import { diagnosticPublicKey, sealDiagnostic } from './private-writer-diagnostic.mjs';
import { GEMINI_LITE_MODEL } from './free/gemini-ai.mjs';

export function assertStoredCorrectionAuthority(env) {
  if (env.GITHUB_REPOSITORY !== 'itworksinprod/first-fold' || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_WORKFLOW_REF !== 'itworksinprod/first-fold/.github/workflows/gemini-stored-correction.yml@refs/heads/main' ||
      env.GITHUB_ACTOR !== 'itworksinprod' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_RUN_ATTEMPT !== '1') throw Error('STORED_CORRECTION_AUTHORITY_REJECTED');
}
export async function previewStoredCorrection({ publicKey, apiKey, freeProjectConfirmation, fetchImpl = globalThis.fetch } = {}) {
  diagnosticPublicKey(publicKey);
  if (freeProjectConfirmation !== FREE_PROJECT_CONFIRMATION || !/^[A-Za-z0-9_.-]{20,256}$/u.test(apiKey ?? '')) throw Error('STORED_CORRECTION_CONFIGURATION_INVALID');
  const { record, previousCorrection, dossier, provenance } = await storedAdvisoryCorrectionFixture();
  let requests = 0;
  const result = await previewGeminiLite({ apiKey, freeProjectConfirmation, dossier, fresh: true,
    repair: { unapproved: true, payload: previousCorrection.payload,
      rejectionDetails: [
        { reason: 'INDEPENDENT_EDITORIAL_REJECTION', feedback: {
          claims: 'The first claim cites only chronology but also asserts a technical defect. Restrict it to source provenance and chronology. Put the technical defect and conditional impact in the second claim, with its actual evidence. Complete written calendar dates equivalent to cited ISO dates are now supported.',
          whatToDoOrWatch: 'The latest action still inferred branch-to-fix pairings from separate lists. Remove the specific fixed-version examples from the action. Instead require verifying the applicable vendor fix for the installed branch. The affected-version scope in whyItMatters is separately supported.',
          story: 'Retain explicit vendor origin, both dates, attack conditions, exact affected-version scope, and source-specific citations. Do not invent score causality or operator error.' } },
      ] },
    fetchImpl: async (url, options) => {
      if (requests >= 1 || url !== `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LITE_MODEL}:generateContent` ||
          options?.method !== 'POST' || options.redirect !== 'error') throw Error('STORED_CORRECTION_NETWORK_REJECTED');
      requests++;
      return fetchImpl(url, options);
    } });
  if (result.html) result.html = renderHumanReview(result.draft, dossier, { fresh: true, storedEvidence: true, evidenceForFields: result.evidenceForFields });
  const report = { ...result.report, purpose: 'stored-evidence-correction', freshResearch: false,
    searchRequests: 0, articleRequests: 0, modelRequests: requests, maxModelRequests: 1,
    emailRequests: 0, approved: false, qualified: false, productionEnabled: false,
    sourceRun: record.sourceRun, previousCorrectionRun: previousCorrection.sourceRun, manualProseEdits: 0 };
  return { report, sealed: sealDiagnostic({ report, provenance, dossier,
    originalRejection: record, previousCorrection, obligations: advisoryWritingContract(dossier), result }, publicKey) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assertStoredCorrectionAuthority(process.env);
    if (process.argv.length !== 4 || process.argv[2] !== '--human-review-only') throw Error('STORED_CORRECTION_ARGUMENTS_INVALID');
    const result = await previewStoredCorrection({ publicKey: process.env.DIAGNOSTIC_PUBLIC_KEY, apiKey: process.env.GEMINI_API_KEY,
      freeProjectConfirmation: process.env.GEMINI_FREE_PROJECT_CONFIRMATION });
    await writeFile(process.argv[3], JSON.stringify(result.sealed), { flag: 'wx', mode: 0o600 });
    console.info(JSON.stringify(result.report));
    if (result.report.status !== 'human-review-required') process.exitCode = 1;
  } catch { console.error('Stored correction experiment failed; no email was sent.'); process.exitCode = 1; }
}
