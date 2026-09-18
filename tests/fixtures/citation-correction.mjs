// Entirely synthetic. This is a shape-and-guard fixture, not a real model draft,
// a verified news report, or an independent semantic approval record.
import { GEMINI_LITE_MODEL } from '../../scripts/automation/free/gemini-ai.mjs';

export function citationCorrectionFixture() {
  const passages = [
    { evidenceId: 'S1P1', text: 'Acme announced revised request limits for its task workspace. Customers will be able to inspect workspace activity and review documented usage settings.' },
    { evidenceId: 'S1P2', text: 'The workspace settings page contains activity records and a usage panel. Administrators can inspect the named workspace before deciding whether to change their request patterns.' },
    { evidenceId: 'S1P3', text: 'Each workspace retains its own settings. The published plan describes a staged transition rather than a simultaneous migration of all customers.' },
    { evidenceId: 'S1P4', text: 'Starting November 20, 2028, Free accounts and unauthenticated requests happen first. Premium and Ultimate move in March 2029. These are separate phases of the workspace transition.' },
    { evidenceId: 'S1P5', text: 'Premium accounts can review their workspace activity through the dashboard before their later transition.' },
    { evidenceId: 'S1P6', text: 'The activity panel is available to administrators of a selected workspace and includes the workspace name.' },
  ];
  const dossier = { candidateId: 'candidate-synthetic-citation', desk: 'work', evidenceTier: 'authoritative-single',
    sources: [{ sourceId: 'synthetic-acme', publisher: 'Acme', publisherKey: 'acme', relationship: 'originating',
      publishedAt: '2028-10-01T09:00:00.000Z', passages, text: passages.map(p => p.text).join('\n') }] };
  const story = { candidateId: dossier.candidateId,
    headline: 'Acme sets out a staged change to workspace request limits',
    deck: 'Free accounts are included in the initial phase of Acme’s workspace transition.',
    claims: [
      { text: 'Acme describes a change to the limits on requests in its task workspace. The announcement also points customers toward the workspace activity view and the documented controls for reviewing usage.', supports: [{ evidenceId: 'S1P1' }] },
      { text: 'Administrators can look at activity for the workspace they select before considering changes to their request patterns. Acme places those records alongside the usage panel in the settings area.', supports: [{ evidenceId: 'S1P2' }] },
    ],
    whyItMatters: 'The applicability check is at the workspace level: settings remain separate, and Acme describes different transition stages. A team can identify the workspace it operates before deciding which part of the published plan applies.',
    whatToDoOrWatch: 'Open the settings for the relevant workspace and examine its activity record. Compare that view with the documented usage controls before changing request patterns, keeping the selected workspace in view during the check.',
  };
  const payload = { evidenceForFields: { headline: ['S1P1', 'S1P3'], deck: ['S1P3'], whyItMatters: ['S1P3'], whatToDoOrWatch: ['S1P2'] }, stories: [story] };
  const result = { report: { status: 'failed', code: 'GEMINI_EDITORIAL_VALIDATION_FAILED', model: GEMINI_LITE_MODEL,
    approved: false, qualified: false, productionEnabled: false, emailRequests: 0,
    structuralErrors: ['MAPPED_AUDIENCE_SUPPORT_REQUIRED'] }, html: null,
  rejectedDiagnostic: { unapproved: true, payload,
    rejectionDetails: [{ reason: 'MAPPED_AUDIENCE_SUPPORT_REQUIRED', feedback: { field: 'deck' } }] } };
  return { result, dossier, additions: [{ field: 'deck', evidenceIds: ['S1P4'] }] };
}
