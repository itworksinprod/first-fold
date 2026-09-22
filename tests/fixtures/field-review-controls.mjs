import { reviewerClauseControls } from "./reviewer-clause-controls.mjs";

// Expectations are offline labels. No case label or expectation enters a request.
export function fieldReviewControls() {
  const [valid, , bridge, swapped] = reviewerClauseControls();
  const item = (caseId, text, sources, expected) => ({ caseId, input: { text, sources: structuredClone(sources) }, expected });
  const rollout = [{ publisher: "Synthetic Harbor Tools", passages: [
    { evidenceId: "S1P1", text: "Harbor Sync 6.2 introduces offline editing for its desktop application." },
    { evidenceId: "S1P2", text: "At launch, offline editing is limited to enterprise accounts invited into the pilot. Personal accounts cannot enable it. Mobile support is planned but has no release date." },
  ] }];
  const trial = [{ publisher: "Synthetic Meadow Lab", passages: [
    { evidenceId: "S1P1", text: "In a laboratory simulation with 120 tasks, Meadow's prototype reduced median processing time by 18 percent compared with its older prototype." },
    { evidenceId: "S1P2", text: "The team has not tested production deployments, energy use or operating costs. It says those outcomes remain unknown." },
  ] }];
  return [
    item("joint-supported", valid.draft.claims[1].text, valid.dossier.sources, true),
    item("metric-bridge", bridge.draft.whatToDoOrWatch, bridge.dossier.sources, false),
    item("conditions-swapped", swapped.draft.claims[1].text, swapped.dossier.sources, false),
    item("conditions-preserved", "Both flaws require an authenticated support-role account. The 4.8 session-cookie issue also requires diagnostics enabled; the separate 4.7 directory-listing issue is reachable with diagnostics enabled or disabled.", swapped.dossier.sources, true),
    item("new-rollout-overstatement", "All Harbor Sync 6.2 users can now edit offline on desktop and mobile.", rollout, false),
    item("new-rollout-limited", "Harbor Sync's offline editing pilot is currently limited to invited enterprise desktop users; mobile support has no announced release date.", rollout, true),
    item("new-measured-outcome-swap", "Meadow measured an 18 percent reduction in production operating costs.", trial, false),
    item("new-conditional-analysis", "The simulation suggests a processing-time benefit worth testing in production; it does not establish lower energy use or operating costs.", trial, true),
  ];
}
