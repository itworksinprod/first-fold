#!/usr/bin/env node
// Explicit no-email experiment. A probe proves availability, not story quality.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkGeminiWriter, FREE_PROJECT_CONFIRMATION } from "./check-gemini-writer.mjs";
import { requestGeminiEditorial, geminiFailureDiagnostic, GEMINI_LITE_MODEL } from "./free/gemini-ai.mjs";

export async function checkGeminiLite({ apiKey, freeProjectConfirmation, fetchImpl = globalThis.fetch } = {}) {
  let probe;
  try {
    probe = await requestGeminiEditorial({ apiKey,
      freeTierConfirmed: freeProjectConfirmation === FREE_PROJECT_CONFIRMATION,
      model: GEMINI_LITE_MODEL, fetchImpl, maxTokens: 512, thinking: "low", timeoutMs: 60000,
      messages: [{ role: "system", content: "Return only the requested JSON object." },
        { role: "user", content: 'Return {"ok":true}.' }],
      schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
      validatePayload: value => Object.keys(value).join() === "ok" && value.ok === true });
  } catch (error) {
    return { status: "failed", stage: "availability-probe", model: GEMINI_LITE_MODEL,
      code: /^GEMINI_[A-Z_]+$/u.test(error?.code ?? "") ? error.code : "GEMINI_PROBE_FAILED",
      ...geminiFailureDiagnostic(error), productionEnabled: false, emailRequests: 0, liveResearchRequests: 0 };
  }
  const qualification = await checkGeminiWriter({ apiKey, freeProjectConfirmation, fetchImpl, model: GEMINI_LITE_MODEL });
  return { status: qualification.status, stage: qualification.stage, model: GEMINI_LITE_MODEL,
    productionEnabled: false, emailRequests: 0, liveResearchRequests: 0,
    maxModelRequests: 6, maxRequestedOutputTokens: 40512,
    probe: { status: "passed", requestSha256: probe.requestSha256, responseSha256: probe.responseSha256 }, qualification };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2] !== "--qualification-only") {
    console.error("Use --qualification-only for this bounded no-email test.");
    process.exitCode = 1;
  } else {
    const report = await checkGeminiLite({ apiKey: process.env.GEMINI_API_KEY,
      freeProjectConfirmation: process.env.GEMINI_FREE_PROJECT_CONFIRMATION });
    console.info(JSON.stringify(report));
    if (report.status !== "passed") process.exitCode = 1;
  }
}
