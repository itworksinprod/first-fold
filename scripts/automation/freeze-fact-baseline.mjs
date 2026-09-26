// Local-only CLI; full article text and drafts stay in the private sibling
// first-fold-review directory. It cannot send email or dispatch a workflow.
import { constants } from 'node:fs';
import { open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freezeFactBaseline, frozenBaselineReceipt } from './free/frozen-fact-baseline.mjs';

const reviewRoot = fileURLToPath(new URL('../../../first-fold-review/', import.meta.url));
const qualificationUrl = new URL('../../docs/checkpoints/mit-frozen-baseline.json', import.meta.url);
const sheetUrl = new URL('../../docs/checkpoints/mit-fact-sheet.json', import.meta.url);
const contained = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

// Exported for filesystem tests with a temporary private root, not a CLI override.
export async function privateBaselinePath(filename, root = reviewRoot) {
  const actualRoot = await realpath(root), absolute = path.resolve(filename);
  const parent = await realpath(path.dirname(absolute));
  const target = path.join(parent, path.basename(absolute));
  if (!contained(actualRoot, target)) throw new Error('FROZEN_BASELINE_PRIVATE_PATH');
  return target;
}
async function readPrivateJson(filename) {
  const target = await privateBaselinePath(filename);
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 2_000_000) throw new Error('FROZEN_BASELINE_INPUT');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export async function writePrivateBaseline(filename, text, root = reviewRoot) {
  const target = await privateBaselinePath(filename, root);
  const handle = await open(target, 'wx', 0o600); // Never replace an existing file or follow a leaf symlink.
  try { await handle.writeFile(text, 'utf8'); } finally { await handle.close(); }
}

async function main(args) {
  const [mode, input, output] = args;
  if (!input || (mode === 'freeze' ? args.length !== 3 : mode !== 'verify' || args.length !== 2)) {
    throw new Error('FROZEN_BASELINE_USAGE: freeze <private-diagnostic.json> <private-output.json> | verify <private-output.json>');
  }
  const qualification = await readFile(qualificationUrl, 'utf8');
  const text = await readPrivateJson(input);
  if (mode === 'freeze') {
    const artifact = freezeFactBaseline(text, await readFile(sheetUrl, 'utf8'), qualification);
    const receipt = frozenBaselineReceipt(artifact, qualification);
    await writePrivateBaseline(output, artifact);
    console.log(JSON.stringify(receipt, null, 2));
  } else console.log(JSON.stringify(frozenBaselineReceipt(text, qualification), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    // Avoid logging private paths, excerpts, or complete diagnostic objects.
    console.error(/^FROZEN_BASELINE_[A-Z_]+(?::.*)?$/u.test(error.message) ? error.message : 'FROZEN_BASELINE_FAILED');
    process.exitCode = 1;
  });
}
