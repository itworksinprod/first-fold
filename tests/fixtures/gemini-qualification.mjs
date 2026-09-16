import { reviewerHoldoutCases } from "./reviewer-holdouts.mjs";
import { reviewerResearchScopeCases } from "./reviewer-research-scope.mjs";

// Regression cases, not unseen holdouts or news. Expected answers and case names
// must never enter a provider request. These do not establish live-paper quality.
export function geminiQualificationCases() {
  const research = reviewerResearchScopeCases();
  const release = structuredClone(research[0]);
  release.caseId = "research-misrepresented-as-product-release";
  release.draft.candidateId = release.dossier.candidateId = "scope-review-23";
  // Reproduces the misleading headline accepted by the previous local reviewer.
  release.draft.headline = "MIT Researchers Release HardFlow, a Plug-and-Play AI Constraint Solver";
  release.expected = { claims: [true, true], factsSupported: false, accepted: false };
  const filler = structuredClone(research[0]);
  filler.caseId = "generic-reader-copy";
  filler.draft.candidateId = filler.dossier.candidateId = "scope-review-51";
  filler.draft.whyItMatters = "This is an important development in artificial intelligence. Technology changes quickly, so readers should stay informed about relevant updates and consider how new developments might matter to them.";
  filler.draft.whatToDoOrWatch = "Read the linked report to learn more about this development. Watch for future updates, compare the available information and decide whether it is relevant to your needs.";
  filler.expected = { claims: [true, true], usefulAndSpecific: false, accepted: false };
  return [...reviewerHoldoutCases(), ...research, release, filler];
}

export function geminiWriterControls() {
  // Only the dossiers reach the writer, never these expected/example drafts.
  return [reviewerHoldoutCases()[0], reviewerResearchScopeCases()[0]];
}
