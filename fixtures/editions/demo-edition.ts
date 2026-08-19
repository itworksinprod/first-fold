import edition from "../../content/editions/2026-08-19.json" with { type: "json" };
import type { Edition } from "../../lib/editorial/schema";

/**
 * The JSON file is the single canonical demo-edition artifact. This typed
 * export keeps tests and future pipeline code on the same source as the reader.
 * Runtime validation remains authoritative at the untyped JSON boundary.
 */
export const demoEdition = edition as unknown as Edition;

export default demoEdition;
