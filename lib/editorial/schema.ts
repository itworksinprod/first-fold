export const DESKS = [
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
] as const;

export type Desk = (typeof DESKS)[number];

export interface DeskCharter {
  name: string;
  editorialQuestion: string;
  includes: readonly string[];
  excludes: readonly string[];
}

/**
 * Stable desk boundaries used by candidate classification, drafting, and
 * reader-facing labels. File a story by its primary consequence to the reader,
 * not by the company involved or the technologies it happens to mention.
 */
export const DESK_CHARTERS = {
  ai: {
    name: "AI & Models",
    editorialQuestion: "What became possible or better understood?",
    includes: [
      "model capabilities, releases, evaluations, and research",
      "frontier-model safety, governance, and technical limitations",
    ],
    excludes: [
      "routine product features whose main consequence is a changed workflow",
      "security incidents whose main consequence is a defensive action",
    ],
  },
  "work-and-tools": {
    name: "Work & Tools",
    editorialQuestion: "What should the reader change about how they work?",
    includes: [
      "meaningful workflow and productivity changes",
      "workplace adoption, labor effects, and enterprise tool behavior",
    ],
    excludes: [
      "routine feature announcements without a material workflow consequence",
      "model research whose main consequence is a new capability or finding",
    ],
  },
  "security-and-privacy": {
    name: "Security & Privacy",
    editorialQuestion: "What risk requires attention or action?",
    includes: [
      "exploited vulnerabilities, breaches, identity, and defensive decisions",
      "privacy, surveillance, and data-use changes with concrete consequences",
    ],
    excludes: [
      "speculative threats without a proportionate reader action",
      "general AI safety research without a present security or privacy decision",
    ],
  },
  "platforms-and-power": {
    name: "Platforms & Power",
    editorialQuestion: "Who controls the systems, access, and rules?",
    includes: [
      "chips, cloud, operating systems, app stores, and internet infrastructure",
      "platform control, antitrust, digital regulation, and market access",
    ],
    excludes: [
      "consumer gadget launches without structural consequence",
      "generic technology news that fits no defined reader consequence",
    ],
  },
} as const satisfies Record<Desk, DeskCharter>;

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

  editorial: {
    /** Organization, institution, or system primarily responsible for the event. */
    primaryEntity: string;
    /** True when AI is central enough that this contributes to the edition cap. */
    aiAdjacent: boolean;
    /** Full stories require a verified development; weak signals belong on Watch Next. */
    maturity: "verified-development";
    /** Concise explanation of why this desk owns the story. */
    deskFit: string;
  };

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

  /** Valid only for a story on the Security & Privacy desk. */
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
  schemaVersion: 2;
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
    /** References the Security & Privacy story; never creates a fifth story. */
    stopThePressesStoryId: string | null;
    /** Required only when the same primary entity earns more than one story. */
    diversityException: string | null;
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
