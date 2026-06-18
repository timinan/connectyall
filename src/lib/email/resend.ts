import { Resend } from 'resend';
import { env } from '../env';

let cached: Resend | undefined;
function client() {
  if (!cached) cached = new Resend(env().RESEND_API_KEY);
  return cached;
}

export async function sendOTPEmail(input: { to: string; otp: string }): Promise<void> {
  const from = env().RESEND_FROM_EMAIL;
  // Log the OTP to the server console too — same reason as the magic-link version:
  // Resend's free tier blocks delivery to non-account emails, so we keep a way to
  // grab the code from server logs during preview testing.
  console.log('[otp]', { to: input.to, otp: input.otp });

  const result = await client().emails.send({
    from,
    to: input.to,
    subject: `${input.otp} is your Connectyall sign-in code`,
    text: `Your Connectyall sign-in code is:\n\n${input.otp}\n\nIt expires in 10 minutes. If you didn't request this, ignore the email.\n\n— Connectyall`,
    html: `<div style="font-family:system-ui;line-height:1.5;color:#111"><p>Your Connectyall sign-in code is:</p><p style="font-size:32px;font-weight:800;letter-spacing:6px;background:#F3E8FF;color:#7C5CFF;padding:14px 20px;border-radius:10px;display:inline-block">${input.otp}</p><p>It expires in 10 minutes. If you didn't request this, ignore the email.</p><p style="color:#666;font-size:13px">— Connectyall</p></div>`,
  });
  if (result.error) {
    console.error('[resend] send failed', {
      to: input.to,
      from,
      name: result.error.name,
      message: result.error.message,
    });
    // Don't throw — same reasoning as before. The code stays valid on the auth
    // layer and is retrievable from server logs.
  }
}
