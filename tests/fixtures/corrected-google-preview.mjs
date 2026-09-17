// Assistant-edited revision of rejected run6, not raw model output or fresh research.
import { readFileSync } from "node:fs";
const original = JSON.parse(readFileSync(new URL("./rejected-preview-run6.json", import.meta.url), "utf8")).records[0];
export function correctedGooglePreview() {
  return {
    dossier: structuredClone(original.dossier),
    draft: {
      candidateId: original.candidateId,
      headline: "Google Meet adds room-code option for conference hardware",
      deck: "A manual connection option is available when ultrasound detection is unavailable or disabled.",
      claims: [
        { text: "Google Workspace Updates says people can link a personal device to nearby Meet conference hardware using a 5-character code. The code appears on the room hardware, and users enter it through a button on their device's pre-call screen.", supports: [{ evidenceId: "S1P2" }, { evidenceId: "S1P4" }] },
        { text: "Google Workspace Updates describes the code entry as a manual alternative when ultrasound detection is disabled or unavailable. The feature is intended for Workspace customers with Google Meet hardware.", supports: [{ evidenceId: "S1P3" }, { evidenceId: "S1P9" }] },
      ],
      whyItMatters: "The practical distinction is the connection method: room-code entry offers a manual fallback rather than relying on ultrasound. Availability also depends on device settings; administrators can switch the feature off for their organization's hardware.",
      whatToDoOrWatch: "Check the device setting before trying it: Google lists the feature as on by default, with device-level administrator controls. The rollout began September 15, 2026, with visibility spreading gradually over up to 15 days across Rapid Release and Scheduled Release domains.",
    },
    evidenceForFields: { headline: ["S1P1", "S1P2"], deck: ["S1P3"], whyItMatters: ["S1P3", "S1P12", "S1P13"], whatToDoOrWatch: ["S1P8", "S1P12"] },
  };
}
