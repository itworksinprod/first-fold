// Manual decomposition for a fixed evaluation, not a general decomposition engine.
// Original statements, source context, and expected overall verdicts stay unchanged.
export function claimwiseReviewCases(original) {
  if (!Array.isArray(original) || original.length !== 8) throw new Error('CLAIMWISE_CASES');
  const parts = [
    [
      ["Shared errors between Anthropic's systems and evaluator models could affect the accuracy of AI R&D automation ratings.", true],
      ['Those shared errors could hinder the development of more autonomous AI systems.', false],
    ],
    [[original[1].input.text, true]],
    [
      ['Anthropic identifies possible errors in its automation ratings.', true],
      ['Those rating errors may slow progress toward models that conduct research without human supervision.', false],
    ],
    [[original[3].input.text, true]],
    [
      ['Compute share is an imperfect measure of safety effort.', true],
      ['The reason compute share imperfectly measures safety effort is the use of different denominators for the two percentages.', false],
    ],
    [[original[5].input.text, true]],
    [
      ['Harbor reports inaccurate vehicle counts in rain.', true],
      ['The inaccurate vehicle counts could increase journey times for drivers.', false],
    ],
    [
      ['Harbor says its sensor can undercount vehicles in wet weather.', true],
      ['Harbor has not measured an effect on journey times.', true],
    ],
  ];
  const cases = original.map((c, i) => ({ ...structuredClone(c),
    input: { ...structuredClone(c.input), claims: parts[i].map(p => p[0]) }, expectedClaims: parts[i].map(p => p[1]) }));
  const sources = [{ publisher: 'Synthetic Cedar Research', passages: [
    { evidenceId: 'S1P1', text: 'Cedar tested a dashboard with volunteer analysts. A delayed display caused some alerts to appear after the event had ended.' },
    { evidenceId: 'S1P2', text: 'The experiment measured display latency only. It did not measure analyst productivity, staffing needs, or patient outcomes.' },
  ] }];
  for (const [caseId, claims, expectedClaims] of [
    ['unseen-display-latency', ['Cedar says a delayed display caused some alerts to appear after events ended.', 'The experiment did not measure analyst productivity.'], [true, true]],
    ['unseen-display-productivity', ['Cedar says a delayed display caused some alerts to appear after events ended.', 'That delay could require hiring additional analysts.'], [true, false]],
  ]) cases.push({ caseId, input: { text: claims.join(' '), sources: structuredClone(sources), claims }, expected: expectedClaims.every(Boolean), expectedClaims });
  return cases;
}
