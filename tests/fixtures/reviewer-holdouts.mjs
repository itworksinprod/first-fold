// Synthetic, offline-authored holdouts. These are not real news or delivery
// content. Keep caseId/expected outside a reviewer request: pass only each
// draft and dossier to buildExplicitClaimReview. Do not tune the prompt to
// these expected answers after a model has seen the cases.
export function reviewerHoldoutCases() {
  const transit = {
    sourceId: "synthetic-northbank-data-notice",
    publisher: "Synthetic Northbank Transit Authority",
    publisherKey: "synthetic-northbank-transit",
    relationship: "originating",
    publishedAt: "2026-02-17T09:00:00.000Z",
    passages: [
      { evidenceId: "S1P1", text: "Synthetic Northbank Transit Authority has published a downloadable step-free access dataset covering 40 selected stations. This initial dataset does not cover the authority's entire network." },
      { evidenceId: "S1P2", text: "The dataset lists station entrances and lifts and is refreshed each weekday at 06:00. It is not a live lift-status service; a listed lift may be out of service after the daily snapshot." },
    ],
  };
  transit.text = transit.passages.map(passage => passage.text).join("\n");
  const gateway = {
    sourceId: "synthetic-cedar-advisory",
    publisher: "Synthetic Cedar Systems",
    publisherKey: "synthetic-cedar-systems",
    relationship: "originating",
    publishedAt: "2026-02-18T09:00:00.000Z",
    passages: [
      { evidenceId: "S1P1", text: "Synthetic Cedar Systems has released Aster Gateway 4.8.2 to fix session-cookie disclosure affecting versions 4.8.0 and 4.8.1. A different directory-listing flaw affects the legacy 4.7 branch and is fixed in 4.7.9." },
      { evidenceId: "S1P2", text: "In the 4.8 branch, session-cookie disclosure requires an attacker with an authenticated support-role account and the optional diagnostics feature enabled. Disabling diagnostics blocks this attack path but does not install the 4.8.2 correction." },
      { evidenceId: "S1P3", text: "In the 4.7 branch, the directory-listing flaw also requires an authenticated support-role account, but it is reachable whether diagnostics is enabled or disabled. This flaw does not disclose session cookies." },
    ],
  };
  gateway.text = gateway.passages.map(passage => passage.text).join("\n");
  return [
    {
      caseId: "supported-transit-data-holdout",
      draft: {
        candidateId: "review-holdout-17",
        headline: "Transit authority publishes step-free access data for 40 stations",
        deck: "Northbank's initial dataset covers selected stations and is a weekday snapshot, not live lift status.",
        claims: [
          { text: "Synthetic Northbank Transit Authority has published downloadable step-free access data for 40 selected stations, rather than its entire network.", supports: [{ evidenceId: "S1P1" }] },
          { text: "The authority says the data lists entrances and lifts and updates at 06:00 on weekdays. It does not report live lift status, so a listed lift may become unavailable after a snapshot.", supports: [{ evidenceId: "S1P2" }] },
        ],
        whyItMatters: "The dataset could help a journey-planning team identify which entrances and lifts are listed at covered stations. Its limited coverage and weekday refresh mean it cannot establish that a particular lift will be working when a passenger arrives.",
        whatToDoOrWatch: "Check whether the stations on a proposed route are included and note the snapshot time. Before relying on a lift for a trip, seek current operating information rather than treating a listed entrance or lift as proof of live availability.",
      },
      dossier: { candidateId: "review-holdout-17", desk: "platforms-and-power", evidenceTier: "authoritative-single", sources: [transit] },
      expected: { claims: [true, true], factsSupported: true, attributionAccurate: true,
        analysisSupported: true, usefulAndSpecific: true, accepted: true },
    },
    {
      caseId: "version-condition-swap-holdout",
      draft: {
        candidateId: "review-holdout-42",
        headline: "Aster Gateway updates address two branch-specific flaws",
        deck: "Cedar distinguishes a session-cookie issue in 4.8 from a separate directory-listing issue in 4.7.",
        claims: [
          { text: "Synthetic Cedar Systems says Aster Gateway 4.8.2 fixes session-cookie disclosure in 4.8.0 and 4.8.1. Its separate directory-listing fix for the legacy 4.7 branch is version 4.7.9.", supports: [{ evidenceId: "S1P1" }] },
          { text: "The advisory says both flaws require an authenticated support-role account, but only the 4.7 directory-listing flaw requires diagnostics to be enabled; 4.8 session-cookie disclosure remains reachable with diagnostics disabled.", supports: [{ evidenceId: "S1P2" }, { evidenceId: "S1P3" }] },
        ],
        whyItMatters: "Operators need to distinguish the installed branch and the vulnerability it addresses before choosing an update. A fix identified for one branch should not be assumed to correct the other branch's separate flaw.",
        whatToDoOrWatch: "Match the installed version to the vendor's branch-specific correction and check the account and configuration prerequisites in the advisory. Keep a configuration workaround distinct from installing a corrected release when recording the response.",
      },
      dossier: { candidateId: "review-holdout-42", desk: "security-and-privacy", evidenceTier: "authoritative-single", sources: [gateway] },
      // The second claim swaps the diagnostics condition between branches.
      // Require that exact claim/factual veto, without prescribing how other
      // overlapping whole-story flags categorize the same error.
      expected: { claims: [true, false], factsSupported: false, accepted: false },
    },
  ];
}
