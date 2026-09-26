// ISOLATED EXPERIMENT ONLY. This registry is reviewed repository policy, not
// model output. Never register a glossary merely because its hash matches.
import { createHash } from 'node:crypto';

const sha = text => createHash('sha256').update(text).digest('hex');
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

// Synthetic definition reference, not a news article or evidence of a real event.
export const SYNTHETIC_DEFINITION_SOURCE = [
  'Binding rules are nonoptional requirements for completed outputs, including safety rules, physical limits and task-specific requirements.',
  'The controller creates draft candidates: partial answers made before a final answer.',
  'The controller checks a route only when its alert is on; it does not check when the alert is off.',
  'Its completed output satisfies all binding rules and also stays within narrow permitted ranges.',
  'The controller may reduce travel distance; this improvement is not guaranteed.',
  'On Monday, Mira checked exactly two routes; Niko checked none.',
].join('\n');

const mitDefinitions = [
  { term: 'hard constraints', definition: 'requirements that must be met', sense: 'Requirements on generated outputs.' },
  { term: 'hard constraint', definition: 'a requirement that must be met', sense: 'A requirement on a generated output.' },
  { term: 'intermediate samples', definition: 'a model’s partial solutions during generation', sense: 'Partial solutions produced during a model’s generation process, not generation steps.' },
  { term: 'intermediate sample', definition: 'a model’s partial solution during generation', sense: 'Partial solutions produced during a model’s generation process, not generation steps.' },
];

// Only definitions are selected from the reviewed source. No article results,
// claims about the method, writer instructions or expected verdicts enter here.
// Singular/plural forms are explicit reviewed entries, not guessed stemming.
// MIT source identity: docs/checkpoints/mit-frozen-baseline.json; P2 and P12.
// This is not approval of the writer, article, model reviewer or final wording.
const manifests = freeze([
  { id: 'synthetic-generation-definitions-v1', sourceSha256: sha(SYNTHETIC_DEFINITION_SOURCE),
    definitions: [
      { term: 'binding rules', definition: 'nonoptional requirements', sense: 'Requirements for completed outputs.' },
      { term: 'binding rule', definition: 'a nonoptional requirement', sense: 'A requirement for a completed output.' },
      { term: 'draft candidates', definition: 'partial answers made before a final answer', sense: 'A controller’s generation process.' },
      { term: 'draft candidate', definition: 'a partial answer made before a final answer', sense: 'A controller’s generation process.' },
    ], evidence: [{ term: 'binding rules', passageIds: ['P1'] }, { term: 'binding rule', passageIds: ['P1'] },
      { term: 'draft candidates', passageIds: ['P2'] }, { term: 'draft candidate', passageIds: ['P2'] }] },
  { id: 'mit-generation-definitions-v1',
    sourceSha256: '081196aa0f2c507e6b75f5a7018a594af882468006401c1b1428f96e4eb74801',
    definitions: mitDefinitions, evidence: [{ term: 'hard constraints', passageIds: ['P2'] },
      { term: 'hard constraint', passageIds: ['P2'] }, { term: 'intermediate samples', passageIds: ['P12'] },
      { term: 'intermediate sample', passageIds: ['P12'] }] },
]);
const issued = new WeakSet();

export function loadDefinitionGlossary(id, capturedSource) {
  const manifest = manifests.find(item => item.id === id);
  if (!manifest || typeof capturedSource !== 'string' || capturedSource.length > 100_000 ||
      sha(capturedSource) !== manifest.sourceSha256) throw new Error('DEFINITION_GLOSSARY_BINDING');
  const glossary = freeze({ id: manifest.id, sourceSha256: manifest.sourceSha256,
    manifestSha256: sha(JSON.stringify(manifest)), definitions: manifest.definitions });
  issued.add(glossary);
  return glossary;
}

// An arbitrary object, self-reported approved flag or cloned token is not a
// registry-issued glossary. Callers cannot supply definitions or override pins.
export function assertDefinitionGlossary(glossary) {
  if (!issued.has(glossary)) throw new Error('DEFINITION_GLOSSARY_BINDING');
}
