const RECEIPT_KEYS = Object.freeze([
  "provider", "queriesUsed", "creditsReserved", "admittedArticles",
]);

/**
 * A bounded discovery receipt, not a provider invoice or an editorial verdict.
 * Every attempted advanced search reserves two credits, including failed calls.
 */
export function isValidWebSearchReceipt(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === RECEIPT_KEYS.length &&
    RECEIPT_KEYS.every((key) => Object.hasOwn(value, key)) &&
    value.provider === "tavily" &&
    Number.isInteger(value.queriesUsed) && value.queriesUsed >= 1 && value.queriesUsed <= 12 &&
    Number.isInteger(value.creditsReserved) && value.creditsReserved === value.queriesUsed * 2 &&
    Number.isInteger(value.admittedArticles) &&
    value.admittedArticles >= 0 && value.admittedArticles <= 24;
}

export function researchMethodForWebSearch(receipt) {
  return receipt?.admittedArticles > 0
    ? "curated-live-feeds-and-web-search"
    : "curated-live-feeds";
}

export function hasValidWebSearchResearchMethod(research) {
  return research !== null && typeof research === "object" &&
    (!Object.hasOwn(research, "webSearch") || isValidWebSearchReceipt(research.webSearch)) &&
    research.researchMethod === researchMethodForWebSearch(research.webSearch);
}
