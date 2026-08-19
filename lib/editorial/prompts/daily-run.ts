import type { Desk, IsoDate, IsoInstant } from "../schema";

export interface CandidateDossier {
  candidateId: string;
  canonicalEventKey: string;
  suggestedDesk: Desk;
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

export const DAILY_PROMPT_VERSION = "first-fold-daily-v1";

export function buildDailyRunPrompt(context: DailyRunContext): string {
  return `
Create the morning edition represented by RUN_CONTEXT.

Required internal sequence:
1. Reject candidates outside the reporting window unless their supplied
   materiallyUpdatedAt is inside it.
2. Consolidate candidates sharing a canonicalEventKey.
3. Compare candidates with recentArchive and require a named material delta for
   repeated events.
4. Verify that every reader-facing fact occurs in verifiedFacts and maps to a
   supplied source.
5. Select at most one qualifying story per desk, considering all desks together
   so an event appears only once.
6. Draft concise original copy.
7. Return all four desk keys, using a null story when nothing clears the bar.
8. Run a final consistency check, then return Edition JSON only.

RUN_CONTEXT:
${JSON.stringify(context)}
`.trim();
}
