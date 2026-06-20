// Parses the relative-date phrase the LLM emits and resolves it to an
// absolute timestamp at noon in the user's local timezone. Day-resolution
// only — no time-of-day support in v1.
//
// Supported phrases (case-insensitive):
//   - "tomorrow"                     → anchor + 1 day at noon local
//   - "in N day[s]"                  → anchor + N days at noon local
//   - "in N week[s]"                 → anchor + (N * 7) days at noon local
//   - "next week"                    → anchor + 7 days at noon local
//   - "by <weekday>" / "<weekday>"   → next occurrence of that weekday
//
// Returns null for null, empty, or un-parseable input.

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function noonInTimezone(year: number, month: number, day: number, timezone: string): Date {
  // Build a UTC date that represents noon-local in the target timezone.
  // We use Intl.DateTimeFormat to find what UTC moment corresponds to local
  // noon — accounts for DST.
  const utcNoon = Date.UTC(year, month, day, 12, 0, 0);
  try {
    // What "wall clock time" does this UTC moment display as in `timezone`?
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = formatter.formatToParts(new Date(utcNoon));
    const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')!.value, 10);
    // If the local displayed time isn't 12:00, shift by the difference.
    const offsetMinutes = (12 * 60) - (hour * 60 + minute);
    return new Date(utcNoon + offsetMinutes * 60_000);
  } catch {
    // Invalid timezone → fall back to UTC noon.
    return new Date(utcNoon);
  }
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function resolveRelativeDate(
  raw: string | null,
  anchorDate: Date,
  userTimezone: string,
): Date | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  // "tomorrow"
  if (text === 'tomorrow') {
    const t = addDays(anchorDate, 1);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  // "next week"
  if (text === 'next week') {
    const t = addDays(anchorDate, 7);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  // "in N day[s]" or "in N week[s]"
  const inMatch = text.match(/^in\s+(\d+)\s+(day|days|week|weeks)$/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const days = inMatch[2].startsWith('week') ? n * 7 : n;
    const t = addDays(anchorDate, days);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  // "by <weekday>" or just "<weekday>"
  const weekdayMatch = text.match(/^(?:by\s+|on\s+|next\s+)?([a-z]+)$/);
  if (weekdayMatch && WEEKDAYS[weekdayMatch[1]] !== undefined) {
    const targetDow = WEEKDAYS[weekdayMatch[1]];
    const currentDow = anchorDate.getUTCDay();
    let offset = (targetDow - currentDow + 7) % 7;
    if (offset === 0) offset = 7; // "by Friday" on a Friday → next Friday
    const t = addDays(anchorDate, offset);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  return null;
}
