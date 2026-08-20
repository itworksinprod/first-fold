import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [readerHtml, readerScript, readerStyles] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
]);

test("the reader offers a newer published edition without replacing the open issue", () => {
  assert.match(readerHtml, /data-new-edition-banner[^>]+hidden/);
  assert.match(readerHtml, /Today’s paper is ready/);
  assert.match(readerHtml, /data-new-edition-announcement[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(readerScript, /document\.addEventListener\("visibilitychange"/);
  assert.match(readerScript, /window\.addEventListener\("pageshow"/);
  assert.match(readerScript, /entry\?\.status === "published"/);
  assert.match(readerScript, /candidate\.status !== "published"/);
  assert.match(readerScript, /candidateDay > currentDay/);
  assert.match(readerScript, /x-first-fold-source/);
  assert.match(readerScript, /newEditionLink\.href = editionPermalink\(candidate\.id\)/);
  assert.match(readerScript, /hideNewEditionBanner\(\);\s*updateOfflineNotice\(\)/);
  assert.match(readerScript, /if \(editionLoadState === "fallback"\) \{\s*loadEditionData\(\)\.finally\(scheduleNewEditionCheck\)/);
  assert.doesNotMatch(readerScript, /(?:window\.)?location\.(?:href|assign|replace)\s*=/);
  assert.match(readerStyles, /\.new-edition-banner\[hidden\]/);
});

test("back-page actions share an immutable edition link and prefill public feedback", () => {
  assert.match(readerHtml, /data-share-edition/);
  assert.match(readerHtml, /data-send-feedback/);
  assert.match(readerHtml, /github\.com\/itworksinprod\/first-fold\/issues\/new/);
  assert.match(readerScript, /new URL\("\.\/", window\.location\.href\)/);
  assert.match(readerScript, /url\.searchParams\.set\("edition", editionId\)/);
  assert.match(readerScript, /typeof navigator\.share === "function"/);
  assert.match(readerScript, /navigator\.clipboard\?\.writeText/);
  assert.match(readerScript, /document\.execCommand\("copy"\)/);
  assert.match(readerScript, /What worked well\?/);
  assert.match(readerScript, /What could be better\?/);
  assert.match(readerHtml, /data-share-status[^>]+role="status"[^>]+aria-live="polite"/);
});

test("publication state, lead story, and story count come from the hydrated edition", () => {
  assert.doesNotMatch(readerHtml, /Source-verified demo edition|Human-reviewed|Demo edition/);
  assert.match(readerHtml, /data-edition-publication-status>Checking edition status/);
  assert.match(readerScript, /draft: "Local draft · Not published"/);
  assert.match(readerScript, /validated: "Validated draft · Awaiting publication"/);
  assert.match(readerScript, /published: "Source-verified edition · Published"/);
  assert.match(readerScript, /demoRibbon\.dataset\.publicationStatus = displayStatus/);
  assert.match(readerStyles, /\.demo-ribbon\[data-publication-status="draft"\]/);
  assert.match(readerScript, /data\.status === "published"[\s\S]+New York · Local preview/);
  assert.match(readerScript, /data-back-issue[\s\S]+publicationStatusLabels\[displayStatus\]/);
  assert.match(readerHtml, /data-rail-delivery-copy>Morning delivery · 6:00 AM ET/);
  assert.match(readerScript, /In the press room · local preview/);
  assert.match(readerHtml, /data-method-status><strong>For this edition:/);
  assert.match(readerScript, /local draft has not passed the exact-revision approval or publication gate/);
  assert.match(readerHtml, /weekdays during the pilot/);
  assert.match(readerHtml, /Next First Fold lands at/);
  assert.match(readerHtml, /The signals that could materially change these stories next\./);
  assert.doesNotMatch(readerHtml, /not yet strong enough to take a desk|America\/New_York · every day/);

  assert.doesNotMatch(readerHtml, /front-story-lead/);
  assert.doesNotMatch(readerStyles, /\.front-story-lead/);
  assert.match(readerScript, /classList\.toggle\("is-edition-lead", isLead\)/);
  assert.match(readerScript, /isLead \? ", lead story" : ""/);
  assert.match(readerStyles, /\.front-story\.is-edition-lead::after/);

  assert.match(readerHtml, /data-front-story-count[^>]+aria-hidden="true"><\/span>/);
  assert.match(readerScript, /data\.desks\.filter\(\(desk\) => desk\.state === "story"\)\.length/);
});
