import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

export const LOCAL_PREVIEW_MAX_BASE64_CHARS = 60_000;
export const LOCAL_PREVIEW_MAX_JSON_BYTES = 256 * 1024;
const fail = code => Object.assign(new Error(code), { code });
const forbiddenKey = /^(?:__proto__|prototype|constructor|api[_-]?key|access[_-]?token|authorization|cookie|secret|password|reasoning|rawResponse|rawPrompt|localPath|filePath)$/iu;
function assertPublicNewsShape(value, depth = 0) {
  if (depth > 24) throw fail("LOCAL_PREVIEW_PAYLOAD_SHAPE");
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKey.test(key)) throw fail("LOCAL_PREVIEW_PAYLOAD_PRIVATE_FIELD");
      assertPublicNewsShape(child, depth + 1);
    }
  } else if (typeof value === "string" && /(?:file:\/\/\/|\/Users\/|\/home\/|\b(?:sk-|tvly-|re_)[A-Za-z0-9_-]{20,})/u.test(value)) {
    throw fail("LOCAL_PREVIEW_PAYLOAD_PRIVATE_FIELD");
  }
}

export function encodeLocalPreviewPayload(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw fail("LOCAL_PREVIEW_PAYLOAD_SHAPE");
  assertPublicNewsShape(candidate);
  const json = JSON.stringify(candidate);
  if (Buffer.byteLength(json, "utf8") > LOCAL_PREVIEW_MAX_JSON_BYTES) throw fail("LOCAL_PREVIEW_PAYLOAD_SIZE");
  const candidateGzipBase64 = gzipSync(Buffer.from(json, "utf8")).toString("base64");
  if (candidateGzipBase64.length > LOCAL_PREVIEW_MAX_BASE64_CHARS) throw fail("LOCAL_PREVIEW_PAYLOAD_SIZE");
  return { candidateGzipBase64, candidateSha256: createHash("sha256").update(json, "utf8").digest("hex") };
}

export function decodeLocalPreviewPayload(candidateGzipBase64, candidateSha256) {
  if (typeof candidateGzipBase64 !== "string" || candidateGzipBase64.length < 4 ||
      candidateGzipBase64.length > LOCAL_PREVIEW_MAX_BASE64_CHARS ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(candidateGzipBase64) ||
      !/^[a-f0-9]{64}$/u.test(candidateSha256 ?? "")) throw fail("LOCAL_PREVIEW_PAYLOAD_ENCODING");
  const compressed = Buffer.from(candidateGzipBase64, "base64");
  if (compressed.toString("base64") !== candidateGzipBase64) throw fail("LOCAL_PREVIEW_PAYLOAD_ENCODING");
  let bytes;
  try { bytes = gunzipSync(compressed, { maxOutputLength: LOCAL_PREVIEW_MAX_JSON_BYTES }); }
  catch { throw fail("LOCAL_PREVIEW_PAYLOAD_GZIP"); }
  if (createHash("sha256").update(bytes).digest("hex") !== candidateSha256) throw fail("LOCAL_PREVIEW_PAYLOAD_HASH");
  let candidate;
  let json;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    candidate = JSON.parse(json);
  } catch { throw fail("LOCAL_PREVIEW_PAYLOAD_JSON"); }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || JSON.stringify(candidate) !== json) {
    throw fail("LOCAL_PREVIEW_PAYLOAD_SHAPE");
  }
  assertPublicNewsShape(candidate);
  return candidate;
}
