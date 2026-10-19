import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** In tests, messages are collected here instead of being sent, so tests can read the codes. */
export const testOutbox: OutgoingMail[] = [];

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }
  return transporter;
}

export function isMailConfigured(): boolean {
  return Boolean(env.smtp.host);
}

/** Checks the SMTP login once at start-up so a wrong Gmail App Password shows up immediately. */
export async function verifyMailer(): Promise<void> {
  if (!isMailConfigured() || env.isTest) return;
  try {
    await getTransporter().verify();
    console.log('[mail] SMTP login OK — OTP emails will be sent.');
  } catch (err) {
    console.error(`[mail] SMTP login FAILED: ${(err as Error).message}`);
    console.error('[mail] Check SMTP_HOST / SMTP_USER / SMTP_PASSWORD in .env (for Gmail use a 16-letter App Password).');
  }
}

/**
 * Sends an email when SMTP is configured. Without SMTP (local development) the
 * message is printed to the server console instead, so codes never reach the browser.
 * Returns true when the message was actually emailed.
 */
export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  if (env.isTest) {
    testOutbox.push({ to, subject, text, html });
    return false;
  }
  if (!isMailConfigured()) {
    if (!env.isProduction) {
      console.log(`\n┌─ [DEV MAIL — SMTP not configured] ─────────────\n│ To: ${to}\n│ Subject: ${subject}\n└────────────────────────────────────────────────\n${text}\n`);
    }
    return false;
  }
  await getTransporter().sendMail({ from: env.smtp.from, to, subject, text, html });
  return true;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Simple branded HTML email with a large one-time code. */
export function codeEmailHtml(name: string, heading: string, intro: string, code: string, minutes: number): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:#065f46;color:#ffffff;padding:18px 24px;font-size:15px;font-weight:bold">Barangay Bang-Bang &middot; Smart Garbage Monitoring</td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h1>
<p style="font-size:14px;line-height:1.5;margin:0 0 16px">Hello ${escapeHtml(name)},<br>${escapeHtml(intro)}</p>
<div style="font-size:32px;letter-spacing:10px;font-weight:bold;text-align:center;background:#ecfdf5;color:#065f46;border:1px dashed #10b981;border-radius:10px;padding:14px 0;margin:0 0 16px">${escapeHtml(code)}</div>
<p style="font-size:13px;color:#6b7280;line-height:1.5;margin:0">This code expires in ${minutes} minutes. Do not share it with anyone &mdash; Barangay staff will never ask for it. If you did not request this, you can ignore this email.</p>
</td></tr></table>
<p style="font-size:11px;color:#9ca3af;margin-top:12px">Barangay Bang-Bang, Cordova, Cebu</p>
</td></tr></table></body></html>`;
}
