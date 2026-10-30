import { useState } from 'react';
import { Banknote, CreditCard, Download, Printer, Receipt, ShoppingBag, Smartphone, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { peso, todayIso } from '../lib/format';
import { Preset, rangeFor, useDailySales } from '../lib/dailySales';
import { iconOf } from '../lib/ingredientMeta';
import { Empty, ErrorBox, Loading, PageHead } from '../components/ui';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'This month' }, { id: 'custom', label: 'Custom' },
];

const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const pesos = (c: number) => (c / 100).toFixed(2);
const METHOD: Record<string, string> = { CASH: 'Cash', GCASH: 'GCash', CARD: 'Card', OTHER: 'Other', NONE: 'Not recorded' };
const METHOD_STYLE: Record<string, { icon: React.ReactNode; tone: string; bar: string }> = {
  CASH: { icon: <Banknote size={18} className="text-emerald-600" />, tone: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white', bar: 'bg-emerald-500' },
  GCASH: { icon: <Smartphone size={18} className="text-sky-600" />, tone: 'border-sky-200 bg-gradient-to-br from-sky-50 to-white', bar: 'bg-sky-500' },
  CARD: { icon: <CreditCard size={18} className="text-violet-600" />, tone: 'border-violet-200 bg-gradient-to-br from-violet-50 to-white', bar: 'bg-violet-500' },
};
const DEFAULT_METHOD = { icon: <Wallet size={18} className="text-neutral-600" />, tone: 'border-neutral-200 bg-gradient-to-br from-neutral-50 to-white', bar: 'bg-neutral-500' };

const niceDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const productIcon = (name: string) => (/sandwich/i.test(name) ? '🥪' : iconOf(name) === '📦' ? '🍽️' : iconOf(name));

function Stat({ icon, label, tone, children, sub }: { icon: React.ReactNode; label: string; tone: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{label}</div>
      <div className="mt-2 text-2xl font-bold text-ink">{children}</div>
      {sub && <div className="mt-1 text-xs text-neutral-600">{sub}</div>}
    </div>
  );
}

export default function DailySalesPage() {
  const { me } = useAuth();
  const [preset, setPreset] = useState<Preset>('today');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const { from, to } = rangeFor(preset, custom);
  const q = useDailySales(from, to, preset === 'today');

  if (me && me.role !== 'ADMIN') return <Empty title="Admins only" hint="Sales and income figures are only available to admin accounts." />;

  function exportCsv() {
    if (!q.data) return;
    const rows = [['Product', 'Qty sold', 'Price each (PHP)', 'Total sales (PHP)'],
      ...q.data.products.map((p) => [p.productName, p.quantity, pesos(p.unitPriceCentavos), pesos(p.totalCentavos)]),
      ['TOTAL', q.data.totals.itemsSold, '', pesos(q.data.totals.incomeCentavos)]];
    const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `daily-sales-${from}_${to}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const d = q.data;
  const income = d?.totals.incomeCentavos ?? 0;
  const avgOrder = d && d.totals.orders > 0 ? Math.round(income / d.totals.orders) : 0;
  const topSeller = d && d.products.length ? [...d.products].sort((a, b) => b.quantity - a.quantity)[0] : null;
  const maxDay = d ? Math.max(1, ...d.daily.map((x) => x.incomeCentavos)) : 1;

  return (
    <>
            <PageHead title="Daily sales" />
      <p className="-mt-2 mb-4 text-sm text-neutral-600">See what sold, how much came in and how customers paid.</p>

      <div className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        {PRESETS.map((p) => <button key={p.id} className={`btn ${preset === p.id ? 'btn-primary' : ''}`} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</button>)}
        {preset === 'custom' && (<>
          <label className="block"><span className="label">From</span><input className="input" type="date" max={custom.to || undefined} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
          <label className="block"><span className="label">To</span><input className="input" type="date" min={custom.from || undefined} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
        </>)}
      </div>

      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !d ? <Empty title="Pick a start and end date" /> : (<>
        <section className="mb-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-5">
          <p className="text-sm font-semibold text-neutral-600">Total income · {d.range.from === d.range.to ? niceDay(d.range.from) : `${niceDay(d.range.from)} to ${niceDay(d.range.to)}`}</p>
          <p className="mt-1 text-4xl font-extrabold text-ink">{peso(d.totals.incomeCentavos)}</p>
          <p className="mt-2 text-xs text-neutral-600">
            Only completed orders count. Cancelled orders are excluded{d.cancelledOrders > 0 ? ` (${d.cancelledOrders} in this period)` : ''}.
            This is sales revenue, not profit: ingredient costs and other expenses are not deducted.
          </p>
        </section>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat tone="border-sky-200 bg-gradient-to-br from-sky-50 to-white" label="Completed orders" icon={<Receipt size={18} className="text-sky-600" />}>{d.totals.orders}</Stat>
          <Stat tone="border-amber-200 bg-gradient-to-br from-amber-50 to-white" label="Items sold" icon={<ShoppingBag size={18} className="text-amber-600" />}>{d.totals.itemsSold}</Stat>
          <Stat tone="border-violet-200 bg-gradient-to-br from-violet-50 to-white" label="Average order" icon={<TrendingUp size={18} className="text-violet-600" />}>{peso(avgOrder)}</Stat>
          <Stat tone="border-rose-200 bg-gradient-to-br from-rose-50 to-white" label="Top seller" icon={<Trophy size={18} className="text-rose-600" />}
            sub={topSeller ? `${topSeller.quantity} sold` : undefined}>
            <span className="text-lg capitalize">{topSeller ? topSeller.productName.toLowerCase() : '—'}</span>
          </Stat>
        </div>

        {d.payments.length > 0 && (
          <section className="mb-4" aria-label="Income by payment method">
            <h2 className="mb-2 text-sm font-semibold text-neutral-600">Paid by</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{d.payments.map((x) => {
              const st = METHOD_STYLE[x.method] ?? DEFAULT_METHOD;
              const share = income > 0 ? Math.round((x.incomeCentavos / income) * 100) : 0;
              return (
                <div key={x.method} className={`rounded-2xl border p-4 ${st.tone}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold">{st.icon}{METHOD[x.method] ?? x.method}</div>
                  <p className="mt-1 text-xl font-bold text-ink">{peso(x.incomeCentavos)}</p>
                  <div className="mt-2 h-1.5 rounded bg-neutral-200" aria-hidden><div className={`h-1.5 rounded ${st.bar}`} style={{ width: `${share}%` }} /></div>
                  <p className="mt-1 text-xs text-neutral-600">{x.orders} order{x.orders === 1 ? '' : 's'} · {share}% of income</p>
                </div>);
            })}</div>
          </section>)}

        <h2 className="mb-2 text-sm font-semibold text-neutral-600">What sold</h2>
        <div className="card !rounded-2xl mb-4 overflow-x-auto">
          {d.products.length === 0 ? <Empty title="No completed sales in this period" hint="An order counts as a sale once it is marked completed on the Orders page." /> : (
            <table className="w-full">
              <thead className="border-b border-line bg-neutral-50"><tr>
                <th className="th w-10">#</th>
                {['Product', 'Qty sold', 'Price each', 'Total sales'].map((h, i) => <th key={h} className={`th ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}
                <th className="th w-40">Share of income</th>
              </tr></thead>
              <tbody className="divide-y divide-line">{d.products.map((p, idx) => {
                const share = income > 0 ? (p.totalCentavos / income) * 100 : 0;
                return (
                  <tr key={`${p.productId}-${p.unitPriceCentavos}`}>
                    <td className="td text-neutral-500">{idx + 1}</td>
                    <td className="td font-medium"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-orange-50 text-xl" aria-hidden>{productIcon(p.productName)}</span><span className="capitalize">{p.productName.toLowerCase()}</span></span></td>
                    <td className="td text-right">{p.quantity}</td>
                    <td className="td text-right">{peso(p.unitPriceCentavos)}</td>
                    <td className="td text-right font-semibold">{peso(p.totalCentavos)}</td>
                    <td className="td"><div className="flex items-center gap-2"><div className="h-2 flex-1 rounded bg-neutral-200" aria-hidden><div className="h-2 rounded bg-pickle" style={{ width: `${share}%` }} /></div><span className="w-9 text-right text-xs text-neutral-600">{Math.round(share)}%</span></div></td>
                  </tr>);
              })}</tbody>
              <tfoot className="border-t border-line bg-neutral-50"><tr className="font-bold">
                <td className="td" /><td className="td">Total</td><td className="td text-right">{d.totals.itemsSold}</td><td className="td" /><td className="td text-right">{peso(d.totals.incomeCentavos)}</td><td className="td" />
              </tr></tfoot>
            </table>)}
        </div>

        {d.daily.length > 1 && (<>
          <h2 className="mb-2 text-sm font-semibold text-neutral-600">Income by day</h2>
          <div className="card !rounded-2xl overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-neutral-50"><tr>{['Date', 'Orders', 'Income'].map((h, i) => <th key={h} className={`th ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}<th className="th w-56">Compared with best day</th></tr></thead>
              <tbody className="divide-y divide-line">{d.daily.map((x) => (
                <tr key={x.day}>
                  <td className="td">{niceDay(x.day)}</td><td className="td text-right">{x.orders}</td><td className="td text-right font-semibold">{peso(x.incomeCentavos)}</td>
                  <td className="td"><div className="h-2 rounded bg-neutral-200" aria-hidden><div className="h-2 rounded bg-bun" style={{ width: `${(x.incomeCentavos / maxDay) * 100}%` }} /></div></td>
                </tr>))}</tbody>
            </table>
          </div>
        </>)}
      </>)}
    </>
  );
}