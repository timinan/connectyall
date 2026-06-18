export function getFirstName(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

export function getGreetingLabel(displayName: string | null | undefined, now: Date = new Date()): string {
  const firstName = getFirstName(displayName);
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'MORNING' : hour < 18 ? 'AFTERNOON' : 'EVENING';
  return firstName ? `GOOD ${timeOfDay}, ${firstName.toUpperCase()}` : `GOOD ${timeOfDay}`;
}
