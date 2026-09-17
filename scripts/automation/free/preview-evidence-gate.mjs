// Conservative preview-only holds, not proof that a source is inaccurate.
// Do not infer original publication dates from URL paths alone.
import { createHash } from "node:crypto";
export function intactAdvisoryContext(source) {
  const c = source?.structuredContext;
  return c?.kind === "cisa-csaf-complete-v1" && typeof source.text === "string" && source.text.length <= 18_000 &&
    Array.isArray(source.passages) && source.passages.map(p => p.text).join("\n") === source.text &&
    createHash("sha256").update(source.text).digest("hex") === c.textSha256 &&
    Array.isArray(c.ranges) && c.ranges.length > 0 && c.ranges.length <= 50 &&
    c.ranges.every(range => typeof range === "string" && / vers:intdot\/<\d+(?:\.\d+)+ \(CVE-\d{4}-\d+\)$/.test(range) && source.text.includes(range));
}
export function previewSourceIntegrityHolds(dossier) {
  const holds = new Set();
  for (const source of dossier?.sources ?? []) {
    const texts = [source.text, ...(source.passages ?? []).map(p => p.text)].filter(t => typeof t === "string");
    // Narrow, conservative alarms for observed feed/extraction failures. These
    // are NOT an extraction repair or a general test of factual completeness.
    const intact = intactAdvisoryContext(source);
    if ((!intact && texts.some(t => /vers:intdot\//iu.test(t))) || texts.some(t => /\bUpdate to V\d*\s*$|\b(?:obtain|install|download|update)[^.?!]*\b(?:the latest|the|to|and|version|release)\s*$/iu.test(t))) {
      holds.add("EVIDENCE_EXTRACTION_INCOMPLETE");
    }
    if ((!intact && texts.some(t => /Countries\/Areas Deployed:/iu.test(t))) || texts.some(t => /CVSS\s+Vendor\s+Equipment\s+Vulnerabilities/iu.test(t))) {
      holds.add("ADVISORY_STRUCTURE_REVIEW");
    }
  }
  return [...holds];
}

export function previewEvidenceHolds(candidate, dossier, reportingWindow, { requireStructured = false } = {}) {
  const holds = new Set();
  if (!candidate || candidate.ranking?.score < 70 || !Number.isFinite(candidate.ranking?.score) ||
      !["authoritative-single", "corroborated"].includes(candidate.ranking?.evidenceTier) ||
      !Array.isArray(dossier?.sources) || candidate.candidateId !== dossier.candidateId) return ["SELECTION_INVALID"];
  if (!dossier.sources.length) holds.add("EVIDENCE_INCOMPLETE");
  const start = Date.parse(reportingWindow?.startInclusive), end = Date.parse(reportingWindow?.endExclusive);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return ["WINDOW_INVALID"];
  if (requireStructured) {
    for (const record of candidate.feedEvidence ?? []) {
      if (!["structured-preview-v1", "structured-advisory-preview-v1"].includes(record.articleExtraction?.version) || record.articleExtraction.status !== "usable" ||
          record.articleExtraction.holds?.length || !record.articleBlocks?.length) {
        holds.add("USABLE_STRUCTURED_ARTICLE_REQUIRED");
        for (const reason of record.articleExtraction?.holds ?? []) holds.add(reason);
      }
      const identity = record.articleExtraction?.identity;
      const source = candidate.sources?.find(s => s.id === record.sourceId && s.relationship !== "context");
      if (!identity || identity.requestedUrl !== source?.url || identity.finalUrl !== source?.url ||
          identity.title !== record.title?.normalize("NFKC").replace(/\s+/gu, " ").trim() ||
          !/^[a-f0-9]{64}$/.test(identity.bodySha256 ?? "") || !Number.isFinite(Date.parse(identity.retrievedAt))) holds.add("ARTICLE_IDENTITY_BINDING_REQUIRED");
    }
    if (!candidate.feedEvidence?.length || dossier.sources.some(source => !candidate.feedEvidence.some(record =>
      record.sourceId === source.sourceId && record.articleExtraction?.status === "usable"))) holds.add("USABLE_STRUCTURED_ARTICLE_REQUIRED");
    if (dossier.sources.some(source => !candidate.feedEvidence?.some(record => record.sourceId === source.sourceId &&
        JSON.stringify(record.articleExtraction?.identity) === JSON.stringify(source.articleIdentity)))) holds.add("ARTICLE_IDENTITY_BINDING_REQUIRED");
  }
  for (const source of dossier.sources) {
    const published = Date.parse(source.publishedAt);
    if (!Number.isFinite(published) || published < start || published >= end) holds.add("SOURCE_DATE_REVIEW");
    if (!Array.isArray(source.passages) || source.passages.length < 2 || typeof source.text !== "string") {
      holds.add("EVIDENCE_INCOMPLETE"); continue;
    }
  }
  for (const hold of previewSourceIntegrityHolds(dossier)) holds.add(hold);
  for (const source of candidate.sources ?? []) {
    let url;
    try { url = new URL(source.url); } catch { holds.add("SOURCE_URL_INVALID"); continue; }
    if (url.protocol !== "https:" || url.username || url.password) holds.add("SOURCE_URL_INVALID");
    const match = url.pathname.match(/\/(20\d{2})\/(0[1-9]|1[0-2])(?:\/|$)/u);
    if (match && `${match[1]}-${match[2]}` < new Date(start).toISOString().slice(0, 7)) {
      holds.add("URL_DATE_NEEDS_VERIFICATION");
    }
  }
  return [...holds];
}
