// Diagnostic fixtures, NOT news or delivery content. These source excerpts
// come from the stored September 14 MIT research dossier, with its original
// evidence IDs. The drafts are offline-authored controls, including deliberate
// false assertions that reproduce observed writer/reviewer failure classes.
// Source: https://news.mit.edu/2026/new-method-enables-ai-safety-critical-situations-0914
//
// Keep caseId and expected OUTSIDE every model request. Pass only draft and
// dossier to buildExplicitClaimReview. Do not lower these expectations after
// seeing a live result. This fixture is a regression set, not an unseen holdout.
export function reviewerResearchScopeCases() {
  const source = {
    sourceId: "source-1-mit-news-ai",
    publisher: "MIT News — Artificial Intelligence",
    publisherKey: "mit",
    relationship: "originating",
    publishedAt: "2026-09-14T04:00:00.000Z",
    passages: [
      { evidenceId: "S1P4", text: "This adaptable, plug-and-play technique works at deployment time, so it can be applied to pretrained generative models without retraining them." },
      { evidenceId: "S1P5", text: "It can make such models more useful in applications where safety rules, physical laws, or other strict requirements cannot be violated." },
      { evidenceId: "S1P8", text: "The researchers developed an algorithm called HardFlow that steers the sampling process so that the final output satisfies the user’s hard constraints without being overly restrictive and is of higher quality." },
      { evidenceId: "S1P10", text: "The key to their technique is to give the model more freedom during the generation process and enforce hard constraints on the final output, rather than at every intermediate step." },
      { evidenceId: "S1P11", text: "In experiments spanning robotics, control of physical processes, and computer vision, the new method consistently satisfied the required constraints while identifying better solutions than existing techniques." },
      { evidenceId: "S1P17", text: "Pretrained generative AI models, such as diffusion models like Stable Diffusion and flow-matching models like FLUX, are now widely available." },
      { evidenceId: "S1P24", text: "By not requiring every intermediate step to satisfy the constraints, we give the model more freedom to find high-quality solutions that are still feasible in the end,” says Li." },
      { evidenceId: "S1P31", text: "Reformulating the task as an optimization problem allows HardFlow to incorporate additional goals that can improve the quality of the final answer." },
      { evidenceId: "S1P32", text: "For instance, HardFlow could find a collision-free path for a robot that is also the shortest distance to its goal." },
    ],
  };
  source.text = source.passages.map(passage => passage.text).join("\n");
  const supported = {
    headline: "MIT researchers test a constraint-handling technique for generative AI",
    deck: "The study reports results from robotics, physical-process control and computer vision, while describing shortest-path planning as a possible application.",
    claims: [
      { text: "The technique described by MIT News — Artificial Intelligence operates on pretrained generative models at deployment, without retraining, to help meet strict requirements.",
        supports: [{ evidenceId: "S1P4" }, { evidenceId: "S1P5" }] },
      { text: "MIT News — Artificial Intelligence reports experiments across robotics, physical-process control and computer vision that met required constraints and produced better solutions than earlier techniques.",
        supports: [{ evidenceId: "S1P11" }] },
    ],
    whyItMatters: "This research is relevant to teams exploring constrained planning because useful output must satisfy limits as well as optimize another objective. The reported experiments establish a research result, not proof of accident prevention or ready-to-deploy safety in a factory.",
    whatToDoOrWatch: "For a robot-planning trial, check which hard constraints and quality objective were evaluated and whether these match the intended task. Keep a laboratory comparison separate from evidence that a deployed system is safe around people.",
  };
  const item = (caseId, candidateId, expected, change = () => {}) => {
    const draft = { candidateId, ...structuredClone(supported) };
    change(draft);
    return { caseId, draft,
      dossier: { candidateId, desk: "ai", evidenceTier: "authoritative-single", sources: [structuredClone(source)] },
      expected };
  };
  return [
    item("supported-research-capability", "research-review-14", {
      claims: [true, true], factsSupported: true, attributionAccurate: true,
      analysisSupported: true, usefulAndSpecific: true, accepted: true,
    }),
    item("uncited-model-compatibility", "research-review-39", {
      claims: [false, true], factsSupported: false, accepted: false,
    }, draft => {
      // S1P17 remains visible as background but is NOT a citation for this
      // claim, nor a statement that this technique was tested with that model.
      draft.claims[0].text = "The technique described by MIT News — Artificial Intelligence operates on pretrained generative models such as Stable Diffusion at deployment, without retraining, to help meet strict requirements.";
    }),
    item("hypothetical-path-as-measured-result", "research-review-62", {
      claims: [true, false], factsSupported: false, accepted: false,
    }, draft => {
      // S1P11 reports general experimental results. S1P32 is explicitly a
      // 'could' example, not evidence of a measured shortest-path result.
      draft.claims[1] = {
        text: "MIT News — Artificial Intelligence reports that its robotics experiments found collision-free paths of the shortest possible length, outperforming previous constraint-handling methods.",
        supports: [{ evidenceId: "S1P11" }, { evidenceId: "S1P32" }],
      };
    }),
    item("guaranteed-operational-safety-benefit", "research-review-87", {
      claims: [true, true], factsSupported: false, analysisSupported: false, accepted: false,
    }, draft => {
      // The claims remain supported. A reviewer must check the factual content
      // of analysis too, not let two valid claims excuse invented outcomes.
      draft.whyItMatters = "For factory-robot teams, using HardFlow prevents dangerous near-misses, reduces downtime and eliminates collisions while preserving the quality of generated routes. These operational improvements make the approach suitable for safe deployment around human workers.";
    }),
  ];
}
