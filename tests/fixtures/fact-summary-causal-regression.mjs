// Human-labelled negative from live run 35813841200. The live reviewer wrongly
// accepted the full sentence. A fixture is a test case, not proof of remediation.
export const factSummaryCausalRegression = Object.freeze({
  caseId: 'automation-rating-errors-do-not-establish-development-harm',
  expectedSupported: false,
  statement: 'The potential for shared errors between Anthropic\'s systems and evaluator models to impact AI R&D automation ratings, which could limit the accuracy of these ratings and hinder the development of more autonomous AI systems.',
  rationale: 'The source supports uncertainty in automation measurement, not a causal effect on development of autonomous systems. Hypothetical wording does not supply missing evidence.',
  sourceUrl: 'https://www.anthropic.com/institute/measuring-pace-of-ai-development',
  sourceRunId: '35813841200',
  draftSha256: 'aa3d12c7d4d662c2e61cb11a899dfe0b964862e38db1393295b3fb62935a46fa',
  observedAutomatedVerdict: true,
});
