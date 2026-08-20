import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [archiveHtml, archiveScript, readerStyles] = await Promise.all([
  readFile(new URL("../archive/index.html", import.meta.url), "utf8"),
  readFile(new URL("../archive.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
]);

test("local archive previews label unpublished editions without weakening production copy", () => {
  assert.match(archiveHtml, /data-archive-scope>Published issues/);
  assert.match(archiveScript, /edition\.status !== "published"/);
  assert.match(archiveScript, /Local review archive/);
  assert.match(archiveScript, /unpublished/);
  assert.match(archiveScript, /Review this draft →/);
  assert.match(archiveScript, /quietDeskCount === 1 \? "quiet desk" : "quiet desks"/);
  assert.match(readerStyles, /\.archive-card\.is-unpublished/);
});
