import assert from "node:assert/strict";
import test from "node:test";
import { assertReaderProse, readerProseErrors } from "../scripts/reader-prose.mjs";
import { groundedDraft } from "./fixtures/grounded-summary.mjs";
import { malformedEmailStories } from "./fixtures/malformed-email-2026-09-11.mjs";

test("the exact delivered JSON spillover fails even inside a valid outer JSON string", () => {
  const roundTripped = JSON.parse(JSON.stringify(malformedEmailStories));
  for (const story of roundTripped) {
    for (const field of ["whyItMatters", "whatToDoOrWatch"]) {
      const errors = readerProseErrors(story[field], { paragraph: true });
      assert.ok(errors.includes("READER_PROSE_SCHEMA_FRAGMENT"), `${story.id}.${field}`);
      assert.throws(() => assertReaderProse(story[field], { paragraph: true }), /Reader-facing copy failed/);
    }
  }
});

test("the exact delivered unmatched quote is rejected without pretending to repair it", () => {
  const damaged = malformedEmailStories[0].whatHappened;
  assert.ok(readerProseErrors(damaged, { paragraph: true }).includes("READER_PROSE_UNBALANCED_QUOTE"));
  assert.equal(damaged, malformedEmailStories[0].whatHappened);
});

test("copy integrity does not claim to establish factual support", () => {
  // The omitted Secure Boot prerequisite in this syntactically sound claim
  // belongs to the separate evidence/condition gate, not a punctuation check.
  assert.deepEqual(readerProseErrors(malformedEmailStories[1].whatHappened, { paragraph: true }), []);
});

test("straight and smart-quoted keys, nested tails and bare schema fields are blocked", () => {
  for (const text of [
    'A complete thought.\", \"whatToDoOrWatch\": \"Another field.',
    "A complete thought.”, ‘whyItMatters’: ‘Another field.",
    'A complete thought. \\"whyItMatters\\": \\"Another field.',
    "A complete thought. &quot;whyItMatters&quot;: &quot;Another field.",
    "A complete thought. &#8220;whatToDoOrWatch&#8221;: &#8220;Another field.",
    'A complete thought. "customField": "Unwanted generated data."',
    "A complete thought. whatToDoOrWatch: Another field.",
    "A complete thought. }]}]}",
    "A complete thought. [{",
    "```json\nA complete thought.\n```",
  ]) assert.ok(readerProseErrors(text).length > 0, text);
});

test("paragraph endings reject truncation and obvious dangling conjunctions", () => {
  for (const text of [
    "The issue affects systems running the driver",
    "The finding could bypass security and",
    "The finding could bypass security and.",
    "Check the driver because.",
    "Details are available such as.",
    "The advisory ends here...",
    "The advisory ends here…",
    "The advice ends with a colon:",
  ]) assert.ok(readerProseErrors(text, { paragraph: true }).length > 0, text);
  assert.deepEqual(readerProseErrors("New driver advisory"), []);
  assert.deepEqual(readerProseErrors("A development to watch: model access"), []);
});

test("normal technical prose, decimals, filenames, possessives and quoted prose remain valid", () => {
  const accepted = [
    "The advisory covers version 8.4.0 and the amwrtdrv.sys driver.",
    "The price fell 3.8 percent, according to the publisher's update.",
    "JetBrains' announcement covers Junie and Google's model.",
    "Readers’ devices may need an update, according to the vendor’s advisory.",
    'The JSON document contains a "whyItMatters" field.',
    "The whyItMatters field is missing from the example JSON document.",
    'The release is described as "ready for testing."',
    "The publisher said ‘the update is ready.’",
    "The vendor called it a 'safe update.'",
    "The phrase 'affected systems' appears in the notice.",
    'The notes describe "version 3" as affected.',
    "The product was released in '26.",
    "It is a 6\" display with a revised driver.",
    'The display measures 6".',
    "This is the version the advisory refers to.",
    "The report says this is why.",
    "Read the applicable advisory (including its caveats).",
    ...groundedDraft.claims.map((claim) => claim.text),
    groundedDraft.whyItMatters,
    groundedDraft.whatToDoOrWatch,
  ];
  for (const text of accepted) {
    assert.deepEqual(readerProseErrors(text, { paragraph: true }), [], text);
    assert.equal(assertReaderProse(text, { paragraph: true }), text);
  }
});

test("headline fragments and escaped source markup keep their separate rendering policy", () => {
  assert.deepEqual(readerProseErrors(groundedDraft.headline), []);
  assert.deepEqual(readerProseErrors('Source title contains <img src="x">'), []);
});

test("invalid inputs use stable reason codes and never get silently coerced", () => {
  for (const input of [null, undefined, {}, [], 0]) assert.deepEqual(readerProseErrors(input), ["READER_PROSE_TYPE"]);
  for (const input of ["", " ", "\n"]) assert.deepEqual(readerProseErrors(input), ["READER_PROSE_EMPTY"]);
  assert.deepEqual(readerProseErrors('Short copy, "whyItMatters": "more'), ["READER_PROSE_SCHEMA_FRAGMENT"]);
});

test("internal evidence citation syntax is not reader copy, while ordinary part names remain valid", () => {
  for (const copy of [
    "The advisory describes affected systems (S1P2, S1P3).",
    "The advisory describes affected systems [S2P15].",
    "The model adds a shortcut (evidence: S1P14).",
    "The app is now available; source ID: S1P2.",
  ]) assert.deepEqual(readerProseErrors(copy, { paragraph: true }), ["READER_PROSE_INTERNAL_CITATION"], copy);
  for (const copy of [
    "The S1P2 controller receives a firmware update.",
    "The guide lists the S2P15 part number.",
    "Model S1P2 now supports JSON output.",
  ]) assert.deepEqual(readerProseErrors(copy, { paragraph: true }), [], copy);
});
