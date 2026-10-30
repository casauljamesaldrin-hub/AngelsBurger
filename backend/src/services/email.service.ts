export interface SendInput { to: string; subject: string; html: string; text: string }
export type SendResult =
  | { ok: true; messageId?: string }
  | { ok: false; code: 'EMAIL_NOT_CONFIGURED' | 'PROVIDER_REJECTED' | 'NETWORK_ERROR'; message: string; retryable: boolean };

const REQUIRED = ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME'] as const;

export const missingEmailConfig = () => REQUIRED.filter((k) => !process.env[k]);
export const emailConfigured = () => missingEmailConfig().length === 0;

/**
 * Sends through Brevo's transactional API. "ok" only means Brevo ACCEPTED the request;
 * it does not prove inbox delivery.
 */
export async function sendEmail(input: SendInput): Promise<SendResult> {
  const missing = missingEmailConfig();
  if (missing.length) {
    return { ok: false, code: 'EMAIL_NOT_CONFIGURED', retryable: false, message: `Email is not configured. Missing: ${missing.join(', ')}` };
  }
  const body: Record<string, unknown> = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME },
    to: [{ email: input.to }],
    subject: input.subject,
    htmlContent: input.html,
    textContent: input.text,
  };
  if (process.env.BREVO_REPLY_TO_EMAIL) body.replyTo = { email: process.env.BREVO_REPLY_TO_EMAIL };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      return { ok: true, messageId: data?.messageId };
    }
    const err: any = await res.json().catch(() => ({}));
    const retryable = res.status >= 500 || res.status === 429;
    // Log only status and Brevo's error code - never the key, recipient content or body.
    console.error(`[email] Brevo rejected request: status=${res.status} code=${err?.code ?? 'unknown'}`);
    return { ok: false, code: 'PROVIDER_REJECTED', retryable, message: `Brevo rejected the email (${res.status}${err?.code ? ' ' + err.code : ''}).` };
  } catch {
    console.error('[email] network error contacting Brevo');
    return { ok: false, code: 'NETWORK_ERROR', retryable: true, message: 'Could not reach Brevo.' };
  }
}
