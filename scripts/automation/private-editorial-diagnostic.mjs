// Encrypt-only observational collection. No filesystem, transport, credential,
// model or delivery API is exposed here. The caller owns ciphertext persistence.
import { diagnosticPublicKey, sealDiagnostic } from "./private-writer-diagnostic.mjs";
import { validatePrivateEditorialDiagnostic } from "./free/grounded-draft.mjs";

export const MAX_PRIVATE_EDITORIAL_DIAGNOSTIC_BYTES = 160_000;
export const MAX_PRIVATE_EDITORIAL_DIAGNOSTIC_RECORDS = 2;
const purpose = "private-editorial-diagnostics-not-an-edition";
const stages = ["assembled-drafts", "review-verdicts"];
const failure = code => Object.assign(new Error(code), { code });

/** Required-key preflight. Call before credential lookup or research. */
export function validatePrivateEditorialDiagnosticKey(publicKey) {
  try { diagnosticPublicKey(publicKey); }
  catch { throw failure("PRIVATE_EDITORIAL_DIAGNOSTIC_KEY_INVALID"); }
  return true;
}

/** An absent key is deliberately inert; an invalid supplied key fails early.
 * Packet failures never escape the observational sink. Only the strict locally
 * assembled draft/source/check protocol is accepted, never provider envelopes,
 * private reasoning, arbitrary error objects or request/configuration objects.
 */
export function createPrivateEditorialDiagnosticCollector(options = {}) {
  let publicKey;
  try {
    if (!options || Object.getPrototypeOf(options) !== Object.prototype ||
        Reflect.ownKeys(options).some(key => key !== "publicKey")) throw new Error();
    const descriptor = Object.getOwnPropertyDescriptor(options, "publicKey");
    if (descriptor && !Object.hasOwn(descriptor, "value")) throw new Error();
    publicKey = descriptor?.value;
  } catch { throw failure("PRIVATE_EDITORIAL_DIAGNOSTIC_CONFIGURATION_INVALID"); }
  if (publicKey !== undefined) validatePrivateEditorialDiagnosticKey(publicKey);
  let finalized = false;
  let profile;
  let lastStage = -1;
  const serializedRecords = [];
  const documentFor = records => ({ version: 1, purpose, records });

  const onPrivateEditorialDiagnostic = packet => {
    if (publicKey === undefined || finalized || serializedRecords.length >= MAX_PRIVATE_EDITORIAL_DIAGNOSTIC_RECORDS) return false;
    try {
      // The validator rejects accessors, cycles, unexpected prototypes/keys,
      // excessive nested bounds and any non-protocol data before serialization.
      if (!validatePrivateEditorialDiagnostic(packet)) return false;
      const snapshot = structuredClone(packet);
      if (!validatePrivateEditorialDiagnostic(snapshot)) return false;
      const stage = stages.indexOf(snapshot.stage);
      if (stage <= lastStage || (profile !== undefined && snapshot.profile !== profile)) return false;
      const serialized = JSON.stringify(snapshot);
      const proposed = documentFor([...serializedRecords.map(value => JSON.parse(value)), snapshot]);
      if (Buffer.byteLength(JSON.stringify(proposed), "utf8") > MAX_PRIVATE_EDITORIAL_DIAGNOSTIC_BYTES) return false;
      serializedRecords.push(serialized);
      profile = snapshot.profile;
      lastStage = stage;
      return true;
    } catch { return false; }
  };

  const finalize = async () => {
    if (finalized) return null;
    finalized = true;
    if (publicKey === undefined || serializedRecords.length === 0) return null;
    const records = serializedRecords.splice(0);
    try {
      // No plaintext is returned or persisted. Existing RSA-3072/OAEP-SHA256
      // wraps an ephemeral AES-256-GCM key with the existing authenticated AAD.
      return sealDiagnostic(documentFor(records.map(value => JSON.parse(value))), publicKey);
    } catch { return null; }
  };
  return Object.freeze({ onPrivateEditorialDiagnostic, finalize });
}
