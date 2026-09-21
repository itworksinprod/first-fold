// Fixed synthetic truth controls; never send expected labels to a model.
export function freeReviewerSyntheticCases() {
  const source = { sourceId: "synthetic-meridian-release", publisher: "Synthetic Meridian Laboratory",
    publisherKey: "synthetic-meridian", relationship: "originating", publishedAt: "2026-01-10T08:00:00.000Z",
    passages: [
      { evidenceId: "S1P1", text: "Synthetic Meridian Laboratory announces Harbor Agent version 3.2 for Linux servers." },
      { evidenceId: "S1P2", text: "Version 3.2 gives signed-in team administrators a read-only inventory report. It does not change installed services or their configuration." },
      { evidenceId: "S1P3", text: "The laboratory has moved its annual staff conference to Bristol." },
    ] };
  source.text = source.passages.map(passage => passage.text).join(" ");
  const draft = { candidateId: "review-fixture-a",
    headline: "Harbor Agent adds a read-only inventory report",
    deck: "Synthetic Meridian Laboratory announces a Linux-server release for team administrators.",
    claims: [
      { text: "Synthetic Meridian Laboratory has announced Harbor Agent 3.2 for Linux servers.", supports: [{ evidenceId: "S1P1" }] },
      { text: "According to the laboratory, signed-in team administrators can inspect an inventory report without the report changing installed services or configuration.", supports: [{ evidenceId: "S1P2" }] },
    ],
    whyItMatters: "A read-only inventory could help an administrator inspect a server before considering changes. The release announcement does not establish any measured time saving or guarantee that an inventory is complete.",
    whatToDoOrWatch: "Check the release documentation for the scope of the report and its administrator sign-in requirements. That scope would clarify which inventory questions the report can answer before a team relies on it.",
  };
  const item = (caseId, candidateId, expected) => ({ caseId, expected,
    draft: { ...structuredClone(draft), candidateId },
    dossier: { candidateId, desk: "work-and-tools", evidenceTier: "authoritative-single", sources: [structuredClone(source)] } });
  const positive = item("supported-control", "review-fixture-a", {
    claims: [true, true], factsSupported: true, attributionAccurate: true,
    analysisSupported: true, usefulAndSpecific: true, accepted: true,
  });
  const falseClaims = item("wrong-facts-and-prerequisite", "review-fixture-b", {
    claims: [false, false], factsSupported: false, accepted: false,
  });
  const advisory = falseClaims.dossier.sources[0];
  advisory.passages = [
    { evidenceId: "S1P1", text: "Synthetic Meridian Laboratory says Harbor Agent 3.2 produces eight inventory checks. Beacon Console is a different product." },
    { evidenceId: "S1P2", text: "Remote code execution is possible only when the optional maintenance endpoint is enabled and the attacker already has an authenticated administrator session." },
  ];
  advisory.text = advisory.passages.map(passage => passage.text).join(" ");
  falseClaims.draft.claims = [
    { text: "Synthetic Meridian Laboratory says Beacon Console produces twelve inventory checks in the newly announced release.", supports: [{ evidenceId: "S1P1" }] },
    { text: "The laboratory reports that any unauthenticated internet user can execute remote code while the optional maintenance endpoint is disabled.", supports: [{ evidenceId: "S1P2" }] },
  ];
  const promotion = item("unsupported-benefit", "review-fixture-c", {
    claims: [true, true], factsSupported: false, analysisSupported: false, accepted: false,
  });
  promotion.draft.whyItMatters = "Independent timed trials prove this release cuts operating costs by fifty percent and prevents every service outage. Every team is guaranteed these improvements immediately, without any change in its existing workflow.";
  const irrelevant = item("irrelevant-extra-citation", "review-fixture-d", {
    claims: [false, true], accepted: false,
  });
  irrelevant.draft.claims[0].supports.push({ evidenceId: "S1P3" });
  return [positive, falseClaims, promotion, irrelevant];
}
