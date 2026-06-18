const FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const FORMATTER_WITH_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function relativeDate(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const dayDiff = Math.round(
    (startOfUTCDay(now).getTime() - startOfUTCDay(then).getTime()) / 86_400_000
  );

  if (dayDiff <= 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 7) return `${dayDiff} days ago`;

  if (then.getUTCFullYear() === now.getUTCFullYear()) return FORMATTER.format(then);
  return FORMATTER_WITH_YEAR.format(then);
}
