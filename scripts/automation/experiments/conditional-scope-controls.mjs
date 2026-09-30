// Predeclared synthetic development controls. Not articles or unseen holdouts.
// Expected labels/rationales stay local; send only a separately built review view.
import {createHash} from 'node:crypto';

const pairs = [
  {
    category: 'conditional-advice',
    source: [
      'The Cedar maintenance bulletin instructs owners of outdoor sensors with cracked seals to replace the seals before winter.',
      "Indoor sensors are outside the bulletin's scope. Seals without cracks do not need replacement.",
    ],
    faithful: 'Cedar advises replacing the seals before winter on outdoor sensors with cracked seals.',
    changed: 'Cedar advises replacing the seals before winter on every sensor.',
    reason: 'Every sensor expands advice limited to outdoor sensors with cracked seals; indoor and intact sensors are excluded.',
  },
  {
    category: 'genuine-universal',
    source: ['Every badge issued by Lumen expires at midnight on 30 April. No badge is exempt.'],
    faithful: 'All Lumen badges expire at midnight on 30 April.',
    changed: 'Only visitor badges issued by Lumen expire at midnight on 30 April.',
    reason: 'The source establishes universal expiry but never establishes visitor-only eligibility; this exclusivity is unsupported, not proof that other badge types exist.',
  },
  {
    category: 'separate-exception',
    source: [
      'Archive members must reserve a desk before each visit.',
      'Members under sixteen are exempt from this rule.',
    ],
    faithful: 'Archive members aged at least sixteen must reserve a desk before each visit.',
    changed: 'Archive members must reserve a desk before each visit.',
    reason: 'The copied opening rule omits the separate under-sixteen exemption; all passages must be read together.',
  },
  {
    category: 'necessary-not-sufficient',
    source: [
      'The lift can operate only if its safety latch is engaged.',
      'An engaged latch alone is insufficient because a power check must also pass.',
    ],
    faithful: 'An engaged safety latch is required for the lift to operate.',
    changed: 'An engaged safety latch guarantees that the lift can operate.',
    reason: 'A required condition is not sufficient; the separate power-check requirement rules out the guarantee.',
  },
  {
    category: 'geographic-applicability',
    source: [
      'The Harbor notice requires a permit for night deliveries in the East district.',
      'The West district is excluded.',
    ],
    faithful: "Night deliveries in Harbor's East district require a permit.",
    changed: 'Night deliveries throughout Harbor require a permit.',
    reason: 'Throughout Harbor includes the explicitly excluded West district.',
  },
  {
    category: 'universal-within-cohort',
    source: [
      'The Willow trial included printed samples and digital samples.',
      'All printed samples were inspected before storage.',
      'The digital samples were not inspected.',
    ],
    faithful: 'Every printed sample in the Willow trial was inspected before storage.',
    changed: 'Every sample in the Willow trial was inspected before storage.',
    reason: 'Dropping printed expands the inspected cohort to digital samples that were explicitly not inspected.',
  },
  {
    category: 'rule-not-observation',
    source: [
      'Under the Meridian rule any container exceeding the weight limit is rejected.',
      'The notice does not report whether any containers exceeded the limit.',
    ],
    faithful: "Meridian's rule rejects containers that exceed the weight limit.",
    changed: 'Meridian rejected overweight containers under its rule.',
    reason: 'A conditional rejection rule does not establish that any overweight containers or actual rejections were observed.',
  },
  {
    category: 'temporal-eligibility',
    source: [
      "Every book borrowed during the library's July pilot receives the loan extension.",
      "The library's loan extension applies only to books borrowed during the July pilot.",
      'Earlier loans keep their original due dates.',
    ],
    faithful: "Books borrowed during the library's July pilot receive the loan extension.",
    changed: "The library's loan extension covers books borrowed before the July pilot.",
    reason: 'Before-pilot loans are outside the eligible borrowing period and explicitly retain their original due dates.',
  },
];

const freeze = x => {
  if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); }
  return x;
};
export const CONDITIONAL_SCOPE_CONTROLS = freeze(pairs.flatMap((p, i) => [true, false].map((faithful, j) => ({
  id: `CS${String(i * 2 + j + 1).padStart(2, '0')}`,
  category: p.category,
  expectedVerdicts: [faithful ? 'supported' : 'unsupported'],
  rationale: faithful ? 'The claim preserves the source population, conditions, exclusions and type of assertion.' : p.reason,
  input: {
    text: faithful ? p.faithful : p.changed,
    sources: [{publisher: 'Fictional scope-calibration source',
      passages: p.source.map((text, n) => ({evidenceId: `S1P${n + 1}`, text}))}],
  },
}))));
export const CONDITIONAL_SCOPE_CONTROLSET_SHA256 = createHash('sha256')
  .update(JSON.stringify(CONDITIONAL_SCOPE_CONTROLS)).digest('hex');
