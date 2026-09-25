// Conservative local hold triggers, not grammar or semantic equivalence tests.
// Compare the COMPLETE assembled sentence with its immutable baseline so edits
// cannot introduce repetition at their boundaries or through interaction.
const fail = () => Object.assign(new Error('FACT_SUMMARY_PHRASE_EDIT_CONTEXT'), { code: 'FACT_SUMMARY_PHRASE_EDIT_CONTEXT' });
const words = text => text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
function repetitionCounts(tokens) {
  const counts = new Map();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === tokens[i + 1]) {
      const key = `pair:${tokens[i]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Count all overlapping lengths, not just short windows: a new long repeat
    // can recombine existing short windows without increasing their counts.
    let phrase = tokens[i];
    for (let end = i + 1; end < tokens.length; end++) {
      phrase += ` ${tokens[end]}`;
      if (end - i + 1 >= 3) {
        const key = `phrase:${phrase}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function assertPhraseCopyeditContext(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string' || !before.trim() || !after.trim() ||
      before.length > 2000 || after.length > 2000) throw fail();
  const priorWords = words(before), finalWords = words(after);
  if (priorWords.length > 512 || finalWords.length > 512) throw fail();
  const original = repetitionCounts(priorWords), edited = repetitionCounts(finalWords);
  for (const [key, count] of edited) {
    // A newly occurring phrase is fine; its repetition is not. Adjacent duplicate
    // words hold immediately. Pre-existing repetition is not retroactively repaired.
    const allowance = key.startsWith('pair:') ? (original.get(key) ?? 0) : Math.max(1, original.get(key) ?? 0);
    if (count > allowance) throw fail();
  }
  return true;
}
