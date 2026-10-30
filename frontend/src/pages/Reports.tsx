import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Package, RefreshCw, Search, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, apiUrl, qs } from '../lib/api';
import { day, humanize, peso, titleCase, todayIso, when } from '../lib/format';
import { Badge, Empty, ErrorBox, Loading, PageHead } from '../components/ui';

const REPORTS: [string, string][] = [
  ['inventory', 'Current inventory'], ['low-stock', 'Low and out of stock'], ['stock-in', 'Stock-in history'], ['usage', 'Ingredient usage'], ['waste', 'Waste and spoilage'],
  ['adjustments', 'Adjustments and reversals'], ['sales', 'Sales by period'], ['products', 'Product sales ranking'], ['orders', 'Order history'], ['staff', 'Staff activity'], ['profit', 'Estimated gross profit'],
];

// Plain-language hint that changes with the report, instead of one generic note for all of them.
const NOTES: Record<string, string> = {
  inventory: 'A snapshot of what is on the shelf right now. Date filters do not apply.',
  'low-stock': 'Ingredients at or below their minimum. Date filters do not apply.',
  sales: 'Counts completed orders only. Revenue is not profit.',
  products: 'Counts completed orders only, ranked by what sold the most.',
  profit: 'An estimate based on current ingredient costs, so past periods may shift if prices change.',
};

// These reports show the stock right now, so a date range does not apply.
const SNAPSHOT = ['inventory', 'low-stock'];

// Columns that get a total in the table footer.
const TOTALS: Record<string, string[]> = {
  inventory: ['value'],
  sales: ['orders', 'revenue_php'],
  products: ['units_sold', 'revenue_php'],
};

const NUMBER = /^-?\d+(\.\d+)?$/;
const isMoney = (k: string) => /_php$|^unitCost$|^value$/.test(k);
const isBadge = (k: string) => ['status', 'type', 'payment'].includes(k);
const head = (k: string) =>
  k.replace(/_php$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const money = (v: unknown) => peso(Math.round(Number(v) * 100));

const shiftDay = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function presets() {
  const today = todayIso();
  const monthStart = today.slice(0, 8) + '01';
  const prevEnd = shiftDay(monthStart, -1);
  return [
    { label: 'Today', from: today, to: today },
    { label: 'Last 7 days', from: shiftDay(today, -6), to: today },
    { label: 'This month', from: monthStart, to: today },
    { label: 'Last month', from: prevEnd.slice(0, 8) + '01', to: prevEnd },
  ];
}

const PAGE_SIZE = 10;

// Small visual cue per ingredient; falls back to a box. First match wins, so order matters.
const EMOJI: [RegExp, string][] = [
  [/bread/i, '🥖'], [/hamburger|burger|patty/i, '🍔'], [/bun/i, '🍞'], [/cheese/i, '🧀'], [/coke|soda|cola|juice|water/i, '🥤'],
  [/egg/i, '🥚'], [/sauce|ketchup|chili/i, '🌶️'], [/sausage|footlong|hot ?dog/i, '🌭'], [/lettuce|cabbage/i, '🥬'],
  [/tomato/i, '🍅'], [/onion/i, '🧅'], [/potato|fries/i, '🍟'], [/chicken/i, '🍗'], [/oil/i, '🫒'],
];
const emojiFor = (name: string) => EMOJI.find(([re]) => re.test(name))?.[1] ?? '📦';

const NOUN: Record<string, string> = { inventory: 'ingredients', 'low-stock': 'ingredients', orders: 'orders', products: 'products', staff: 'activities' };

// 1 2 3 … 9 10, collapsing long runs.
function pageList(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, cur - 1, cur, cur + 1].filter((n) => n >= 1 && n <= total));
  const out: (number | '…')[] = [];
  [...set].sort((a, b) => a - b).forEach((n, i, arr) => { if (i && n - arr[i - 1] > 1) out.push('…'); out.push(n); });
  return out;
}

type Sort = { key: string; dir: 'asc' | 'desc' } | null;

export default function Reports() {
  const [p, setP] = useState({ report: 'inventory', period: 'day', from: todayIso().slice(0, 8) + '01', to: todayIso() });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>(null);
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  // Filters and sorting belong to one report, so start fresh when switching.
  useEffect(() => { setSearch(''); setStatusFilter(null); setSort(null); setCategory(''); }, [p.report]);
  // Any change to what is shown sends you back to the first page.
  useEffect(() => { setPage(1); }, [p, search, statusFilter, sort, category]);

  const q = useQuery({
    queryKey: ['report', p],
    queryFn: () => api(`/reports/${p.report}${qs({ period: p.period, from: p.from, to: p.to })}`),
    // Keep the old table on screen while a new range loads, so it does not flash empty.
    placeholderData: (prev: any) => prev,
  });
  const rows: any[] = q.data ?? [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const sum = (k: string, list: any[] = rows) => list.reduce((a, r) => a + Number(r[k] || 0), 0);

  // A column is numeric when every filled value is a number; those columns are right-aligned.
  const numeric = new Set(cols.filter((c) => !isBadge(c) && rows.some((r) => NUMBER.test(String(r[c]))) && rows.every((r) => r[c] === '' || r[c] == null || NUMBER.test(String(r[c])))));

  const periodLabel = (s: string) =>
    p.period === 'month'
      ? new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${s}T00:00:00Z`))
      : day(s);
  const chartLabel = (s: string) =>
    p.period === 'month'
      ? periodLabel(s)
      : new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${s}T00:00:00Z`));

  // Status chips with counts (e.g. In stock 12, Low 3).
  const statuses = useMemo(() => {
    if (!cols.includes('status')) return [];
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(String(r.status), (m.get(String(r.status)) ?? 0) + 1));
    return [...m.entries()];
  }, [rows, cols.join()]);

  const categories = useMemo(
    () => (cols.includes('category') ? [...new Set(rows.map((r) => String(r.category ?? '')).filter(Boolean))].sort() : []),
    [rows, cols.join()],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = rows.filter((r) =>
      (!statusFilter || String(r.status) === statusFilter) &&
      (!category || String(r.category) === category) &&
      (!term || Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(term))));
    if (sort) {
      const isNum = numeric.has(sort.key);
      list = [...list].sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        const c = isNum ? Number(x || 0) - Number(y || 0) : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
        return sort.dir === 'asc' ? c : -c;
      });
    }
    return list;
  }, [rows, search, statusFilter, sort, category]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * PAGE_SIZE;
  const paged = visible.slice(start, start + PAGE_SIZE);
  const title = REPORTS.find(([k]) => k === p.report)?.[1] ?? 'Report';
  const noun = NOUN[p.report] ?? 'rows';

  function toggleSort(key: string) {
    setSort((s) => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));
  }

  function cell(k: string, v: unknown, r: any) {
    if (v === '' || v == null) return <span className="text-neutral-400">—</span>;
    const s = String(v);
    if (k === 'ingredient') return (
      <span className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-xl" aria-hidden>{emojiFor(s)}</span>
        <span className="font-medium">{s}</span>
      </span>
    );
    if (isMoney(k)) return money(s);
    if (isBadge(k)) return <Badge v={s} />;
    if (k === 'time') return when(s);
    if (k === 'period') return periodLabel(s);
    if (k === 'product') return titleCase(s);
    // Quantity next to a small bar showing how far above (or below) the minimum it sits.
    if (p.report === 'inventory' && k === 'quantity' && Number(r.minimum) > 0) {
      const pct = Math.max(4, Math.min(100, (Number(v) / (Number(r.minimum) * 2)) * 100));
      const tone = r.status === 'OUT' ? 'bg-red-600' : r.status === 'IN' ? 'bg-emerald-600' : 'bg-amber-500';
      return (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 rounded-full bg-neutral-200" aria-hidden>
            <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="w-10 text-right">{humanize(s)}</span>
        </div>
      );
    }
    return humanize(s);
  }

  type Card = { label: string; value: string; tone?: 'warn' | 'ok' };
  function summary(): Card[] {
    switch (p.report) {
      case 'inventory': {
        const low = rows.filter((r) => r.status !== 'IN').length;
        return [
          { label: 'Ingredients', value: String(rows.length) },
          { label: 'Low or out of stock', value: String(low), tone: low > 0 ? 'warn' : 'ok' },
          { label: 'Total stock value', value: money(sum('value')) },
        ];
      }
      case 'low-stock': return [
        { label: 'Items to restock', value: String(rows.length), tone: rows.length ? 'warn' : 'ok' },
        { label: 'Out of stock', value: String(rows.filter((r) => r.status === 'OUT').length), tone: 'warn' },
      ];
      case 'sales': return [
        { label: 'Completed orders', value: String(sum('orders')) },
        { label: 'Revenue', value: money(sum('revenue_php')) },
        { label: 'Average per order', value: sum('orders') ? money(sum('revenue_php') / sum('orders')) : '—' },
      ];
      case 'products': return [
        { label: 'Units sold', value: String(sum('units_sold')) },
        { label: 'Revenue', value: money(sum('revenue_php')) },
      ];
      case 'orders': return [
        { label: 'Orders', value: String(rows.length) },
        { label: 'Completed', value: String(rows.filter((r) => r.status === 'COMPLETED').length) },
        { label: 'Cancelled', value: String(rows.filter((r) => r.status === 'CANCELLED').length) },
      ];
      case 'profit': return [];
      default: return [{ label: 'Records', value: String(rows.length) }];
    }
  }
  const cards = rows.length ? summary() : [];

  const totals = TOTALS[p.report]?.filter((k) => cols.includes(k)) ?? [];
  const filtering = !!search || !!statusFilter || !!category;
  const activePreset = presets().find((x) => x.from === p.from && x.to === p.to)?.label;
  const dateInvalid = !!p.from && !!p.to && p.from > p.to;

  return (
    <>
      <PageHead title="Reports">
        <a className="btn" href={apiUrl(`/reports/export.csv${qs(p)}`)} title="Downloads the report with the current filters">
          <Download size={16} />Export CSV
        </a>
      </PageHead>

      {/* Report picker and filters */}
      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="block"><span className="label">Report</span>
          <select className="input !w-auto" value={p.report} onChange={(e) => setP({ ...p, report: e.target.value })}>
            {REPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
          {p.report === 'sales' && (
            <label className="block"><span className="label">Group by</span>
              <select className="input !w-auto" value={p.period} onChange={(e) => setP({ ...p, period: e.target.value })}>
                <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option>
              </select>
            </label>
          )}
          {!SNAPSHOT.includes(p.report) && (<>
            <label className="block"><span className="label">From</span>
              <input className="input !w-auto" type="date" max={p.to || undefined} value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} />
            </label>
            <label className="block"><span className="label">To</span>
              <input className="input !w-auto" type="date" min={p.from || undefined} value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} />
            </label>
            <div className="flex flex-wrap gap-1.5" aria-label="Quick date ranges">
              {presets().map((x) => (
                <button
                  key={x.label} type="button" onClick={() => setP({ ...p, from: x.from, to: x.to })}
                  className={`rounded-md border px-2.5 py-2 text-sm ${activePreset === x.label ? 'border-neutral-900 bg-neutral-100 font-semibold' : 'border-line bg-white hover:bg-neutral-100'}`}
                >{x.label}</button>
              ))}
            </div>
          </>)}
      </div>
      {dateInvalid && <p role="alert" className="mb-3 text-sm text-red-700">The start date is after the end date. Pick a start date on or before the end date.</p>}
      {NOTES[p.report] && <p className="mb-4 text-sm text-neutral-600">{NOTES[p.report]}</p>}

      {/* Summary cards */}
      {cards.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className={`card p-4 ${c.tone === 'warn' ? '!border-amber-400 !bg-amber-50' : ''}`}>
              <p className="text-sm text-neutral-700">{c.label}</p>
              <p className={`mt-1 font-display text-2xl font-bold ${c.tone === 'warn' ? 'text-amber-800' : c.tone === 'ok' ? 'text-emerald-700' : ''}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {p.report === 'sales' && rows.length > 0 && (
        <section className="card mb-4 p-4">
          <h2 className="mb-3 font-bold">Revenue {p.period === 'day' ? 'by day' : p.period === 'week' ? 'by week' : 'by month'}</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={rows.map((r) => ({ label: chartLabel(String(r.period)), php: Number(r.revenue_php) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} width={64} tickFormatter={(v: number) => `₱${v.toLocaleString('en-PH')}`} />
                <Tooltip formatter={(v: number) => [money(v), 'Revenue']} />
                <Bar dataKey="php" fill="#b8321f" radius={[3, 3, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Table card: header with title + search, optional filters, rows, pager */}
      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-100 text-amber-700" aria-hidden><Package size={20} /></span>
          <h2 className="font-display text-lg font-bold">{title}</h2>
          {rows.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  className="input !w-60 !rounded-xl !pl-9 !pr-8" type="search" placeholder={`Search ${noun}…`} aria-label={`Search ${noun}`}
                  value={search} onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-900"><X size={14} /></button>
                )}
              </div>
              {categories.length > 0 && (
                <select className="input !w-auto !rounded-xl" aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
                </select>
              )}
            </div>
          )}
        </header>

        {statuses.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2" aria-label="Filter by status">
            {statuses.map(([s, n]) => (
              <button
                key={s} type="button" aria-pressed={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className={`rounded-full border px-2.5 py-1 text-sm ${statusFilter === s ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-line bg-white hover:bg-neutral-100'}`}
              >{humanize(s)} <span className="opacity-70">{n}</span></button>
            ))}
          </div>
        )}

        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !rows.length ? (
          <Empty title="No data for this report" hint={SNAPSHOT.includes(p.report) ? 'Nothing to show right now.' : 'Try a wider date range, or pick “This month” above.'} />
        ) : !visible.length ? (
          <Empty title={`No ${noun} match your filters`} hint="Clear the search or filters to see everything again." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-[#fbf6ec]">
                <tr>
                  <th className="th w-12">#</th>
                  {cols.map((c) => {
                    const on = sort?.key === c;
                    const Icon = !on ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
                    return (
                      <th key={c} className={`th ${numeric.has(c) ? 'text-right' : ''}`} aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" onClick={() => toggleSort(c)} className={`inline-flex items-center gap-1 hover:text-neutral-900 ${numeric.has(c) ? 'flex-row-reverse' : ''}`}>
                          {head(c)}<Icon size={12} className={on ? 'text-neutral-900' : 'text-neutral-400'} />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">{paged.map((r, i) => (
                <tr key={start + i} className="hover:bg-neutral-50">
                  <td className="td text-neutral-500 tabular-nums">{start + i + 1}</td>
                  {cols.map((c) => <td key={c} className={`td ${numeric.has(c) ? 'text-right tabular-nums' : ''}`}>{cell(c, r[c], r)}</td>)}
                </tr>
              ))}</tbody>
              {totals.length > 0 && (
                <tfoot className="border-t border-line bg-[#fbf6ec] font-semibold">
                  <tr>
                    <td className="td" />
                    {cols.map((c, i) => (
                      <td key={c} className={`td ${numeric.has(c) ? 'text-right tabular-nums' : ''}`}>
                        {i === 0 ? (filtering ? 'Total (filtered)' : 'Total') : totals.includes(c) ? (isMoney(c) ? money(sum(c, visible)) : sum(c, visible)) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {visible.length > 0 && (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-neutral-600">
            <p aria-live="polite" className="flex items-center gap-2">
              {q.isFetching && <RefreshCw size={14} className="animate-spin" aria-label="Updating" />}
              Showing {start + 1}–{start + paged.length} of {visible.length} {noun}{filtering && visible.length !== rows.length ? ` (filtered from ${rows.length})` : ''}
            </p>
            {pages > 1 && (
              <nav aria-label="Pagination" className="flex items-center gap-1.5">
                <button type="button" aria-label="Previous page" disabled={cur === 1} onClick={() => setPage(cur - 1)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white"><ChevronLeft size={16} /></button>
                {pageList(cur, pages).map((n, i) => n === '…'
                  ? <span key={`gap${i}`} className="px-1 text-neutral-400">…</span>
                  : <button key={n} type="button" aria-current={n === cur ? 'page' : undefined} onClick={() => setPage(n)}
                      className={`h-8 min-w-8 rounded-lg border px-2 font-semibold ${n === cur ? 'border-amber-500 bg-amber-500 text-white' : 'border-line bg-white hover:bg-neutral-100'}`}>{n}</button>)}
                <button type="button" aria-label="Next page" disabled={cur === pages} onClick={() => setPage(cur + 1)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white"><ChevronRight size={16} /></button>
              </nav>
            )}
          </footer>
        )}
      </section>
    </>
  );
}