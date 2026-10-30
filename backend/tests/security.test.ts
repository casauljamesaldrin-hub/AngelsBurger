import { afterEach, describe, expect, it, vi } from 'vitest';
import { csvCell } from '../src/lib/csv';
import { hashToken, newToken } from '../src/lib/tokens';
import { esc, passwordResetEmail } from '../src/services/email.templates';
import { emailConfigured, sendEmail } from '../src/services/email.service';

describe('csv', () => {
  it('neutralises formula injection', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });
  it('quotes commas', () => expect(csvCell('a,b')).toBe('"a,b"'));
});

describe('reset tokens', () => {
  it('are random and only the hash is derivable', () => {
    const a = newToken(), b = newToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toHaveLength(64);
    expect(hashToken(a.token)).toBe(a.hash);
    expect(a.hash).not.toBe(a.token);
  });
});

describe('templates', () => {
  it('escapes dynamic content', () => {
    expect(esc('<script>"x"</script>')).not.toContain('<script>');
    expect(passwordResetEmail('<b>Bob</b>', 'https://x/y', 30).html).not.toContain('<b>Bob</b>');
  });
});

describe('email service', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); });
  const mail = { to: 'a@b.com', subject: 's', html: '<p>x</p>', text: 'x' };

  it('reports missing configuration and never calls the provider', async () => {
    delete process.env.BREVO_API_KEY;
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const r = await sendEmail(mail);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('EMAIL_NOT_CONFIGURED');
    expect(emailConfigured()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  function configure() { Object.assign(process.env, { BREVO_API_KEY: 'k', BREVO_SENDER_EMAIL: 's@x.com', BREVO_SENDER_NAME: 'S' }); }

  it('returns the provider message id on acceptance', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: '<abc>' }) }));
    expect(await sendEmail(mail)).toEqual({ ok: true, messageId: '<abc>' });
  });
  it('reports provider failures honestly without leaking the key', async () => {
    configure();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ code: 'unauthorized' }) }));
    const r = await sendEmail(mail);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('PROVIDER_REJECTED'); expect(r.retryable).toBe(false); }
    expect(JSON.stringify(log.mock.calls)).not.toContain('"k"');
    log.mockRestore();
  });
  it('marks 5xx and network errors retryable', async () => {
    configure();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    const r = await sendEmail(mail);
    if (!r.ok) expect(r.retryable).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const n = await sendEmail(mail);
    if (!n.ok) expect(n.code).toBe('NETWORK_ERROR');
  });
});
