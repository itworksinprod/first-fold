const DESKS = [
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
];

// Keep this schema inside the strict Structured Outputs subset. Non-empty and
// cross-field constraints are enforced by deterministic local validation.
const nonBlankString = { type: "string" };
const nullableString = { type: ["string", "null"] };

const strictObject = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

const sourceSchema = strictObject({
  id: nonBlankString,
  title: nonBlankString,
  publisher: nonBlankString,
  url: nonBlankString,
  relationship: { enum: ["originating", "independent", "context"] },
  publishedAt: nullableString,
  retrievedAt: nonBlankString,
});

const evidenceSchema = strictObject({
  id: nonBlankString,
  statement: nonBlankString,
  sourceIds: {
    type: "array",
    minItems: 1,
    items: nonBlankString,
  },
  verification: {
    enum: ["confirmed", "company-claimed", "preliminary", "disputed"],
  },
});

const securityActionSchema = strictObject({
  severity: { enum: ["critical", "high", "moderate", "monitor"] },
  affected: nonBlankString,
  exploitation: {
    enum: ["confirmed", "suspected", "not-observed", "not-applicable"],
  },
  action: nonBlankString,
  deadline: nullableString,
});

const storySchema = strictObject({
  id: nonBlankString,
  canonicalEventKey: nonBlankString,
  desk: { enum: DESKS },
  headline: nonBlankString,
  deck: nonBlankString,
  status: { enum: ["new-development", "material-update"] },
  priority: { enum: ["critical", "high", "notable"] },
  timing: strictObject({
    eventAt: nullableString,
    firstPublishedAt: nonBlankString,
    materiallyUpdatedAt: nullableString,
  }),
  whatHappened: nonBlankString,
  whyItMatters: nonBlankString,
  whatToDoOrWatch: nonBlankString,
  editorial: strictObject({
    primaryEntity: nonBlankString,
    aiAdjacent: { type: "boolean" },
    maturity: { const: "verified-development" },
    deskFit: nonBlankString,
  }),
  selection: strictObject({
    score: { type: "number", minimum: 70, maximum: 100 },
    selectedBecause: nonBlankString,
    materialDelta: nullableString,
  }),
  confidence: strictObject({
    level: { enum: ["high", "medium", "developing"] },
    rationale: nonBlankString,
  }),
  sources: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: sourceSchema,
  },
  evidence: {
    type: "array",
    minItems: 1,
    maxItems: 16,
    items: evidenceSchema,
  },
  // Structured Outputs requires all fields to be required. The normalizer
  // removes this field when it is null so the canonical Edition stays v2.
  securityAction: {
    anyOf: [securityActionSchema, { type: "null" }],
  },
});

const deskPageSchema = (desk) => strictObject({
  desk: { const: desk },
  story: { anyOf: [storySchema, { type: "null" }] },
  // The normalizer removes emptyReason from populated canonical desk pages.
  emptyReason: nullableString,
});

const frontPageSchema = strictObject({
  note: nonBlankString,
  estimatedMinutes: { type: "integer", minimum: 1, maximum: 6 },
  leadStoryId: nullableString,
  storyOrder: {
    type: "array",
    maxItems: 4,
    items: nonBlankString,
  },
  stopThePressesStoryId: nullableString,
  diversityException: nullableString,
});

const experimentSchema = strictObject({
  title: nonBlankString,
  goal: nonBlankString,
  steps: {
    type: "array",
    minItems: 2,
    maxItems: 5,
    items: nonBlankString,
  },
  successMeasure: nonBlankString,
  riskCheck: nonBlankString,
});

/**
 * Strict Structured Outputs schema for the model-authored portion of an
 * edition. Identity, schedule, publication state, corrections, and provenance
 * are deliberately composed by trusted local code instead of the model.
 * Watch Next is also held empty for the automatic pilot because its canonical
 * shape has no evidence/source mapping.
 */
export const EDITORIAL_OUTPUT_SCHEMA = strictObject({
  frontPage: frontPageSchema,
  desks: strictObject(Object.fromEntries(
    DESKS.map((desk) => [desk, deskPageSchema(desk)]),
  )),
  backPage: strictObject({
    tryThisTomorrow: { anyOf: [experimentSchema, { type: "null" }] },
  }),
});

export const EDITORIAL_OUTPUT_SCHEMA_NAME = "first_fold_editorial_selection_v2";
