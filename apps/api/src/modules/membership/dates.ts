/**
 * Adds calendar months, clamping to the last day of the month (31 Jan + 1 month = 28/29 Feb).
 * Uses Malaysia time for the calendar so a membership bought late at night ends on the right local date.
 */
const MY_OFFSET_MS = 8 * 60 * 60_000; // Asia/Kuala_Lumpur has no daylight saving

export function addMonths(date: Date, months: number): Date {
  const local = new Date(date.getTime() + MY_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(local.getUTCDate(), lastDay);
  const result = Date.UTC(y, m, day, local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds());
  return new Date(result - MY_OFFSET_MS);
}

export const DAY_MS = 24 * 60 * 60_000;
