// One real-source writer probe, not an edition or delivery path. Only ciphertext
// leaves the runner. The decryption key is generated and retained on Carlos's Mac.
import { createCipheriv, createDecipheriv, createPublicKey, generateKeyPairSync,
  publicEncrypt, privateDecrypt, randomBytes, constants } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectFreeResearchSnapshot } from "./free/feed-engine.mjs";
import { synthesizeGroundedEditorial } from "./free/grounded-draft.mjs";
import { FREE_REASONING_WRITER_MODEL, requestWorkersAiEditorial, workersAiFailureDiagnostic,
  workersAiRunUrl } from "./free/workers-ai.mjs";

const MAX_BYTES = 350_000;
const AAD = Buffer.from("first-fold-private-writer-diagnostic-v1");
const failure = code => Object.assign(new Error(code), { code });
const safeCode = value => /^[A-Z_]{1,64}$/u.test(value ?? "") ? value : "DIAGNOSTIC_FAILED";

export function diagnosticPublicKey(encoded) {
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]{400,900}={0,2}$/u.test(encoded)) {
    throw failure("DIAGNOSTIC_KEY_INVALID");
  }
  const key = createPublicKey({ key: Buffer.from(encoded, "base64"), format: "der", type: "spki" });
  if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength !== 3072) {
    throw failure("DIAGNOSTIC_KEY_INVALID");
  }
  return key;
}

export function sealDiagnostic(value, encodedKey) {
  const publicKey = diagnosticPublicKey(encodedKey);
  const plaintext = Buffer.from(JSON.stringify(value));
  if (plaintext.length > MAX_BYTES) throw failure("DIAGNOSTIC_SIZE_LIMIT");
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const wrappedKey = publicEncrypt({ key: publicKey, oaepHash: "sha256",
    padding: constants.RSA_PKCS1_OAEP_PADDING }, key);
  key.fill(0);
  return { version: 1, wrappedKey: wrappedKey.toString("base64"), iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

export function openDiagnostic(envelope, privateKey) {
  if (envelope?.version !== 1 || typeof envelope.ciphertext !== "string" ||
      envelope.ciphertext.length > Math.ceil(MAX_BYTES / 3) * 4) throw failure("DIAGNOSTIC_SIZE_LIMIT");
  const key = privateDecrypt({ key: privateKey, oaepHash: "sha256",
    padding: constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(envelope.wrappedKey, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
  key.fill(0);
  return JSON.parse(plaintext.toString("utf8"));
}

export function assertDiagnosticAuthority(env) {
  if (env.GITHUB_REPOSITORY !== "itworksinprod/first-fold" || env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_WORKFLOW_REF !== "itworksinprod/first-fold/.github/workflows/private-writer-diagnostic.yml@refs/heads/main" ||
      env.GITHUB_ACTOR !== "itworksinprod" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_RUN_ATTEMPT !== "1") throw failure("DIAGNOSTIC_AUTHORITY_REJECTED");
}

export async function diagnoseOneWriter({ publicKey, accountId, apiToken, now = new Date(),
  researchImpl = collectFreeResearchSnapshot, aiRequestImpl = requestWorkersAiEditorial,
  fetchImpl = globalThis.fetch } = {}) {
  // Check encryption and credentials before research or inference, not afterwards.
  diagnosticPublicKey(publicKey);
  const endpoint = workersAiRunUrl(accountId, FREE_REASONING_WRITER_MODEL);
  if (typeof apiToken !== "string" || !apiToken.trim()) throw failure("DIAGNOSTIC_CONFIGURATION_INVALID");
  const capture = { purpose: "one-real-source-writer-probe-not-an-edition", capturedAt: now.toISOString(),
    calls: [], diagnostics: [], emailSent: false };
  let modelRequests = 0;
  let networkRequests = 0;
  let outputBudget = 0;
  let result;
  let code = null;
  try {
    const snapshot = await researchImpl({
      reportingWindow: { startInclusive: new Date(now.getTime() - 72 * 3_600_000).toISOString(), endExclusive: now.toISOString() },
      retrievedAt: now.toISOString(), enrichArticles: true,
      evidencePolicy: "authoritative-or-corroborated", minimumScore: 70, minimumAuthoritativeScore: 70,
      // No search API, AI selection pass, repeat ledger, email or publication.
    });
    const candidate = snapshot.candidates?.find(item => item.ranking?.score >= 70 &&
      ["authoritative-single", "corroborated"].includes(item.ranking.evidenceTier));
    if (!candidate) throw failure("DIAGNOSTIC_NO_QUALIFYING_STORY");
    capture.candidate = candidate;
    const baseline = { frontPage: { note: "Diagnostic only", estimatedMinutes: 1 }, desks: {
      [candidate.suggestedDesk]: { story: { id: candidate.candidateId, sources: candidate.sources,
        evidence: [], selection: { score: candidate.ranking.score } } },
    } };
    result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      accountId, apiToken, model: FREE_REASONING_WRITER_MODEL,
      fetchImpl: async (url, options) => {
        if (url !== endpoint || options.method !== "POST" || options.redirect !== "error" || networkRequests >= 3) {
          throw failure("DIAGNOSTIC_NETWORK_CONTRACT");
        }
        networkRequests++;
        return fetchImpl(url, options);
      },
      aiRequestImpl: async options => {
        if (++modelRequests > 3 || (outputBudget += options.maxTokens) > 7_800 ||
            options.model !== FREE_REASONING_WRITER_MODEL || options.maxAttempts !== 1) {
          throw failure("DIAGNOSTIC_REQUEST_BUDGET");
        }
        // Never retain headers, tokens, the transport envelope, or reasoning.
        const call = { request: JSON.parse(options.messages[1].content) };
        capture.calls.push(call);
        try {
          const response = await aiRequestImpl(options);
          call.editorialPayload = structuredClone(response.editorialPayload);
          return response;
        } catch (error) {
          call.failure = { code: safeCode(error?.code), ...workersAiFailureDiagnostic(error) };
          throw error;
        }
      },
      onDiagnostic: event => capture.diagnostics.push(structuredClone(event)),
    });
    if (!result) code = "DIAGNOSTIC_SUMMARY_NOT_ACCEPTED";
  } catch (error) { code = safeCode(error?.code); }
  capture.result = result?.editorial ?? null;
  const report = { mode: capture.purpose, status: result ? "writer-and-review-passed" : "failed", code,
    modelRequests, networkRequests, outputBudget, searchQueries: 0, emailSent: false,
    failures: capture.calls.flatMap(call => call.failure ? [call.failure] : []) };
  return { report, sealed: sealDiagnostic({ ...capture, report }, publicKey) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === "keygen" && !args.length) {
      const directory = await mkdtemp(join(tmpdir(), "first-fold-writer-diagnostic-"));
      const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
      const privatePath = join(directory, "private.pem");
      await writeFile(privatePath, pair.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600, flag: "wx" });
      console.info(JSON.stringify({ privatePath, publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64") }));
    } else if (command === "decrypt" && args.length === 3) {
      const value = openDiagnostic(JSON.parse(await readFile(args[0], "utf8")), await readFile(args[1], "utf8"));
      await writeFile(args[2], JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
      console.info("Diagnostic decrypted locally; content remains untrusted source/model data.");
    } else if (command === "run" && args.length === 1) {
      assertDiagnosticAuthority(process.env);
      const { sealed, report } = await diagnoseOneWriter({ publicKey: process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_AI_API_TOKEN });
      await writeFile(args[0], JSON.stringify(sealed), { mode: 0o600, flag: "wx" });
      console.info(`::notice title=One-story diagnostic::${JSON.stringify(report)}`);
      if (report.status === "failed") process.exitCode = 1;
    } else throw failure("DIAGNOSTIC_ARGUMENTS_INVALID");
  } catch (error) {
    console.error(`::error title=Private writer diagnostic::${safeCode(error?.code)}`);
    process.exitCode = 1;
  }
}
