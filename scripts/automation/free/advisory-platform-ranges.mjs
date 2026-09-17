// Narrow preview adapter for ordinary '< dotted-version' platform ranges in
// CSAF accordions. It validates associations, not the truth of publisher claims.
import { divRegions, plainArticleText } from './article-evidence.mjs';
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const unique = xs => new Set(xs).size === xs.length;
const cvePattern = /CVE-\d{4}-\d+/g;
const hasClass = (r, name) => r.attributes.class?.includes(name);
const fail = code => ({ code });

export function inspectPlatformRanges(body, regions) {
  const summary = body.split(/<h2\b[^>]*>Vulnerabilities<\/h2>/i);
  if (summary.length !== 2) return fail('ADVISORY_CVE_SCOPE_UNVERIFIED');
  const ranges = [...summary[0].matchAll(/<li\b[^>]*>([^]*?)<\/li\s*>/gi)]
    .map(m => plainArticleText(m[1])).filter(t => /CVE-\d/.test(t));
  const expected = new Map();
  for (const range of ranges) {
    const m = /^(.*?) <(\d+(?:\.\d+)+) \((CVE-\d{4}-\d+(?:, CVE-\d{4}-\d+)*)\)$/.exec(range);
    if (!m || !m[1] || m[1].length > 120) return fail('ADVISORY_RANGE_GRAMMAR_UNSUPPORTED');
    const cves = m[3].split(', ');
    if (!unique(cves)) return fail('ADVISORY_CVE_SCOPE_UNVERIFIED');
    for (const cve of cves) expected.set(cve, [...(expected.get(cve) ?? []), `${m[1]}: <${m[2]}`]);
  }
  const sections = regions.filter(r => hasClass(r, 'csaf-accordion-item'));
  if (!ranges.length || !sections.length || sections.length > 6 || expected.size !== sections.length ||
      !same(new Set(body.match(cvePattern) ?? []), expected.keys())) return fail('ADVISORY_CVE_SCOPE_UNVERIFIED');
  const seen = new Set(), scopes = [];
  for (const section of sections) {
    if (sections.some(r => r !== section && r.start > section.start && r.end < section.end)) return fail('ADVISORY_CVE_SCOPE_UNVERIFIED');
    const html = body.slice(section.innerStart, section.innerEnd);
    const headings = [...html.matchAll(/<h3\b[^>]*>([^]*?)<\/h3>/gi)].map(m => plainArticleText(m[1]));
    const cve = headings[0];
    // The generic block serializer uses heading ancestry. A lower-level reset
    // must not detach a validated product/metric block from its CVE prefix.
    const headingStart = html.search(/<h3\b/i);
    if (/<h[12]\b/i.test(html) || headingStart < 0 || plainArticleText(html.slice(0,headingStart)) ||
        (html.match(/<h3\b/gi)??[]).length !== 1 || (html.match(/<\/h3\s*>/gi)??[]).length !== 1) return fail('ADVISORY_CVE_SCOPE_UNVERIFIED');
    if (headings.length !== 1 || !/^CVE-\d{4}-\d+$/.test(cve) || seen.has(cve) || !expected.has(cve) ||
        !same(new Set(html.match(cvePattern) ?? []), [cve])) return fail('ADVISORY_CVE_SCOPE_UNVERIFIED');
    seen.add(cve);
    const child = divRegions(html, true);
    if (!child) return fail('ADVISORY_CVE_SCOPE_UNVERIFIED');
    const values = name => child.filter(r => hasClass(r, name)).map(r => plainArticleText(html.slice(r.innerStart, r.innerEnd)));
    const vendors = values('ics-vendor'), versions = values('ics-version'), statuses = values('ics-status');
    if (vendors.length !== 1 || versions.length !== 1 || statuses.length !== 1 || statuses[0] !== 'Product Status: known_affected') return fail('ADVISORY_PRODUCT_SCOPE_UNVERIFIED');
    const vendor = vendors[0].replace(/^Vendor: /, '');
    if (!vendor || vendor === vendors[0]) return fail('ADVISORY_PRODUCT_SCOPE_UNVERIFIED');
    const products = versions[0].replace(/^Product Version: /, '').split(', ');
    if (products.some(p => !p.startsWith(`${vendor} `))) return fail('ADVISORY_PRODUCT_SCOPE_UNVERIFIED');
    const mapped = products.map(p => p.slice(vendor.length + 1));
    if (!unique(mapped) || !unique(expected.get(cve)) || !same(mapped, expected.get(cve))) return fail('ADVISORY_PRODUCT_SCOPE_UNVERIFIED');
    const metrics = child.filter(r => hasClass(r, 'csaf-metrics-table'));
    const fixes = child.filter(r => hasClass(r, 'ics-remediations'));
    if (metrics.length !== 1 || fixes.length !== 1 || !plainArticleText(html.slice(fixes[0].innerStart, fixes[0].innerEnd))) return fail('ADVISORY_CVE_SCOPE_UNVERIFIED');
    const metricHtml = html.slice(metrics[0].innerStart, metrics[0].innerEnd);
    const rows = [...metricHtml.matchAll(/<tr\b[^>]*>([^]*?)<\/tr>/gi)].map(m =>
      [...m[1].matchAll(/<(?:td|th)\b[^>]*>([^]*?)<\/(?:td|th)>/gi)].map(c => plainArticleText(c[1])));
    const headers = rows.shift() ?? [];
    if (!same(headers, ['CVSS Version', 'Base Score', 'Base Severity', 'Vector String']) || rows.length < 1 || rows.length > 2) return fail('ADVISORY_METRICS_UNVERIFIED');
    const metricVersions = [];
    for (const row of rows) {
      if (row.length !== 4) return fail('ADVISORY_METRICS_UNVERIFIED');
      const entry = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
      const version = entry['CVSS Version']; metricVersions.push(version);
      if (!['3.1', '4.0'].includes(version) || !/^\d(?:\.\d)?$|^10(?:\.0)?$/.test(entry['Base Score']) ||
          !['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(entry['Base Severity']) ||
          !entry['Vector String'].startsWith(`CVSS:${version}/`)) return fail('ADVISORY_METRICS_UNVERIFIED');
    }
    if (!unique(metricVersions)) return fail('ADVISORY_METRICS_UNVERIFIED');
    scopes.push({ cve, products: expected.get(cve), metricVersions });
  }
  // All relationship-bearing groups must be within exactly one CVE section.
  for (const group of regions.filter(r => ['ics-vendor', 'ics-version', 'ics-status', 'ics-remediations', 'csaf-metrics-table'].some(c => hasClass(r,c)))) {
    if (sections.filter(s => group.start > s.start && group.end < s.end).length !== 1) return fail('ADVISORY_CVE_SCOPE_UNVERIFIED');
  }
  return { ranges, scopes };
}
