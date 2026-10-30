export const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface Rendered { subject: string; html: string; text: string }

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f2f3f1;font-family:Arial,Helvetica,sans-serif;color:#20201e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:8px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td style="background:#b8321f;color:#fff;padding:16px 24px;font-size:18px;font-weight:bold">Angels Burger Inventory</td></tr>
<tr><td style="padding:24px;line-height:1.5"><h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:12px 24px;font-size:12px;color:#6b6b66;background:#fafaf8">Automated message from your inventory system. Do not reply with sensitive information.</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href: string, label: string) =>
  `<p><a href="${esc(href)}" style="display:inline-block;background:#b8321f;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(label)}</a></p>`;

export const passwordResetEmail = (name: string, link: string, minutes: number): Rendered => ({
  subject: 'Reset your Angels Burger Inventory password',
  html: layout('Reset your password', `<p>Hi ${esc(name)},</p><p>We received a request to reset your password. This link works once and expires in ${minutes} minutes.</p>${button(link, 'Choose a new password')}<p>If you did not ask for this, you can ignore this email.</p>`),
  text: `Hi ${name},\n\nReset your password (link works once, expires in ${minutes} minutes):\n${link}\n\nIf you did not ask for this, ignore this email.`,
});

export const stockAlertEmail = (kind: 'LOW' | 'OUT', i: { name: string; quantity: string; unit: string; min: string; link: string }): Rendered => {
  const low = kind === 'LOW';
  const subject = low ? `Low stock: ${i.name}` : `Out of stock: ${i.name}`;
  const lead = low ? `${i.name} is at or below its minimum level.` : `${i.name} has run out.`;
  return {
    subject,
    html: layout(subject, `<p>${esc(lead)}</p><p>Current: <b>${esc(i.quantity)} ${esc(i.unit)}</b><br>Minimum: ${esc(i.min)} ${esc(i.unit)}</p><p>Next step: reorder and record the delivery under Stock-in.</p>${button(i.link, 'Open inventory')}`),
    text: `${lead}\nCurrent: ${i.quantity} ${i.unit}\nMinimum: ${i.min} ${i.unit}\nNext step: reorder and record the delivery.\n${i.link}`,
  };
};

export interface DailySummary {
  date: string; orders: number; revenue: string;
  top: { name: string; qty: number }[]; restock: { name: string; quantity: string; unit: string }[];
  waste: { name: string; quantity: string; unit: string }[]; link: string;
}
export const dailySummaryEmail = (s: DailySummary): Rendered => {
  const list = (a: string[]) => (a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>None</p>');
  const top = s.top.map((t) => `${t.name} x ${t.qty}`);
  const restock = s.restock.map((r) => `${r.name}: ${r.quantity} ${r.unit}`);
  const waste = s.waste.map((w) => `${w.name}: ${w.quantity} ${w.unit}`);
  return {
    subject: `Daily summary for ${s.date}`,
    html: layout(`Daily summary for ${s.date}`, `<p>Completed orders: <b>${s.orders}</b><br>Recorded sales revenue: <b>${esc(s.revenue)}</b></p><h3>Top products</h3>${list(top)}<h3>Needs restocking</h3>${list(restock)}<h3>Waste recorded</h3>${list(waste)}${button(s.link, 'Open dashboard')}`),
    text: `Daily summary ${s.date}\nCompleted orders: ${s.orders}\nRecorded sales revenue: ${s.revenue}\nTop: ${top.join('; ') || 'none'}\nRestock: ${restock.join('; ') || 'none'}\nWaste: ${waste.join('; ') || 'none'}\n${s.link}`,
  };
};

export const testEmail = (by: string): Rendered => ({
  subject: 'Angels Burger Inventory test email',
  html: layout('Test email', `<p>This test was requested by ${esc(by)}. If you can read it, Brevo accepted and delivered it.</p>`),
  text: `This test was requested by ${by}.`,
});
