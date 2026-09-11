export const groundedEvidence = {
  sourceId: "cert-advisory", publisher: "CERT/CC",
  title: "AOMEI Backupper driver permits arbitrary disk writes",
  summary: "The amwrtdrv.sys driver in AOMEI Backupper permits a local user to write arbitrary data to physical disks. The vulnerable driver exposes this capability through insufficient access checks. Disk writes could corrupt stored data. The advisory does not establish exploitation in the wild or identify a fixed version.",
  categories: ["security"], publishedAt: "2026-08-20T08:00:00.000Z",
};
export const groundedDraft = {
  candidateId: "candidate-personal-local-digest",
  headline: "AOMEI backup driver exposes disk-write access",
  deck: "CERT/CC describes a local vulnerability in the backup software’s driver.",
  claims: [
    { text: "CERT/CC says a driver shipped with AOMEI Backupper gives a local user access to disk-writing capabilities that should be restricted. The issue concerns amwrtdrv.sys and its access checks, rather than a reported remote attack against the backup service.",
      supports: [{ evidenceId: "S1P2" }, { evidenceId: "S1P3" }] },
    { text: "The advisory describes potential damage to stored information. It does not provide evidence of active attacks or name a corrected software version, so neither exploitation nor the availability of a fix can be inferred from this report.",
      supports: [{ evidenceId: "S1P4" }, { evidenceId: "S1P5" }] },
  ],
  whyItMatters: "Backup software is meant to protect recoverability. If an installed driver allows unauthorized disk changes, the consequences could reach the data the software is intended to safeguard. The relevant exposure is on machines running the affected driver; this is not evidence that every backup has been compromised.",
  whatToDoOrWatch: "Check whether your machines use this driver, then follow the advisory and the vendor’s guidance for affected releases and remediation. Watch for a documented fix and clearer prerequisites before deciding on a response. Do not assume that routine backup success rules out the underlying access-control problem.",
};
