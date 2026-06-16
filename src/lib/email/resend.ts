import { Resend } from 'resend';
import { env } from '../env';

let cached: Resend | undefined;
function client() {
  if (!cached) cached = new Resend(env().RESEND_API_KEY);
  return cached;
}

export async function sendMagicLinkEmail(input: { to: string; url: string }): Promise<void> {
  const from = env().RESEND_FROM_EMAIL;
  // Always log the magic-link URL to the server console. On preview/dev this lets
  // us complete sign-in even when Resend's free tier blocks delivery to non-owner
  // emails (the 'onboarding@resend.dev' sender only delivers to the Resend
  // account's verified email otherwise).
  console.log('[magic-link]', { to: input.to, url: input.url });

  const result = await client().emails.send({
    from,
    to: input.to,
    subject: 'Your Connectyall sign-in link',
    text: `Hi,\n\nClick the link below to sign in to Connectyall:\n\n${input.url}\n\nThis link expires in 15 minutes. If you didn't request this, ignore the email.\n\n— Connectyall`,
    html: `<div style="font-family:system-ui;line-height:1.5;color:#111"><p>Hi,</p><p>Click the button below to sign in to Connectyall:</p><p><a href="${input.url}" style="display:inline-block;padding:10px 16px;background:#0E7C7B;color:#fff;text-decoration:none;border-radius:6px">Sign in</a></p><p>This link expires in 15 minutes. If you didn't request this, ignore the email.</p><p style="color:#666;font-size:13px">— Connectyall</p></div>`,
  });
  if (result.error) {
    console.error('[resend] send failed', {
      to: input.to,
      from,
      name: result.error.name,
      message: result.error.message,
    });
    // Don't throw — we want the sign-in flow to still succeed at the Better Auth
    // layer so the magic-link URL stays valid. The user can grab it from server logs.
  }
}
