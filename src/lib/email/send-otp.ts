import "server-only";

import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to your .env before sending emails."
    );
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Sends a sign-in OTP code to a SCAR member's email via Resend.
 *
 * Intentionally does NOT catch/swallow errors — callers decide how to
 * surface delivery failures. This function should only ever be invoked
 * after the caller has already confirmed the recipient is an ACTIVE SCAR
 * member (see src/lib/members.ts + src/lib/auth.ts).
 */
export async function sendSignInOtpEmail({
  to,
  otp,
  firstName,
}: {
  to: string;
  otp: string;
  firstName: string;
}): Promise<void> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error(
      "EMAIL_FROM is not set. Add it to your .env before sending emails."
    );
  }

  const resend = getResendClient();

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Your SCAR Championship sign-in code: ${otp}`,
    text: `Hi ${firstName},\n\nYour SCAR Championship sign-in code is: ${otp}\n\nThis code expires in 5 minutes. If you didn't request this, you can safely ignore this email.\n\n— SCAR Championship`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
        <p style="color: #0d3b2e; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 600;">SCAR Championship</p>
        <p>Hi ${firstName},</p>
        <p>Your sign-in code is:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 0.15em; color: #0d3b2e;">${otp}</p>
        <p style="color: #6b7280; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send OTP email via Resend: ${error.message}`);
  }
}
