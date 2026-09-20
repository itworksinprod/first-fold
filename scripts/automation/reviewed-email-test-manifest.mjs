// Closed by default. A narrowly scoped, reviewed change may replace null with
// one immutable authorization and encrypted-artifact digests. Never put source
// text, recipient addresses, API keys, or the decryption key in this manifest.
// Explicit owner-approved private email test; exact independently reviewed bytes.
const manifest = {
  "version": "reviewed-email-test-manifest-v1",
  "cipherSha256": "aae5e8d00549b1bc4e659b97701667ec16c3ac7134d73dbb7e28d096a80c9807",
  "inputSha256": "4cc40db15cffc2902503a479a5add1849dc1e18bafceff9240ada08c38c036f8",
  "sourceRunId": "35482301862",
  "sourceGitSha": "dbfc1074aa827ccd2107b35b9211d282a7cff228",
  "authorization": {
    "version": "reviewed-preview-email-test-v1",
    "purpose": "one-shot-reviewed-email-test",
    "confirmation": "SEND EXACT REVIEWED TEST ONCE",
    "testId": "run35482301862-reviewed-8568709e76de7fd9",
    "editionDate": "2026-09-19",
    "researchMode": "stored-evidence",
    "storyCount": 2,
    "contentSha256": "8568709e76de7fd9e3c93e8aead0773fe612e0eb02536c3544fbb7cf3d5fa8bf",
    "reviewSha256": "384d44c19da3f6cd649a29017d9b95df66837d8c970a0b820ee320e02c917157",
    "issuedAt": "2026-09-20T02:19:16.506Z",
    "expiresAt": "2026-09-20T04:19:16.506Z",
    "recipientSource": "PERSONAL_PAPER_EMAIL",
    "emailRequests": 1,
    "dailyDelivery": false,
    "publicEdition": false,
    "enableBilling": false
  }
};
export const REVIEWED_EMAIL_TEST_MANIFEST = Object.freeze({ ...manifest, authorization: Object.freeze(manifest.authorization) });
