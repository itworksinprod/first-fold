// Conservative preview-only holds, not proof that a source is inaccurate.
// Do not infer original publication dates from URL paths alone.
export function previewSourceIntegrityHolds(dossier) {
  const holds = new Set();
  for (const source of dossier?.sources ?? []) {
    const texts = [source.text, ...(source.passages ?? []).map(p => p.text)].filter(t => typeof t === "string");
    // Narrow, conservative alarms for observed feed/extraction failures. These
    // are NOT an extraction repair or a general test of factual completeness.
    if (texts.some(t => /vers:intdot\/|\bUpdate to V\d*\s*$|\b(?:obtain|install|download|update)[^.?!]*\b(?:the latest|the|to|and|version|release)\s*$/iu.test(t))) {
      holds.add("EVIDENCE_EXTRACTION_INCOMPLETE");
    }
    if (texts.some(t => /Countries\/Areas Deployed:|CVSS\s+Vendor\s+Equipment\s+Vulnerabilities/iu.test(t))) {
      holds.add("ADVISORY_STRUCTURE_REVIEW");
    }
  }
  return [...holds];
}

export function previewEvidenceHolds(candidate, dossier, reportingWindow) {
  const holds = new Set();
  if (!candidate || candidate.ranking?.score < 70 || !Number.isFinite(candidate.ranking?.score) ||
      !["authoritative-single", "corroborated"].includes(candidate.ranking?.evidenceTier) ||
      !dossier?.sources?.length || candidate.candidateId !== dossier.candidateId) return ["SELECTION_INVALID"];
  const start = Date.parse(reportingWindow?.startInclusive), end = Date.parse(reportingWindow?.endExclusive);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return ["WINDOW_INVALID"];
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
