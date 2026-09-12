// Entirely synthetic editorial exercises. None is current news, a real vendor
// announcement, a recommendation, or evidence that a model is accurate.
export const FREE_EDITORIAL_EVAL_FIXTURE_VERSION = "synthetic-editorial-v1";

const fixture = (desk, slug, publisher, title, summary, draft) => ({
  id: `synthetic-${slug}`, desk, synthetic: true,
  candidate: {
    candidateId: `synthetic-${slug}`, suggestedDesk: desk,
    ranking: { evidenceTier: "authoritative-single" },
    sources: [{ id: `${slug}-source`, publisher, publisherKey: slug, title,
      relationship: "originating", publishedAt: "2026-08-19T08:00:00.000Z",
      url: `https://example.com/synthetic/${slug}` }],
    feedEvidence: [{ sourceId: `${slug}-source`, publisher, title, summary,
      categories: [desk], publishedAt: "2026-08-19T08:00:00.000Z" }],
  },
  draft: { candidateId: `synthetic-${slug}`, ...draft },
});
const claim = (text, ...evidenceIds) => ({ text, supports: evidenceIds.map(evidenceId => ({ evidenceId })) });

export function buildFreeEditorialBaselines() {
  return [
    fixture("ai", "meridian", "Synthetic Meridian Lab", "Meridian Small offers offline document processing",
      "Synthetic Meridian Lab announced Meridian Small, an on-device text model that can run without network access. " +
      "The downloadable package uses a permissive license, supports 8 languages and is intended for short document tasks. " +
      "The internal evaluation was performed only by the lab and does not establish performance on unfamiliar company documents.", {
        headline: "Meridian Small brings document tasks onto local devices",
        deck: "Synthetic Meridian Lab presents an offline model with vendor-only evaluation evidence.",
        claims: [
          claim("Synthetic Meridian Lab has introduced Meridian Small for text tasks on local devices. The lab says it can operate without a network connection, so the release offers an offline deployment option rather than a hosted service.", "S1P2"),
          claim("The downloadable package carries a permissive license and targets short documents. Its evaluation evidence is limited to the lab’s own tests; the announcement does not show how the model behaves on unfamiliar company material.", "S1P3", "S1P4"),
        ],
        whyItMatters: "For teams that cannot routinely send documents to a hosted model, an offline option could change where processing happens. That is a deployment choice, not proof of stronger answers. The internal test results leave the quality of responses on a team’s own documents unresolved.",
        whatToDoOrWatch: "Check the license and try representative documents before choosing the model for an existing workflow. Watch for outside evaluations and documented device requirements. Keep the decision tied to the actual task rather than treating local execution as evidence of reliable output.",
      }),
    fixture("work-and-tools", "forge", "Synthetic Forge Tools", "Forge Workbench adds a mandatory change-review checkpoint",
      "Synthetic Forge Tools added a review checkpoint to Forge Workbench automated code changes. " +
      "Proposed edits are shown as a diff and cannot be applied until a maintainer accepts them. " +
      "The feature is available in preview and does not replace repository tests or existing approval rules.", {
        headline: "Forge Workbench puts a review checkpoint before automated edits",
        deck: "Synthetic Forge Tools makes proposed changes visible before a maintainer accepts them.",
        claims: [
          claim("Synthetic Forge Tools has added a review step to automated editing in Forge Workbench. Maintainers can inspect the proposed diff before accepting changes, and the tool holds those edits until that approval is given.", "S1P2", "S1P3"),
          claim("The checkpoint is a preview feature, not a replacement for repository tests or approval policies. The announcement describes an extra place to inspect a change; it does not establish that the suggested code will be correct.", "S1P4"),
        ],
        whyItMatters: "A visible review step could make automated edits easier to assess before they enter a working tree. Its value depends on whether a maintainer can understand the proposed change. Approval remains a human decision, and the extra checkpoint does not demonstrate that generated code is safe.",
        whatToDoOrWatch: "Try the preview on a small change and check that the displayed diff matches what gets applied. Keep existing repository checks in place. Watch for clearer documentation about the preview’s limits before relying on it as part of a routine editing workflow.",
      }),
    fixture("security-and-privacy", "sentinel", "Synthetic Sentinel Advisory", "Sentinel backup driver exposes local disk writes",
      "The vaultdrv.sys driver permits local users to change physical disk contents because its access checks are insufficient. " +
      "When Secure Boot is disabled, a disk write may enable UEFI-level code execution before the operating system starts. " +
      "The advisory identifies neither active attacks nor a corrected driver version.", {
        headline: "Sentinel backup driver exposes local access to disk writes",
        deck: "Synthetic Sentinel Advisory separates the local flaw from its conditional boot-level impact.",
        claims: [
          claim("Synthetic Sentinel Advisory reports that the vaultdrv.sys driver lets a local user alter disk contents through inadequate access restrictions. The issue involves a driver on the affected machine rather than a demonstrated remote attack.", "S1P2"),
          claim("With Secure Boot disabled, the advisory says disk changes may lead to UEFI-level code execution. It does not identify attacks in the wild or a corrected driver release, so neither can be inferred from the report.", "S1P3", "S1P4"),
        ],
        whyItMatters: "A backup driver with overly broad disk access could threaten the information the software is intended to protect. That makes the installed driver relevant to a defender’s exposure assessment. The possible boot-level consequence remains conditional, not an observed outcome on every machine.",
        whatToDoOrWatch: "Check whether the named driver is installed and consult the advisory for the affected configuration. Watch for a documented corrected release and clearer exploitation evidence. Keep protective controls enabled; the report does not justify assuming that a fix is already available.",
      }),
    fixture("platforms-and-power", "harbor", "Synthetic Harbor Cloud", "Harbor Cloud schedules retirement of its legacy export endpoint",
      "Synthetic Harbor Cloud announced that its legacy export endpoint will be retired after a migration period. " +
      "Customers using the old endpoint must move to the replacement export interface to preserve scheduled exports. " +
      "The replacement interface requires a different request format, and the announcement does not disclose migration error rates.", {
        headline: "Harbor Cloud requires export integrations to move to a replacement interface",
        deck: "Synthetic Harbor Cloud ties continued scheduled exports to an endpoint migration.",
        claims: [
          claim("Synthetic Harbor Cloud plans to retire its older export endpoint after a migration period. Customers whose scheduled exports still use that endpoint need to move those integrations to the replacement interface to keep them running.", "S1P2", "S1P3"),
          claim("The replacement interface uses a different request format. The announcement does not supply migration error rates, so the change establishes work for affected integrations without showing how reliably existing requests will transfer.", "S1P4"),
        ],
        whyItMatters: "For an organization that relies on scheduled exports, an endpoint retirement can turn an otherwise stable integration into maintenance work. The different request format means the change may need more than a new address. Actual disruption depends on which existing jobs still use the older interface.",
        whatToDoOrWatch: "Inventory export jobs that use the legacy endpoint, then compare a representative request with the replacement documentation. Watch for migration guidance and test results before changing a production job. The announcement alone does not show that every integration will transfer cleanly.",
      }),
  ];
}

export function buildFreeEditorialEvalCases() {
  const baselines = buildFreeEditorialBaselines();
  const cases = baselines.map(value => ({ ...structuredClone(value), id: `accept-${value.id}`,
    expected: "accept", expectedCodes: [], purpose: "A specific, attributed synthetic draft fits the local contract." }));
  const add = (id, baseIndex, expectedCodes, purpose, mutate) => {
    const value = structuredClone(baselines[baseIndex]);
    mutate(value);
    cases.push({ ...value, id, expected: "reject", expectedCodes, purpose });
  };
  add("reject-leaked-json", 0, ["READER_COPY"], "JSON is nested inside an otherwise valid prose string.", value => {
    value.draft.headline = 'Meridian Small”, “stories”: [{';
  });
  add("reject-generic-fallback", 1, ["GENERIC_COPY"], "Generic desk filler is not a news summary.", value => {
    value.draft.headline = "Synthetic Forge Tools reports a new development";
  });
  add("reject-invented-number", 0, ["NUMERIC_ANCHOR"], "A performance figure is absent from every source passage.", value => {
    value.draft.headline = "Meridian Small improves performance by 400%";
  });
  add("reject-wrong-number-passage", 0, ["NUMERIC_CITATION"], "A real dossier number is not supported by the cited passage.", value => {
    value.draft.claims[0].text += " The package supports 8 languages.";
  });
  add("reject-missing-security-condition", 2, ["SOURCE_CAVEAT"], "A conditional boot-level impact loses its prerequisite.", value => {
    value.draft.claims[1].text = "The advisory says disk changes may lead to UEFI-level code execution on affected systems. It does not identify attacks in the wild or a corrected driver release, so neither can be inferred from the report.";
  });
  add("reject-false-independent-confirmation", 0, ["ATTRIBUTION"], "A single publisher is not independent confirmation.", value => {
    value.draft.headline = "Independent reporting confirms Meridian Small’s offline capabilities";
  });
  add("reject-same-publisher-corroboration", 0, ["CORROBORATION"], "Multiple passages from one publisher are not corroboration.", value => {
    value.candidate.ranking.evidenceTier = "corroborated";
  });
  add("reject-unknown-passage", 3, ["CITATION_UNKNOWN"], "An invented passage ID cannot support a claim.", value => {
    value.draft.claims[0].supports[0].evidenceId = "S99P99";
  });
  add("reject-unfinished-paragraph", 1, ["READER_COPY"], "A truncated body sentence is not publishable copy.", value => {
    value.draft.whatToDoOrWatch = value.draft.whatToDoOrWatch.replace(/\.$/u, " and");
  });
  return cases;
}

export const FREE_EDITORIAL_HUMAN_REVIEW_CHECKLIST = Object.freeze([
  "Does each story explain the specific change, affected audience, and practical consequence?",
  "Do the linked primary passages support every claim, including numbers and prerequisites?",
  "Are vendor statements distinguished from genuinely independent reporting?",
  "Is the analysis useful without inventing urgency, outcomes, fixes, or recommendations?",
  "Does the desk assignment fit, and are material stories missing or repeated?",
  "Read the final HTML and text as a subscriber: no filler, fragments, or malformed copy.",
]);
