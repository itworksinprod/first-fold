export const DESKS = [
  "ai",
  "ai-at-work",
  "cybersecurity",
  "technology",
] as const;

export type Desk = (typeof DESKS)[number];
export type IsoDate = string;
export type IsoInstant = string;
export type NonEmpty<T> = readonly [T, ...T[]];

export type StoryStatus = "new-development" | "material-update";
export type Priority = "critical" | "high" | "notable";
export type ConfidenceLevel = "high" | "medium" | "developing";

export interface StorySource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  relationship: "originating" | "independent" | "context";
  publishedAt: IsoInstant | null;
  retrievedAt: IsoInstant;
}

export interface EvidenceClaim {
  id: string;
  statement: string;
  sourceIds: NonEmpty<string>;
  verification:
    | "confirmed"
    | "company-claimed"
    | "preliminary"
    | "disputed";
}

export interface SecurityAction {
  severity: "critical" | "high" | "moderate" | "monitor";
  affected: string;
  exploitation:
    | "confirmed"
    | "suspected"
    | "not-observed"
    | "not-applicable";
  action: string;
  deadline: IsoInstant | null;
}

export interface Story {
  /** Unique within an edition. */
  id: string;

  /** Stable across editions for the same underlying event. */
  canonicalEventKey: string;

  desk: Desk;
  headline: string;
  deck: string;
  status: StoryStatus;
  priority: Priority;

  timing: {
    eventAt: IsoInstant | null;
    firstPublishedAt: IsoInstant;
    materiallyUpdatedAt: IsoInstant | null;
  };

  whatHappened: string;
  whyItMatters: string;
  whatToDoOrWatch: string;

  selection: {
    score: number;
    selectedBecause: string;
    materialDelta: string | null;
  };

  confidence: {
    level: ConfidenceLevel;
    rationale: string;
  };

  sources: NonEmpty<StorySource>;
  evidence: NonEmpty<EvidenceClaim>;

  /** Valid only for a story on the cybersecurity desk. */
  securityAction?: SecurityAction;
}

export type DeskPage =
  | {
      desk: Desk;
      story: Story;
      emptyReason?: never;
    }
  | {
      desk: Desk;
      story: null;
      emptyReason: string;
    };

export interface BackPageExperiment {
  title: string;
  goal: string;
  steps: readonly [string, string, ...string[]];
  successMeasure: string;
  riskCheck: string;
}

export interface WatchItem {
  topic: string;
  unresolved: string;
  meaningfulSignal: string;
  whyItMatters: string;
}

export interface Correction {
  addedAt: IsoInstant;
  note: string;
}

export interface Edition {
  schemaVersion: 1;
  id: string;
  issueNumber: number;
  editionDate: IsoDate;
  status: "draft" | "validated" | "published";

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
    targetLocalTime: "06:00";
    publishAt: IsoInstant;
    generatedAt: IsoInstant;
    publishedAt: IsoInstant | null;
  };

  frontPage: {
    note: string;
    estimatedMinutes: number;
    leadStoryId: string | null;
    storyOrder: readonly string[];
    /** References the cybersecurity story; never creates a fifth story. */
    stopThePressesStoryId: string | null;
  };

  desks: Record<Desk, DeskPage>;

  backPage: {
    tryThisTomorrow: BackPageExperiment | null;
    watchNext: readonly WatchItem[];
  };

  corrections: readonly Correction[];

  provenance: {
    policyVersion: string;
    promptVersion: string;
    pipelineVersion: string;
  };
}
