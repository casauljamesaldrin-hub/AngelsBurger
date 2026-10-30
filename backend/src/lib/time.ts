/** The store runs on Asia/Manila (UTC+8, no daylight saving). */
export const TZ = 'Asia/Manila';
export const todayManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
export function dayRange(dateStr: string) {
  const from = new Date(`${dateStr}T00:00:00+08:00`);
  const to = new Date(from.getTime() + 24 * 3600 * 1000);
  return { from, to };
}
export function rangeFromQuery(q: any) {
  const f = /^\d{4}-\d{2}-\d{2}$/.test(q.from ?? '') ? q.from : todayManila();
  const t = /^\d{4}-\d{2}-\d{2}$/.test(q.to ?? '') ? q.to : f;
  return { from: dayRange(f).from, to: dayRange(t).to, fromStr: f, toStr: t };
}
