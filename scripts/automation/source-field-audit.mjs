// Isolated additional veto. This never replaces citation or editorial approval.
import { createHash } from "node:crypto";
import { buildExplicitClaimReview } from "./free/explicit-claim-review.mjs";
import { buildFieldFactReview, validateFieldFactReview } from "./free/field-fact-review.mjs";
import { buildWorkersAiRequest, DEFAULT_CLOUDFLARE_AI_MODEL, workersAiFailureDiagnostic } from "./free/workers-ai.mjs";

export function bindSourceFieldAudit(reviewData) {
  if (reviewData?.drafts?.length !== 1) throw new Error("FIELD_AUDIT_ONE_STORY");
  const original = reviewData.drafts[0];
  const dossiers = reviewData.dossiers?.map(dossier => ({ ...dossier, sources: dossier.sources?.map(source => ({
    ...source, text: source.sourceContext ?? source.passages?.map(p => p.text).join("\n"),
  })) }));
  const canonical = buildExplicitClaimReview({ drafts: [original.draft], dossiers });
  const entry = canonical.data.drafts[0];
  if (entry.draftSha256 !== original.draftSha256) throw new Error("FIELD_AUDIT_DRAFT_BINDING");
  const draft = entry.draft;
  const sources = canonical.data.dossiers.find(d => d.candidateId === draft.candidateId).sources;
  return Object.entries({ headline: draft.headline, deck: draft.deck,
    claim0: draft.claims[0].text, claim1: draft.claims[1].text,
    whyItMatters: draft.whyItMatters, whatToDoOrWatch: draft.whatToDoOrWatch }).map(([field, text]) => ({
    field, candidateId: draft.candidateId, draftSha256: entry.draftSha256,
    view: buildFieldFactReview({ text, sources }),
  }));
}

export async function auditSourceFields({ reviewData, accountId, apiToken, endpoint, aiRequestImpl, fetchImpl }) {
  const entries = bindSourceFieldAudit(reviewData);
  const calls = [];
  let modelRequests = 0, networkRequests = 0;
  for (const entry of entries) {
    const { view, ...binding } = entry;
    const call = { ...binding, request: view.data };
    calls.push(call);
    const options = { model: DEFAULT_CLOUDFLARE_AI_MODEL,
      messages: [{ role: "system", content: `${view.prompt}\nJSON schema:\n${JSON.stringify(view.schema)}` },
        { role: "user", content: JSON.stringify(view.data) }],
      schema: view.schema, responseFormat: "json_object", maxTokens: 400, maxAttempts: 1,
      temperature: 0.1, timeoutMs: 90000, maxRequestBytes: 70000, maxResponseBytes: 100000 };
    const { body } = buildWorkersAiRequest(options);
    const bodyText = JSON.stringify(body);
    const requestSha256 = createHash("sha256").update(JSON.stringify({ provider: "cloudflare-workers-ai",
      model: DEFAULT_CLOUDFLARE_AI_MODEL, body })).digest("hex");
    let requests = 0;
    try {
      if (++modelRequests > 6) throw new Error("FIELD_AUDIT_BUDGET");
      const response = await aiRequestImpl({ ...options, accountId, apiToken,
        validatePayload: value => Boolean(value && typeof value === "object" && !Array.isArray(value)),
        fetchImpl: async (url, init) => {
          if (url !== endpoint || init?.method !== "POST" || init?.redirect !== "error" || init.body !== bodyText ||
              ++requests > 1 || ++networkRequests > 6) throw new Error("FIELD_AUDIT_NETWORK");
          return fetchImpl(url, init);
        } });
      if (response.provider !== "cloudflare-workers-ai" || response.model !== DEFAULT_CLOUDFLARE_AI_MODEL ||
          response.requestSha256 !== requestSha256 || !/^[a-f0-9]{64}$/u.test(response.responseSha256 ?? "") ||
          response.attemptCount !== 1) throw new Error("FIELD_AUDIT_PROVENANCE");
      call.response = structuredClone(response.editorialPayload);
      call.verdict = validateFieldFactReview(call.response, view);
      if (!call.verdict.valid) break;
    } catch (error) { call.failure = workersAiFailureDiagnostic(error); break; }
  }
  return { passed: calls.length === 6 && calls.every(call => call.verdict?.valid && call.verdict.supported),
    calls, modelRequests, networkRequests, outputBudget: modelRequests * 400 };
}
