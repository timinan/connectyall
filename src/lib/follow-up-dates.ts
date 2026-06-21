// Parses the relative-date phrase the LLM emits and resolves it to an
// absolute timestamp at noon in the user's local timezone. Day-resolution
// only — no time-of-day support in v1.
//
// Supported phrases (case-insensitive, leading/trailing whitespace ok):
//   - "tomorrow" (optionally with trailing morning|afternoon|evening|night)
//   - "next week"
//   - "in N day[s]" / "in N week[s]" where N is a digit, word (one-ten), "a"/"an", "couple", "few"
//   - "by/on/next/this <weekday>" or bare weekday
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

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  couple: 2, few: 3,
};

function noonInTimezone(year: number, month: number, day: number, timezone: string): Date {
  const utcNoon = Date.UTC(year, month, day, 12, 0, 0);
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = formatter.formatToParts(new Date(utcNoon));
    const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')!.value, 10);
    const offsetMinutes = (12 * 60) - (hour * 60 + minute);
    return new Date(utcNoon + offsetMinutes * 60_000);
  } catch {
    return new Date(utcNoon);
  }
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// Map a quantity token like "3", "three", "a", "couple", "few" to a number.
// Returns null if the token isn't a known quantity.
function parseQuantity(token: string): number | null {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  if (NUMBER_WORDS[token] !== undefined) return NUMBER_WORDS[token];
  return null;
}

export function resolveRelativeDate(
  raw: string | null,
  anchorDate: Date,
  userTimezone: string,
): Date | null {
  if (!raw) return null;
  let text = raw.trim().toLowerCase();
  if (!text) return null;

  // Strip a leading "the" — "follow up the next week" cases
  text = text.replace(/^the\s+/, '');
  // Strip trailing time-of-day words — "tomorrow morning" → "tomorrow"
  text = text.replace(/\s+(morning|afternoon|evening|night|am|pm)$/, '');

  if (text === 'tomorrow') {
    const t = addDays(anchorDate, 1);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  if (text === 'next week' || text === 'in a week') {
    const t = addDays(anchorDate, 7);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  // "in <qty> <unit>" — qty can be digit, word, "a", "couple", "few"
  // optional second quantity word and optional "of" ("in a couple of days", "in a couple days")
  const inMatch = text.match(/^in\s+([a-z\d]+)(?:\s+([a-z]+))?(?:\s+of)?\s+(day|days|week|weeks)$/);
  if (inMatch) {
    // If there's a second token, try "a couple", "a few" style — second token is the real quantity
    const secondToken = inMatch[2];
    const firstToken = inMatch[1];
    const unit = inMatch[3];
    let qty: number | null = null;
    if (secondToken !== undefined) {
      // "in a couple days" → firstToken="a", secondToken="couple"
      // Try secondToken as the quantity, using firstToken as article (ignore it)
      qty = parseQuantity(secondToken);
      if (qty === null) {
        // Fallback: maybe firstToken is numeric and secondToken is something else
        qty = parseQuantity(firstToken);
      }
    } else {
      qty = parseQuantity(firstToken);
    }
    if (qty !== null) {
      const days = unit.startsWith('week') ? qty * 7 : qty;
      const t = addDays(anchorDate, days);
      return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
    }
  }

  // Weekday match — "by/on/next/this <weekday>" or bare "<weekday>"
  const weekdayMatch = text.match(/^(?:by\s+|on\s+|next\s+|this\s+)?([a-z]+)$/);
  if (weekdayMatch && WEEKDAYS[weekdayMatch[1]] !== undefined) {
    const targetDow = WEEKDAYS[weekdayMatch[1]];
    const currentDow = anchorDate.getUTCDay();
    let offset = (targetDow - currentDow + 7) % 7;
    if (offset === 0) offset = 7;
    const t = addDays(anchorDate, offset);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  return null;
}
