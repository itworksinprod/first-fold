import assert from "node:assert/strict";
import test from "node:test";
import { readerSummaryErrors } from "../scripts/reader-summary.mjs";
import { groundedDraft } from "./fixtures/grounded-summary.mjs";
test("summaries reject unresolved quote headlines and source-lead filler without inventing missing facts", () => {
  assert.deepEqual(readerSummaryErrors(groundedDraft), []);
  assert.deepEqual(readerSummaryErrors({ headline: 'The Verge reports “And we don’t feel pressure on that”' }),
    ["SUMMARY_UNRESOLVED_HEADLINE"]);
  assert.deepEqual(readerSummaryErrors({ whyItMatters: "Treat this as a source lead, not a full summary." }),
    ["SUMMARY_GENERIC_FILLER"]);
  assert.deepEqual(readerSummaryErrors({ headline: "Altman argues against an OpenAI IPO this year" }), []);
});
