// Written before the live split-review test. Expected labels never enter prompts.
import { reviewerHoldoutCases } from "./reviewer-holdouts.mjs";

export function reviewerClauseControls() {
  const source = { sourceId: "synthetic-larch-release", publisher: "Synthetic Larch Software",
    publisherKey: "synthetic-larch", relationship: "originating",
    passages: [
      { evidenceId: "S1P1", text: "Larch Studio adds three model selection modes: economy, balanced and quality. Developers can choose between cost and response quality." },
      { evidenceId: "S1P2", text: "A new ErrorBoard panel in Larch Studio links crash reports to code fixes." },
      { evidenceId: "S1P3", text: "In that ErrorBoard panel, developers can ask the assistant to investigate an error and propose a correction." },
      { evidenceId: "S1P4", text: "Separately, the existing deployment dashboard reports daily deployment counts and rollout completion rates." },
    ] };
  source.text = source.passages.map(p => p.text).join("\n");
  const draft = { candidateId: "clause-control-11", headline: "Larch Studio adds model choices and crash-report investigation",
    deck: "Larch describes model selection modes and an ErrorBoard panel for examining reported errors.",
    claims: [
      { text: "Larch Studio adds economy, balanced and quality model selection modes, allowing developers to choose between cost and response quality.", supports: [{ evidenceId: "S1P1" }] },
      { text: "Its ErrorBoard panel links crash reports to code fixes and lets developers ask the assistant to investigate an error and propose a correction.", supports: [{ evidenceId: "S1P2" }, { evidenceId: "S1P3" }] },
    ],
    whyItMatters: "Developers evaluating a model mode have a stated cost-versus-quality choice to examine. The ErrorBoard panel offers a route from an error report to a proposed correction, but a proposal still needs review before a team relies on it.",
    whatToDoOrWatch: "Compare the model modes on representative tasks before choosing one. For an ErrorBoard proposal, check whether the proposed change addresses the reported error and passes the team's tests before applying it.",
  };
  const item = (caseId, candidateId, expected) => ({ caseId, expected,
    draft: { ...structuredClone(draft), candidateId },
    dossier: { candidateId, desk: "work-and-tools", evidenceTier: "authoritative-single", sources: [structuredClone(source)] } });
  const positive = item("joint-citation-supported", "clause-control-11", { claims: [true, true],
    factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true, accepted: true });
  const missing = item("uncited-clause-present-elsewhere", "clause-control-24", { claims: [true, false], accepted: false });
  missing.draft.claims[1].supports = [{ evidenceId: "S1P2" }];
  const bridge = item("unsupported-metric-bridge", "clause-control-38", { claims: [true, true],
    factsSupported: false, analysisSupported: false, accepted: false });
  bridge.draft.whatToDoOrWatch = "Watch the deployment dashboard's daily deployment counts and rollout completion rates to measure whether the new model modes and ErrorBoard panel improve developers' productivity. These metrics track the effectiveness of the newly introduced features.";
  return [positive, missing, bridge, reviewerHoldoutCases()[1]];
}
