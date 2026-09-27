// Style containment for an opt-in experiment. This never certifies semantics.
import {createHash} from 'node:crypto';
import {buildDefinitionContext} from './definition-context.mjs';
import {CONTEXT_EDITOR_PROMPT} from './context-editor-profile.mjs';

const issued = new WeakMap();
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = reason => Object.assign(new Error(`DIRECT_DEFINITION_${reason}`), {code: `DIRECT_DEFINITION_${reason}`});
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const DIRECT_DEFINITION_PROMPT = CONTEXT_EDITOR_PROMPT + `
The directEditPlan is a fixed edit boundary: return each locked unit byte-for-byte unchanged. Only units listed in editableUnits may change.
For a changed editable unit, directly express every listed technical concept in ordinary language using its reviewed definition and sense. Do not retain the technical label and append a definition, in either order. Do not introduce a parenthetical or bracketed aside.
Preserve the entire sentence's facts, grammatical relationships, qualifications and scope while integrating the plain expression. Do not add any glossary label absent from the original unit.
If no direct equivalent preserves complete meaning and reads naturally, keep that original unit unchanged. A style-boundary pass is not approval: all source and meaning checks and independent readability review still apply.`;

export function buildDirectDefinitionPlan(catalog, glossary) {
  const units = catalog?.data?.units;
  if (!Array.isArray(units) || !units.length || !/^[a-f0-9]{64}$/u.test(catalog.data.baselineSha256 ?? '')) throw fail('INPUT');
  const editableUnits = [], lockedUnitIds = [];
  for (const unit of units) {
    const definitions = buildDefinitionContext([unit.text], glossary).definitions;
    if (definitions.length) editableUnits.push({unitId: unit.unitId, terms: definitions.map(d => d.term)});
    else lockedUnitIds.push(unit.unitId);
  }
  const plan = freeze({policy: 'direct-definitions-v1', baselineSha256: catalog.data.baselineSha256,
    editableUnits, lockedUnitIds});
  issued.set(plan, {catalogHash: sha(catalog.data), glossary, units: structuredClone(units)});
  return plan;
}

// Called only AFTER applySentenceRewrite has established shape/order/binding.
export function validateDirectDefinitionEdits(proposal, catalog, plan) {
  const bound = issued.get(plan);
  if (!bound || sha(catalog?.data) !== bound.catalogHash) throw fail('BINDING');
  if (!Array.isArray(proposal?.sentences) || proposal.sentences.length !== bound.units.length) throw fail('SHAPE');
  for (const [index, before] of bound.units.entries()) {
    const after = proposal.sentences[index];
    if (after?.unitId !== before.unitId || typeof after.text !== 'string') throw fail('SHAPE');
    if (after.text === before.text) continue;
    if (plan.lockedUnitIds.includes(before.unitId)) throw fail('LOCKED_UNIT');
    const asides = text => text.match(/\([^)]*\)|\[[^\]]*\]/gu) ?? [];
    const oldAsides = asides(before.text);
    for (const aside of asides(after.text)) {
      const at = oldAsides.indexOf(aside);
      if (at < 0) throw fail('ADDED_ASIDE');
      oldAsides.splice(at, 1);
    }
    // Reject unbalanced/new delimiters too, not just well-formed parentheses.
    for (const delimiter of ['(', ')', '[', ']']) {
      if (after.text.split(delimiter).length > before.text.split(delimiter).length) throw fail('ADDED_ASIDE');
    }
    if (buildDefinitionContext([after.text], bound.glossary).definitions.length) throw fail('RETAINED_LABEL');
  }
  return true;
}
