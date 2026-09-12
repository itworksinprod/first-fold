import assert from "node:assert/strict";
import test from "node:test";
import {
  hasValidWebSearchResearchMethod,
  isValidWebSearchReceipt,
  researchMethodForWebSearch,
} from "../scripts/automation/free/search-receipt.mjs";

const receipt = {
  provider: "tavily", queriesUsed: 12, creditsReserved: 24, admittedArticles: 24,
};

test("web discovery receipts preserve bounded reservations without claiming billing", () => {
  assert.equal(isValidWebSearchReceipt(receipt), true);
  assert.equal(isValidWebSearchReceipt({
    ...receipt, queriesUsed: 1, creditsReserved: 2, admittedArticles: 0,
  }), true);
  for (const invalid of [
    null, undefined, [], "tavily", {},
    { ...receipt, provider: "other" },
    { ...receipt, queriesUsed: 0, creditsReserved: 0 },
    { ...receipt, queriesUsed: 13, creditsReserved: 26 },
    { ...receipt, queriesUsed: 1.5, creditsReserved: 3 },
    { ...receipt, queriesUsed: "12" },
    { ...receipt, creditsReserved: 23 },
    { ...receipt, creditsReserved: NaN },
    { ...receipt, admittedArticles: -1 },
    { ...receipt, admittedArticles: 25 },
    { ...receipt, admittedArticles: 2.5 },
    { ...receipt, admittedArticles: "24" },
    { ...receipt, status: "success" },
    { ...receipt, creditsUsed: 24 },
    { ...receipt, apiKey: "must-not-appear-in-provenance" },
  ]) assert.equal(isValidWebSearchReceipt(invalid), false);
});

test("web discovery method requires a valid matching receipt and keeps feeds-only compatibility", () => {
  const combined = "curated-live-feeds-and-web-search";
  const feeds = "curated-live-feeds";
  assert.equal(researchMethodForWebSearch(receipt), combined);
  assert.equal(researchMethodForWebSearch(undefined), feeds);
  assert.equal(hasValidWebSearchResearchMethod({ researchMethod: feeds }), true);
  assert.equal(hasValidWebSearchResearchMethod({ researchMethod: combined, webSearch: receipt }), true);
  assert.equal(hasValidWebSearchResearchMethod({
    researchMethod: feeds, webSearch: { ...receipt, admittedArticles: 0 },
  }), true);
  for (const invalid of [
    undefined, null, {},
    { researchMethod: combined },
    { researchMethod: feeds, webSearch: undefined },
    { researchMethod: feeds, webSearch: receipt },
    { researchMethod: combined, webSearch: { ...receipt, admittedArticles: 0 } },
    { researchMethod: combined, webSearch: { ...receipt, creditsReserved: 0 } },
  ]) assert.equal(hasValidWebSearchResearchMethod(invalid), false);
});
