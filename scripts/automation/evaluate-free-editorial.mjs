#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { groundedDossiers, validateGroundedStory } from "./free/grounded-draft.mjs";
import { assertRenderedPersonalEmailCopy } from "./personal-email.mjs";
import { countReaderFacingStoryWords } from "../edition-content.mjs";
import {
  buildFreeEditorialBaselines, buildFreeEditorialEvalCases,
  FREE_EDITORIAL_EVAL_FIXTURE_VERSION, FREE_EDITORIAL_HUMAN_REVIEW_CHECKLIST,
} from "../../tests/fixtures/free-editorial-evals.mjs";

const escapeHtml = value => value.replace(/[&<>"']/gu, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

// This exercises the final copy-integrity gate, not the full candidate/source
// validation or email delivery contract. Those retain their integration tests.
function renderedCopyFixture() {
  const entries = buildFreeEditorialBaselines();
  const candidate = {
    status: "validated", publication: { publishedAt: null },
    masthead: { name: "First Fold — SYNTHETIC EVALUATION", tagline: "Offline fixtures, not current news." },
    frontPage: { note: "Synthetic drafts across all desks for local copy-integrity evaluation only.", estimatedMinutes: 5 },
    provenance: { personalFreeResearch: { draftingMode: "source-grounded-summary",
      provider: "cloudflare-workers-ai", inference: "workers-ai" } },
    desks: Object.fromEntries(entries.map(({ candidate: selected, draft, desk, id }) => [desk, {
      story: { id, headline: draft.headline, deck: draft.deck,
        whatHappened: draft.claims.map(({ text }) => text).join(" "),
        whyItMatters: draft.whyItMatters, whatToDoOrWatch: draft.whatToDoOrWatch,
        sources: selected.sources,
        evidence: draft.claims.map((_claim, index) => ({ id: `${id}-grounded-${index}`,
          sourceIds: [selected.sources[0].id] })),
      }, emptyReason: null,
    }])),
  };
  const lines = [candidate.masthead.name, candidate.masthead.tagline, candidate.frontPage.note];
  for (const { story } of Object.values(candidate.desks)) {
    lines.push(story.headline, story.deck, story.whatHappened, story.whyItMatters, story.whatToDoOrWatch);
    lines.push(...story.sources.map(source => `${source.publisher} — ${source.title}`));
  }
  return { candidate, rendered: {
    subject: "First Fold — synthetic offline copy test",
    html: `<!doctype html><html><body>${lines.map(line => `<p>${escapeHtml(line)}</p>`).join("\n")}</body></html>`,
    text: [lines[0].toUpperCase(), ...lines.slice(1)].join("\n"),
  } };
}

function evaluateRenderedCopy() {
  const baseline = renderedCopyFixture();
  const variants = [
    { id: "accept-clean-rendered-copy", expected: "accept", mutate: () => {} },
    { id: "reject-rendered-html-truncation", expected: "reject", mutate: rendered => {
      rendered.html = rendered.html.replace(escapeHtml(baseline.candidate.desks.ai.story.whatHappened), "A truncated replacement");
    } },
    { id: "reject-rendered-text-spillover", expected: "reject", mutate: rendered => {
      rendered.text += '\n“whyItMatters”: “Serialized model output.”';
    } },
    { id: "reject-rendered-encoded-spillover", expected: "reject", mutate: rendered => {
      rendered.html = rendered.html.replace("</body>", '<p>&quot;stories&quot;: [{</p></body>');
    } },
  ];
  return variants.map(({ id, expected, mutate }) => {
    const rendered = structuredClone(baseline.rendered);
    mutate(rendered);
    let accepted = false;
    try { accepted = assertRenderedPersonalEmailCopy(baseline.candidate, rendered); } catch { /* Safe named diagnostic below. */ }
    return { id, expected, observed: accepted ? "accept" : "reject",
      codes: accepted ? [] : ["RENDERED_COPY_GATE"], matched: accepted === (expected === "accept") };
  });
}

/** Purely offline synthetic contract checks; no search, inference, or email call.
 * Passing these fixtures measures regression coverage, never model accuracy. */
export function evaluateFreeEditorial() {
  const cases = buildFreeEditorialEvalCases().map(({ id, desk, candidate, draft, expected, expectedCodes, purpose }) => {
    const codes = [];
    const dossier = groundedDossiers([candidate])[0];
    const accepted = validateGroundedStory(draft, dossier, code => codes.push(code));
    const observed = accepted ? "accept" : "reject";
    return { id, desk, purpose, expected, observed, codes,
      matched: expected === observed && (accepted || codes.some(code => expectedCodes.includes(code))),
      bodyWords: countReaderFacingStoryWords({ ...draft, whatHappened: draft.claims.map(({ text }) => text).join(" ") }),
    };
  });
  const renderedCopyCases = evaluateRenderedCopy();
  const mismatches = [...cases, ...renderedCopyCases].filter(result => !result.matched).map(({ id }) => id);
  return {
    fixtureVersion: FREE_EDITORIAL_EVAL_FIXTURE_VERSION,
    mode: "offline-synthetic-regression-evaluation",
    networkRequests: 0, modelInvocations: 0, emailRequests: 0,
    summary: {
      draftCases: cases.length,
      acceptedDrafts: cases.filter(result => result.observed === "accept").length,
      rejectedDrafts: cases.filter(result => result.observed === "reject").length,
      renderedCopyCases: renderedCopyCases.length,
      acceptedRenderedCopies: renderedCopyCases.filter(result => result.observed === "accept").length,
      rejectedRenderedCopies: renderedCopyCases.filter(result => result.observed === "reject").length,
      expectationMismatches: mismatches.length,
    },
    passed: mismatches.length === 0, mismatches, cases, renderedCopyCases,
    limitations: [
      "These authored synthetic examples measure deterministic contract coverage, not live model quality or paid-model parity.",
      "Numeric passage anchoring catches a misplaced supported number; it does not prove arbitrary natural-language entailment.",
      "Source importance, breadth, freshness, desk fit, and missed stories still require live evaluation and human feedback.",
      "Rendered checks exercise copy integrity; delivery, source authenticity, and full candidate validation have separate integration tests.",
    ],
    humanReviewChecklist: [...FREE_EDITORIAL_HUMAN_REVIEW_CHECKLIST],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = evaluateFreeEditorial();
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
