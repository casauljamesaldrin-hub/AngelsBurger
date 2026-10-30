export const peso = (c: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(c / 100);
export const toCentavos = (pesos: string | number) => Math.round(Number(pesos) * 100);
export const fromCentavos = (c: number) => (c / 100).toFixed(2);
export const num = (s: string | number) => { const n = Number(s); return Number.isFinite(n) ? String(Number(n.toFixed(3))) : String(s); };
export const when = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '';
export const stateOf = (q: string | number, min: string | number) => (Number(q) <= 0 ? 'OUT' : Number(q) <= Number(min) ? 'LOW' : 'IN');
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

/** Date only, same style as `when`: "2026-10-30" -> "Oct 30, 2026". */
export const day = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' }).format(
        new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00+08:00` : iso),
      )
    : '';

/** "PREPARATION_MISTAKE" -> "Preparation mistake". Text that is already readable is left as it is. */
export const humanize = (s: string | null | undefined) => {
  if (!s) return '';
  return /^[A-Z0-9_ ]+$/.test(s) ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : s;
};

/** "BEEF BURGER" -> "Beef Burger" */
export const titleCase = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());