import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Download, History, Trash2 } from 'lucide-react';
import { api, apiUrl, qs } from '../lib/api';
import { humanize, num } from '../lib/format';
import { iconOf } from '../lib/ingredientMeta';
import { Badge, Empty, ErrorBox, Loading, PageHead, Pager } from '../components/ui';

const TYPES = ['STOCK_IN', 'STOCK_OUT', 'WASTE', 'ADJUSTMENT', 'ORDER_DEDUCTION', 'REVERSAL'];
const EMPTY = { type: '', from: '', to: '', ingredientId: '', page: 1 };

const iso = (d: Date) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

function dayLabel(d: Date) {
  const key = iso(d);
  if (key === daysAgo(0)) return 'Today';
  if (key === daysAgo(1)) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{label}</div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}

export default function Transactions() {
  const [p, setP] = useState(EMPTY);
  const ings = useQuery({ queryKey: ['ing-all'], queryFn: () => api('/ingredients?pageSize=100&active=all') });
  const q = useQuery({ queryKey: ['tx', p], queryFn: () => api(`/transactions${qs({ ...p, pageSize: 20 })}`) });
  // Larger sample with the same filters, used only for the summary cards.
  const sum = useQuery({ queryKey: ['tx-sum', { ...p, page: 0 }], queryFn: () => api(`/transactions${qs({ ...p, page: 1, pageSize: 100 })}`) });
  const filt = qs({ ...p, page: undefined });
  const filtered = !!(p.type || p.ingredientId || p.from || p.to);
  const setRange = (from: string, to: string) => setP({ ...p, from, to, page: 1 });

  const sample: any[] = sum.data?.items ?? [];
  const partial = (sum.data?.total ?? 0) > sample.length ? '+' : '';
  const count = (types: string[]) => sample.filter((t) => types.includes(t.type)).length;

  // Group the current page of rows by day.
  const groups: { label: string; rows: any[] }[] = [];
  (q.data?.items ?? []).forEach((t: any) => {
    const label = dayLabel(new Date(t.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(t); else groups.push({ label, rows: [t] });
  });

  const chip = (active: boolean) => `btn !py-1 !px-3 ${active ? '!bg-ink !text-white' : ''}`;
  const isRange = (from: string, to: string) => p.from === from && p.to === to;

  return (
    <>
      <PageHead title="Stock history"><a className="btn" href={apiUrl(`/transactions/export.csv${filt}`)}><Download size={16} />Export CSV</a></PageHead>
      <p className="-mt-2 mb-4 text-sm text-neutral-600">Every change to stock is recorded here and cannot be edited. Mistakes are fixed with an adjustment or reversal.</p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="border-sky-200 bg-gradient-to-br from-sky-50 to-white" label="Movements" icon={<History size={18} className="text-sky-600" />} value={sum.data?.total ?? '—'} />
        <Stat tone="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white" label="Stock received" icon={<ArrowDownToLine size={18} className="text-emerald-600" />} value={sum.data ? `${count(['STOCK_IN'])}${partial}` : '—'} />
        <Stat tone="border-amber-200 bg-gradient-to-br from-amber-50 to-white" label="Used in orders" icon={<ArrowUpFromLine size={18} className="text-amber-600" />} value={sum.data ? `${count(['ORDER_DEDUCTION', 'STOCK_OUT'])}${partial}` : '—'} />
        <Stat tone="border-red-200 bg-gradient-to-br from-red-50 to-white" label="Waste" icon={<Trash2 size={18} className="text-red-600" />} value={sum.data ? `${count(['WASTE'])}${partial}` : '—'} />
      </div>

      <div className="card !rounded-2xl mb-4 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="label">Type</span>
            <select className="input !h-10 !w-auto" value={p.type} onChange={(e) => setP({ ...p, type: e.target.value, page: 1 })}>
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Ingredient</span>
            <select className="input !h-10 !w-auto" value={p.ingredientId} onChange={(e) => setP({ ...p, ingredientId: e.target.value, page: 1 })}>
              <option value="">All ingredients</option>
              {ings.data?.items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">From</span><input className="input !h-10 !w-auto" type="date" max={p.to || undefined} value={p.from} onChange={(e) => setP({ ...p, from: e.target.value, page: 1 })} /></label>
          <label className="block"><span className="label">To</span><input className="input !h-10 !w-auto" type="date" min={p.from || undefined} value={p.to} onChange={(e) => setP({ ...p, to: e.target.value, page: 1 })} /></label>
          <div className="flex flex-wrap items-center gap-2 pb-0.5">
            <button className={chip(isRange(daysAgo(0), daysAgo(0)))} onClick={() => setRange(daysAgo(0), daysAgo(0))}>Today</button>
            <button className={chip(isRange(daysAgo(1), daysAgo(1)))} onClick={() => setRange(daysAgo(1), daysAgo(1))}>Yesterday</button>
            <button className={chip(isRange(daysAgo(6), daysAgo(0)))} onClick={() => setRange(daysAgo(6), daysAgo(0))}>Last 7 days</button>
            {filtered && <button className="btn !py-1 !px-3" onClick={() => setP(EMPTY)}>Clear filters</button>}
          </div>
        </div>
      </div>

      <div className="card !rounded-2xl overflow-x-auto">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data.items.length ? <Empty title="No movements match" hint="Try clearing the filters." /> : (<>
          <table className="w-full">
            <thead className="border-b border-line bg-neutral-50"><tr>{['Time', 'Ingredient', 'Type', 'Change', 'Before → after', 'Order', 'By'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            {groups.map((g) => (
              <tbody key={g.label} className="divide-y divide-line">
                <tr><td colSpan={7} className="border-t border-line bg-neutral-100 px-4 py-1.5 text-xs font-semibold text-neutral-600">{g.label}</td></tr>
                {g.rows.map((t: any) => {
                  const n = Number(t.quantityChange);
                  return (
                    <tr key={t.id}>
                      <td className="td whitespace-nowrap text-neutral-600">{new Date(t.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</td>
                      <td className="td font-medium">
                        <span className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-orange-50 text-lg" aria-hidden>{iconOf(t.ingredient.name)}</span>{t.ingredient.name}</span>
                      </td>
                      <td className="td">
                        <Badge v={t.type} />
                        {/* Order deductions already say it all; show the reason only when it adds something. */}
                        {t.type !== 'ORDER_DEDUCTION' && t.reason && <span className="mt-1 block text-xs text-neutral-600">{humanize(t.reason)}</span>}
                        {t.notes && <span className="block text-xs text-neutral-500">{t.notes}</span>}
                      </td>
                      <td className={`td whitespace-nowrap font-semibold ${n > 0 ? 'text-green-700' : n < 0 ? 'text-red-700' : ''}`}>{n > 0 ? '▲ +' : n < 0 ? '▼ ' : ''}{num(t.quantityChange)} {t.unit}</td>
                      <td className="td whitespace-nowrap text-neutral-700">{num(t.quantityBefore)} → <b>{num(t.quantityAfter)}</b></td>
                      <td className="td whitespace-nowrap">{t.order?.orderNumber ? <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-semibold">{t.order.orderNumber}</span> : <span className="text-neutral-400">—</span>}</td>
                      <td className="td">{t.user.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
          <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setP({ ...p, page })} /></>)}
      </div>
    </>
  );
}