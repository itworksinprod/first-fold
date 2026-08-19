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
  mastheadName: string;
  mastheadTagline: string;
  reportingWindow: {
    startInclusive: IsoInstant;
    endExclusive: IsoInstant;
    displayLabel: string;
  };
  publishAt: IsoInstant;
  generatedAt: IsoInstant;
  recentArchive: readonly {
    canonicalEventKey: string;
    lastPublishedAt: IsoInstant;
    lastKnownFacts: readonly string[];
  }[];
  candidates: readonly CandidateDossier[];
}

export const DAILY_PROMPT_VERSION = "first-fold-daily-v2";

export function buildDailyRunPrompt(context: DailyRunContext): string {
  return `
Create the morning edition represented by RUN_CONTEXT.

Required internal sequence:
1. Reject candidates outside the reporting window unless their supplied
   materiallyUpdatedAt is inside it.
2. Consolidate candidates sharing a canonicalEventKey.
3. Compare candidates with recentArchive and require a named material delta for
   repeated events.
4. Route up to three worthwhile emerging-signal candidates to
   backPage.watchNext and omit the rest; an emerging signal can never become a
   desk story.
5. Verify that every reader-facing fact occurs in verifiedFacts and maps to a
   supplied source.
6. Classify verified developments by their primary reader consequence, applying
   the four desk charters rather than accepting suggestedDesk automatically.
7. Select at most one qualifying story per desk, considering all desks together
   so an event appears only once. Normally select no company or primary entity
   twice. If two stories from one primary entity are indispensable, name the
   specific editorial reason in frontPage.diversityException.
8. Limit the complete edition to at most two stories marked aiAdjacent. AI must
   be central to the event—not merely mentioned—for aiAdjacent to be true.
9. Draft concise original copy. For each story, set editorial.primaryEntity,
   editorial.aiAdjacent, editorial.maturity to verified-development, and give a
   concrete editorial.deskFit rationale.
10. Return exactly these four desk keys: ai, work-and-tools,
    security-and-privacy, and platforms-and-power. Use a null story when nothing
    clears the bar.
11. Run a final consistency check across desk fit, entity diversity, AI balance,
    sources, and story order, then return Edition schema version 2 JSON only.

RUN_CONTEXT:
${JSON.stringify(context)}
`.trim();
}
