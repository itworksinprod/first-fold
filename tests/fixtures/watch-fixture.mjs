import {significanceFixture} from './significance-fixture.mjs';
import {buildWatchPlan} from '../../scripts/automation/experiments/watch-question.mjs';
export function watchFixture() {
  const {packet} = significanceFixture();
  const plan = buildWatchPlan(packet);
  const proposal = {baselineSha256: plan.data.baselineSha256, decision: 'add',
    question: 'Could further experiments show whether the same balance between requirements and answer quality holds under different test conditions?'};
  return {packet, plan, proposal};
}
