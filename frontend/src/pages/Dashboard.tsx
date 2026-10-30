import { ReactNode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Boxes, CheckCircle2, Flame, Plus, UtensilsCrossed } from 'lucide-react';
import { api } from '../lib/api';
import { num, peso, when } from '../lib/format';
import { Badge, Empty, ErrorBox, Loading, PageHead } from '../components/ui';
import { Link } from 'react-router-dom';
import { DailyIncomeCard } from '../components/DailyIncomeCard';

type Tone = 'warn' | 'danger';

const toneCard: Record<Tone, string> = {
  warn: 'border-amber-300 bg-amber-50',
  danger: 'border-red-300 bg-red-50',
};
const toneValue: Record<Tone, string> = {
  warn: 'text-amber-700',
  danger: 'text-red-700',
};

function Stat({ label, value, note, to, tone, icon }: {
  label: string;
  value: string | number;
  note?: string;
  to?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const cls = `card p-4 block ${tone ? toneCard[tone] : ''} ${to ? 'transition-shadow hover:shadow-md' : ''}`;
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-sm text-neutral-700">{icon}{label}</p>
      <p className={`text-2xl font-bold font-display mt-1 ${tone ? toneValue[tone] : ''}`}>{value}</p>
      {note && <p className="text-xs text-neutral-600 mt-1">{note}</p>}
    </>
  );
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

const rankCls = [
  'bg-amber-400 text-neutral-900',
  'bg-slate-200 text-slate-700',
  'bg-slate-200 text-slate-600',
  'bg-slate-100 text-slate-500',
  'bg-slate-100 text-slate-500',
];

// "2026-10-29" -> "Oct 29" (week/month labels are left as they are)
const fmtLabel = (l: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(l)
    ? new Date(`${l}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : l;

export default function Dashboard() {
  const [period, setPeriod] = useState('day');
  const s = useQuery({ queryKey: ['dash'], queryFn: () => api('/dashboard/summary') });
  const sales = useQuery({
    queryKey: ['sales', period],
    queryFn: () => api(`/dashboard/sales?period=${period}&days=${period === 'day' ? 14 : period === 'week' ? 90 : 365}`),
  });
  if (s.isLoading) return <Loading />;
  if (s.error) return <ErrorBox error={s.error} />;
  const d = s.data;
  const t = d.today;
  const needsRestock = [...d.outOfStock, ...d.lowStock];

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0"><PageHead title="Dashboard" /></div>
      </div>

      {/* Today's income already shows sales total, completed orders and items sold */}
      <DailyIncomeCard />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Stat
          label="Low stock"
          value={d.lowStock.length}
          to="/inventory"
          tone={d.lowStock.length > 0 ? 'warn' : undefined}
          icon={d.lowStock.length > 0 ? <AlertTriangle size={14} /> : undefined}
          note={d.lowStock.length > 0 ? 'Needs attention' : 'All good'}
        />
        <Stat
          label="Out of stock"
          value={d.outOfStock.length}
          to="/inventory"
          tone={d.outOfStock.length > 0 ? 'danger' : undefined}
          icon={d.outOfStock.length > 0 ? <AlertTriangle size={14} /> : undefined}
          note={d.outOfStock.length > 0 ? 'Restock now' : 'All good'}
        />
        <Stat
            label="Inventory value"
            value={peso(d.inventoryValueCentavos)}
            to="/inventory"
            note={d.inventoryValueComplete ? undefined : 'Some ingredients have no unit cost'}
          />
        <Stat
            label="Waste today"
            value={peso(t.wasteCostCentavos)}
            to="/transactions"
            tone={t.wasteCostCentavos > 0 ? 'warn' : undefined}
            note={t.wasteCostComplete ? `${t.waste.length} item(s)` : 'Cost incomplete'}
          />
      </div>

      {/* Rarely-changing counts, kept small */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link to="/inventory" className="group inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:border-bun hover:bg-bun hover:text-ink">
          <Boxes size={16} className="text-neutral-500 group-hover:text-ink" />
          <b className="text-neutral-900">{d.activeIngredients}</b> ingredients
        </Link>
        <Link to="/menu" className="group inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:border-bun hover:bg-bun hover:text-ink">
          <UtensilsCrossed size={16} className="text-neutral-500 group-hover:text-ink" />
          <b className="text-neutral-900">{d.activeProducts}</b> menu products
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">Completed sales</h2>
            <select className="input !w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
              <option value="day">By day</option>
              <option value="week">By week</option>
              <option value="month">By month</option>
            </select>
          </div>
          {sales.data?.length ? (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={sales.data.map((r: any) => ({ ...r, php: r.revenue / 100 }))} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} tickFormatter={fmtLabel} />
                  <YAxis fontSize={12} width={56} tickFormatter={(v: number) => `₱${v}`} />
                  <Tooltip
                    formatter={(v: number) => [peso(v * 100), 'Sales']}
                    labelFormatter={(l: string) => fmtLabel(l)}
                  />
                  <Bar dataKey="php" fill="#b8321f" radius={[3, 3, 0, 0]} maxBarSize={56}>
                    <LabelList dataKey="php" position="top" fontSize={11} formatter={(v: number) => `₱${Math.round(v)}`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty title="No completed sales yet" hint="Sales appear here once orders are marked completed." />}
        </section>

        <section className="card p-4">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Flame size={22} className="text-red-500" />Best Sellers Today
              </h2>
              <p className="text-sm text-neutral-500">Top performing menu items</p>
            </div>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Live</span>
          </div>
          {t.topProducts.length ? (
            <ol className="space-y-3">
              {t.topProducts.map((p: any, i: number) => (
                <li key={p.name} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${rankCls[Math.min(i, rankCls.length - 1)]}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold uppercase text-neutral-900">{p.name}</p>
                    <p className="text-xs text-neutral-500">{p.qty} {Number(p.qty) === 1 ? 'unit' : 'units'} sold</p>
                  </div>
                  {p.revenueCentavos != null && <b className="text-sm">{peso(p.revenueCentavos)}</b>}
                </li>
              ))}
            </ol>
          ) : <Empty title="Nothing sold yet today" />}
        </section>

        <section className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold">Needs restocking</h2>
            <Link to="/inventory" className="text-sm underline">Open inventory</Link>
          </div>
          {needsRestock.length ? (
            <ul className="divide-y divide-line text-sm">
              {needsRestock.map((a: any) => (
                <li key={a.id} className="py-2 flex items-center justify-between gap-2">
                  <span>
                    <b>{a.name}</b> — {num(a.quantity)} {a.unit} left (min {num(a.minThreshold)}){a.reorderQty && `, reorder ${num(a.reorderQty)}`}
                  </span>
                  <Badge v={a.state} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center justify-center gap-2 py-8 text-sm font-medium text-green-700">
              <CheckCircle2 size={18} />Everything is stocked
            </div>
          )}
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold">Recent sales</h2>
            <Link to="/orders" className="text-sm underline">View all</Link>
          </div>
          {d.recentSales.length ? (
            <ul className="text-sm space-y-1.5">
              {d.recentSales.map((o: any) => (
                <li key={o.id} className="flex justify-between">
                  <span>{o.orderNumber}<span className="block text-xs text-neutral-600">{when(o.completedAt)}</span></span>
                  <b>{peso(o.totalCentavos)}</b>
                </li>
              ))}
            </ul>
          ) : <Empty title="No sales yet" />}
        </section>

        <section className="card p-4 lg:col-span-3">
          <h2 className="font-bold mb-2">Recent stock movements</h2>
          {d.recentTransactions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody className="divide-y divide-line">
                  {d.recentTransactions.map((x: any) => (
                    <tr key={x.id}>
                      <td className="td">{when(x.createdAt)}</td>
                      <td className="td font-medium">{x.ingredient.name}</td>
                      <td className="td"><Badge v={x.type} /></td>
                      <td className="td">{Number(x.quantityChange) > 0 ? '+' : ''}{num(x.quantityChange)} {x.unit}</td>
                      <td className="td text-neutral-600">{x.user.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No stock movements yet" />}
        </section>
      </div>
    </>
  );
}