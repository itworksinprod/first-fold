// Preview-only adapters for observed publisher templates. The caller must first
// verify the requested URL, canonical URL and exact H1. These are content-region
// selectors, never permission to fetch a new host or trust a publisher's claims.
import { divRegions, plainArticleText } from './article-evidence.mjs';

const inside = (child, parent) => child.start > parent.start && child.end < parent.end;
const has = (r, c) => r.attributes.class?.includes(c);
const one = (regions, predicate) => {
  const found = regions.filter(predicate);
  if (found.length !== 1) throw Error('PUBLISHER_REGION_AMBIGUOUS');
  return found[0];
};
export function previewPublisherRegion(html, identity) {
  const url = new URL(identity.requestedUrl);
  const gitlab = url.hostname === 'about.gitlab.com' && /^\/blog\/[^/]+\/$/.test(url.pathname);
  const aws = url.hostname === 'aws.amazon.com' && url.pathname.startsWith('/about-aws/whats-new/');
  const doj = url.hostname === 'www.justice.gov' && url.pathname.startsWith('/opa/pr/');
  if (!gitlab && !aws && !doj) return null;
  if (typeof html !== 'string' || Buffer.byteLength(html) > 600_000 || (html.match(/</g) ?? []).length > 12_000) throw Error('PUBLISHER_REGION_AMBIGUOUS');
  // Do not strip nested header/nav elements before balancing the divs: nested
  // menus can leave unmatched closing tags and hide an otherwise intact body.
  let clean = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  if (doj) {
    const articles = [...clean.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)];
    if (articles.length !== 1) throw Error('PUBLISHER_REGION_AMBIGUOUS');
    clean = articles[0][1];
  }
  const regions = divRegions(clean, true);
  if (!regions) throw Error('PUBLISHER_REGION_AMBIGUOUS');
  let body;
  if (gitlab) {
    const page = one(regions, r => r.attributes.id?.includes(`page-blog-${url.pathname.split('/')[2]}`));
    const hero = one(regions, r => inside(r, page) && has(r, 'hero'));
    const heroHtml = clean.slice(hero.innerStart,hero.innerEnd);
    const titles = [...heroHtml.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1\s*>/gi)];
    if(titles.length!==1) throw Error('PUBLISHER_REGION_AMBIGUOUS');
    const afterTitle=heroHtml.slice(titles[0].index+titles[0][0].length);
    const standfirsts=[...afterTitle.matchAll(/<p\b[^>]*class=["']slp-text-body1["'][^>]*>[\s\S]*?<\/p\s*>/gi)];
    if(standfirsts.length!==1 || plainArticleText(afterTitle.replace(standfirsts[0][0],''))) throw Error('PUBLISHER_REGION_AMBIGUOUS');
    const content = one(regions, r => inside(r, page) && has(r, 'content'));
    const region = one(regions, r => inside(r, content) && has(r, 'body'));
    if (plainArticleText(clean.slice(content.innerStart, region.start) + clean.slice(region.end, content.innerEnd))) throw Error('PUBLISHER_OUTSIDE_BODY_TEXT');
    body = standfirsts[0][0] + clean.slice(region.innerStart, region.innerEnd);
  } else if (aws) {
    const container = one(regions, r => has(r, 'wn-content-with-nav'));
    const mains = [...clean.slice(container.innerStart, container.innerEnd).matchAll(/<main\b[^>]*class=["']wn-post["'][^>]*>([\s\S]*?)<\/main\s*>/gi)];
    if (mains.length !== 1) throw Error('PUBLISHER_REGION_AMBIGUOUS');
    const main = mains[0][1], parts = divRegions(main, true);
    if (!parts) throw Error('PUBLISHER_REGION_AMBIGUOUS');
    const bodies = parts.filter(r => has(r, 'wn-body'));
    // Exactly one date-only container followed by the complete prose body.
    if (bodies.length !== 2 || !/^Posted on: [A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(plainArticleText(main.slice(bodies[0].innerStart, bodies[0].innerEnd)))) throw Error('PUBLISHER_REGION_AMBIGUOUS');
    const region = bodies[1];
    const rest = main.slice(0, bodies[0].start) + main.slice(bodies[0].end, region.start) + main.slice(region.end);
    if (plainArticleText(rest.replace(/<h1\b[^>]*>[\s\S]*?<\/h1\s*>/gi, ''))) throw Error('PUBLISHER_OUTSIDE_BODY_TEXT');
    body = main.slice(region.innerStart, region.innerEnd);
  } else {
    const container = one(regions, r => has(r, 'node-body'));
    const region = one(regions, r => inside(r, container) && has(r, 'field_body'));
    const subtitle = one(regions, r => has(r, 'node-subtitle'));
    if (plainArticleText(clean.slice(container.innerStart, region.start) + clean.slice(region.end, container.innerEnd))) throw Error('PUBLISHER_OUTSIDE_BODY_TEXT');
    // Subtitle is substantive source text, not UI metadata. Preserve it too.
    body = `<p>${clean.slice(subtitle.innerStart, subtitle.innerEnd).replace(/<\/?div\b[^>]*>/gi, '')}</p>` + clean.slice(region.innerStart, region.innerEnd);
  }
  return { title: identity.title, body };
}
