import type { Desk, IsoDate, IsoInstant } from "../schema";

export interface CandidateDossier {
  candidateId: string;
  canonicalEventKey: string;
  suggestedDesk: Desk;
  primaryEntity: string;
  aiAdjacent: boolean;
  maturity: "verified-development" | "emerging-signal";
  title: string;
  eventAt: IsoInstant | null;
  firstPublishedAt: IsoInstant;
  materiallyUpdatedAt: IsoInstant | null;
  verifiedFacts: readonly string[];
  unresolvedQuestions: readonly string[];
  sources: readonly {
    id: string;
    title: string;
    publisher: string;
    url: string;
    relationship: "originating" | "independent" | "context";
    publishedAt: IsoInstant | null;
    retrievedAt: IsoInstant;
  }[];
}

export interface DailyRunContext {
  editionId: string;
  issueNumber: number;
  editionDate: IsoDate;
  masthead: {
    name: string;
    tagline: string;
  };
  timezone: "America/New_York";
  reportingWindow: {
    startInclusive: IsoInstant;
    endExclusive: IsoInstant;
    displayLabel: string;
  };
  publication: {
    publishAt: IsoInstant;
    generatedAt: IsoInstant;
  };
  recentArchive: readonly {
    editionId: string;
    editionDate: IsoDate;
    publishedAt: IsoInstant | null;
    stories: readonly {
      canonicalEventKey: string;
      headline: string;
      primaryEntity: string;
      status: "new-development" | "material-update";
      timing: {
        eventAt: IsoInstant | null;
        firstPublishedAt: IsoInstant;
        materiallyUpdatedAt: IsoInstant | null;
      };
      lastKnownFacts: readonly string[];
    }[];
  }[];
  /**
   * Pre-normalized dossiers for replay/manual runs. An automatic pilot run may
   * supply an empty list and require source discovery through its web-search
   * tool instead.
   */
  candidates?: readonly CandidateDossier[];
}

export const DAILY_PROMPT_VERSION = "first-fold-daily-v2";

export function buildDailyRunPrompt(context: DailyRunContext): string {
  return `
Create the proposed morning edition represented by RUN_CONTEXT. This is an
unapproved pull-request candidate even when the canonical output is shaped for
publication. Only the external exact-revision human gate can approve it.

Required internal sequence:
1. Treat the half-open reporting window, edition identity, masthead, timezone,
   and publication fields as immutable. Pilot sequence and provenance belong to
   trusted code; do not create or return them.
2. When candidate dossiers are supplied, reject those outside the reporting
   window unless their materiallyUpdatedAt is inside it. When the list is empty
   and web search is available, research every desk separately. Use search
   results only for discovery, open the direct source page, and verify its
   publication or material-update time before treating it as eligible.
3. Prefer originating records and primary sources, adding reputable independent
   reporting when it improves verification. Do not rely on an inaccessible
   page, a search snippet, or a generated URL as evidence.
4. Consolidate candidates sharing a canonicalEventKey. Compare candidates with
   recentArchive and require a named material delta for repeated events.
5. Omit every emerging signal. During this automatic pilot, the trusted
   composer sets backPage.watchNext to an empty array because the current v2
   WatchItem cannot preserve source and evidence mappings. Never promote a
   weak signal to a desk story or experiment to work around that restriction.
6. Verify every material claim in the headline, deck, reader-facing sections,
   and recommended action against inspected source text. Create an evidence
   statement with sourceIds for each such claim. Attribute company claims and
   omit anything unsupported.
7. Classify verified developments by their primary reader consequence, applying
   the four desk charters rather than accepting suggestedDesk automatically.
8. Select at most one qualifying story per desk, considering all desks together
   so an event appears only once. Normally select no company or primary entity
   twice. If two stories from one primary entity are indispensable, name the
   specific editorial reason in frontPage.diversityException. Choose the lead
   by consequence, evidence, and urgency; put it first and include every
   selected story exactly once in frontPage.storyOrder. Keep estimatedMinutes
   at six or less.
9. Limit the complete edition to at most two stories marked aiAdjacent. AI must
   be central to the event—not merely mentioned—for aiAdjacent to be true.
10. Draft concise original copy. For each story, set editorial.primaryEntity,
   editorial.aiAdjacent, editorial.maturity to verified-development, and give a
   concrete editorial.deskFit rationale. Set backPage.tryThisTomorrow to null
   unless it follows directly from a selected story, introduces no new factual
   premise, and is low-risk and reversible under the policy.
11. Return exactly these four desk keys: ai, work-and-tools,
    security-and-privacy, and platforms-and-power. Use a null story and a final,
    honest quiet-desk explanation when nothing clears the bar; never keep “not
    selected yet” scaffolder text.
12. Run a final consistency check across window eligibility, claim-to-source
    mappings, direct URLs, attribution, desk fit, entity diversity, AI balance,
    quiet desks, and front-page story order. Return only the model-authored
    editorial fields accepted by the supplied structured-output schema. Trusted
    code composes the canonical Edition v2 metadata, publication state, empty
    Watch Next array, corrections, and provenance. Never claim that the
    candidate has received human approval.

RUN_CONTEXT:
${JSON.stringify(context)}
`.trim();
}
