// No-email verification obeys production's date/cutoff rules. Reserve the
// workflow's twenty-minute timeout before either closing boundary.
export function qualityCheckWindow(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  if (minute < 300 || minute >= 340 && minute < 360 || minute >= 1420) {
    throw Object.assign(new Error("Start verification with twenty minutes remaining in a valid generation window."), {
      code: "QUALITY_START_WINDOW_CLOSED",
    });
  }
  return { editionDate: `${parts.year}-${parts.month}-${parts.day}`,
    runMode: minute >= 360 ? "same_day_backfill" : "on_time" };
}
