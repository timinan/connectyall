import { env } from './env';

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return env().ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).includes(email.toLowerCase());
}
