import test from "node:test";
import assert from "node:assert/strict";
import { assertCopyeditQualifications } from "../scripts/automation/free/copyedit-qualification-guard.mjs";

const fields = ["headline", "whatHappened", "whyItMatters", "whatToWatch"];
const copy = (overrides = {}) => ({
  headline: ["The tile rests."],
  whatHappened: ["The block turns."],
  whyItMatters: ["The panel moves."],
  whatToWatch: ["The latch closes."],
  ...overrides,
});
const qualificationError = {
  message: "FACT_SUMMARY_COPYEDIT_QUALIFICATION",
  code: "FACT_SUMMARY_COPYEDIT_QUALIFICATION",
};

test("matching qualifier signatures accept cue reordering and normalized contractions", () => {
  const pairs = [
    ["The tile might move more than the block.", "More than the block, the tile might move."],
    ["The tile can't move.", "The tile cannot move."],
    ["The tile can’t move.", "The tile cannot move."],
    ["The panel WON’T rotate.", "The panel will not rotate."],
    ["The panel couldn’t rotate.", "The panel could not rotate."],
    ["The tile doesn‘t move.", "The tile does not move."],
    ["The tile ＭＡＹ move.", "The tile may move."],
  ];
  for (const field of fields) {
    for (const [before, after] of pairs) {
      assert.equal(assertCopyeditQualifications(copy({ [field]: [before] }), copy({ [field]: [after] })),
        true, `${field}: ${before} -> ${after}`);
    }
  }
});

test("changed degree, modal, negation, and repeated cue counts trigger a lexical hold", () => {
  const pairs = [
    ["The tile moves more.", "The tile moves less."],
    ["The tile is better.", "The tile is best."],
    ["The tile may move.", "The tile will move."],
    ["The tile could move.", "The tile can move."],
    ["The tile is not blue.", "The tile is blue."],
    ["The tile can't move.", "The tile can move."],
    ["The tile won’t move.", "The tile will move."],
    ["The tile doesn’t move.", "The tile does move."],
    ["The tile may move and may turn.", "The tile may move and turn."],
  ];
  for (const field of fields) {
    for (const [before, after] of pairs) {
      assert.throws(() => assertCopyeditQualifications(copy({ [field]: [before] }), copy({ [field]: [after] })),
        qualificationError, `${field}: ${before} -> ${after}`);
    }
  }
});

test("qualifiers cannot move between units or fields even when the total signature is unchanged", () => {
  for (const field of fields) {
    assert.throws(() => assertCopyeditQualifications(
      copy({ [field]: ["The tile may move.", "The block rests."] }),
      copy({ [field]: ["The tile moves.", "The block may rest."] }),
    ), qualificationError, field);
  }
  assert.throws(() => assertCopyeditQualifications(
    copy({ headline: ["The tile may move."], whatHappened: ["The block rests."] }),
    copy({ headline: ["The tile moves."], whatHappened: ["The block may rest."] }),
  ), qualificationError);
});

test("passing lexical cues is NOT semantic qualification: changed subject, scope, and cause can pass", () => {
  const pairs = [
    ["subject", "The tile may move.", "The block may move."],
    ["scope", "Every tile may move.", "One tile may move."],
    ["cause", "The tile may move because the block turns.", "The block may turn because the tile moves."],
  ];
  // These edits change meaning despite equal cue signatures; manual before/after review remains necessary.
  for (const [change, before, after] of pairs) {
    assert.equal(assertCopyeditQualifications(copy({ whatHappened: [before] }), copy({ whatHappened: [after] })),
      true, `A changed ${change} can pass this lexical guard without preserving meaning`);
  }
});
