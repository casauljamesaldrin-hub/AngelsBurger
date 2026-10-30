import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, ArrowDownUp, Boxes, CalendarDays, CheckCircle2, Clock, Download, Pencil, Plus, Printer, Search, Wallet } from 'lucide-react';
import { api, qs } from '../lib/api';
import { fromCentavos, num, stateOf, toCentavos, when } from '../lib/format';
import { useAuth } from '../lib/auth';
import { CATEGORY_STYLE, categoryOf, iconOf } from '../lib/ingredientMeta';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, PageHead, Pager, RowMenu, useToast } from '../components/ui';

/* ---------- helpers for the new look ---------- */


const peso = (centavos: number) => `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function exportCsv(items: any[]) {
  const rows = [['Ingredient', 'Category', 'On hand', 'Unit', 'Minimum', 'Status', 'Updated']];
  items.forEach((i) => rows.push([i.name, categoryOf(i), String(i.quantity), i.unit, String(i.minThreshold), stateOf(Number(i.quantity), Number(i.minThreshold)), new Date(i.updatedAt).toISOString()]));
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function SummaryCard({ icon, label, tone, children, sub }: { icon: React.ReactNode; label: string; tone: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{label}</div>
      <div className="mt-2 text-2xl font-bold text-ink">{children}</div>
      {sub && <div className="mt-1 text-xs text-neutral-600">{sub}</div>}
    </div>
  );
}

function CategoryPill({ name }: { name: string }) {
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${CATEGORY_STYLE[name] ?? CATEGORY_STYLE.Other}`}>{name}</span>;
}

/** Gauge: fill shows quantity against 3x the minimum; the tick marks the minimum level. */
function Gauge({ q, min }: { q: number; min: number }) {
  const cap = Math.max(min * 3, q, 1);
  const st = stateOf(q, min);
  return (
    <div className="relative h-2 w-28 rounded bg-neutral-200" aria-hidden>
      <div className={`h-2 rounded ${st === 'IN' ? 'bg-pickle' : st === 'LOW' ? 'bg-bun' : 'bg-ketchup'}`} style={{ width: `${Math.min(100, (q / cap) * 100)}%` }} />
      {min > 0 && <div className="absolute -top-0.5 h-3 w-0.5 bg-ink" style={{ left: `${(min / cap) * 100}%` }} />}
    </div>
  );
}

/* ---------- modals (unchanged) ---------- */

type Kind = 'in' | 'out' | 'waste' | 'adjust';
const qty = z.coerce.number({ invalid_type_error: 'Enter a number' }).positive('Must be more than 0');
const schemas = {
  in: z.object({ quantity: qty, supplier: z.string().optional(), reference: z.string().optional(), batch: z.string().optional(), expiresOn: z.string().optional(), unitCost: z.string().optional(), notes: z.string().optional() }),
  out: z.object({ quantity: qty, reason: z.string().min(1), notes: z.string().optional() }),
  waste: z.object({ quantity: qty, reason: z.string().min(1), notes: z.string().min(3, 'Explain what happened') }),
  adjust: z.object({ newQuantity: z.coerce.number().min(0, 'Cannot be negative'), reason: z.string().min(5, 'Give a reason (5+ characters)') }),
};
const titles = { in: 'Receive stock', out: 'Record usage', waste: 'Record waste', adjust: 'Adjust quantity' };

function MovementModal({ ing, kind, onClose }: { ing: any; kind: Kind; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const f = useForm<any>({ resolver: zodResolver(schemas[kind] as any), defaultValues: { reason: kind === 'out' ? 'PREPARATION' : kind === 'waste' ? 'EXPIRED' : '' } });
  const e = f.formState.errors as any;
  const m = useMutation({
    mutationFn: (v: any) => {
      const path = `/ingredients/${ing.id}/${kind === 'in' ? 'stock-in' : kind === 'out' ? 'stock-out' : kind === 'waste' ? 'waste' : 'adjustments'}`;
      const body = kind === 'in' ? { quantity: v.quantity, unit: ing.unit, supplier: v.supplier || undefined, reference: v.reference || undefined, batch: v.batch || undefined, expiresOn: v.expiresOn || undefined, unitCostCentavos: v.unitCost ? toCentavos(v.unitCost) : undefined, notes: v.notes || undefined } : v;
      return api(path, { body });
    },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', `${titles[kind]}: saved`); onClose(); },
    onError: (x: Error) => toast('err', x.message),
  });
  return (
    <Modal title={`${titles[kind]} — ${ing.name}`} onClose={onClose}>
      <p className="text-sm mb-3">On hand now: <b>{num(ing.quantity)} {ing.unit}</b></p>
      <form onSubmit={f.handleSubmit((v) => m.mutate(v))}>
        {kind === 'adjust' ? <Field label={`Counted quantity (${ing.unit})`} error={e.newQuantity?.message}><input className="input" inputMode="decimal" {...f.register('newQuantity')} /></Field>
          : <Field label={`Quantity (${ing.unit})`} error={e.quantity?.message}><input className="input" inputMode="decimal" {...f.register('quantity')} /></Field>}
        {kind === 'in' && <>
          <Field label="Supplier"><input className="input" {...f.register('supplier')} /></Field>
          <Field label="Delivery reference"><input className="input" {...f.register('reference')} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Batch"><input className="input" {...f.register('batch')} /></Field><Field label="Expires on"><input className="input" type="date" {...f.register('expiresOn')} /></Field></div>
          <Field label={`Cost per ${ing.unit} (PHP)`}><input className="input" inputMode="decimal" {...f.register('unitCost')} /></Field>
        </>}
        {kind === 'out' && <Field label="Reason"><select className="input" {...f.register('reason')}><option value="PREPARATION">Preparation</option><option value="OPERATIONAL_USAGE">Operational usage</option><option value="MANUAL_ADJUSTMENT">Manual adjustment</option><option value="OTHER">Other</option></select></Field>}
        {kind === 'waste' && <Field label="Reason"><select className="input" {...f.register('reason')}><option value="EXPIRED">Expired</option><option value="SPOILED">Spoiled</option><option value="DAMAGED">Damaged</option><option value="PREPARATION_MISTAKE">Preparation mistake</option><option value="OTHER">Other</option></select></Field>}
        {kind === 'adjust' && <Field label="Reason for the correction" error={e.reason?.message}><textarea className="input" rows={2} {...f.register('reason')} /></Field>}
        {kind !== 'adjust' && <Field label={kind === 'waste' ? 'What happened?' : 'Notes'} error={e.notes?.message}><textarea className="input" rows={2} {...f.register('notes')} /></Field>}
        {kind === 'out' && <p className="text-xs text-neutral-600 mb-3">Orders deduct their recipe ingredients automatically. Only record usage here for things that are not part of an order.</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={m.isPending}>{m.isPending ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

function IngredientModal({ ing, onClose }: { ing?: any; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const units = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const schema = z.object({ name: z.string().min(1, 'Name is required'), unit: z.string().min(1, 'Choose a unit'), minThreshold: z.coerce.number().min(0), reorderQty: z.string().optional(), unitCost: z.string().optional(), supplier: z.string().optional(), description: z.string().optional(), active: z.boolean().optional() });
  const f = useForm<any>({ resolver: zodResolver(schema as any), defaultValues: ing ? { name: ing.name, unit: ing.unit, minThreshold: num(ing.minThreshold), reorderQty: ing.reorderQty ? num(ing.reorderQty) : '', unitCost: ing.unitCostCentavos != null ? fromCentavos(ing.unitCostCentavos) : '', supplier: ing.supplier ?? '', description: ing.description ?? '', active: ing.active } : { minThreshold: 0, active: true } });
  const e = f.formState.errors as any;
  const m = useMutation({
    mutationFn: (v: any) => { const body = { name: v.name, unit: v.unit, minThreshold: v.minThreshold, reorderQty: v.reorderQty ? Number(v.reorderQty) : null, unitCostCentavos: v.unitCost ? toCentavos(v.unitCost) : null, supplier: v.supplier || null, description: v.description || null, ...(ing ? { active: v.active } : {}) }; return ing ? api(`/ingredients/${ing.id}`, { method: 'PATCH', body }) : api('/ingredients', { body }); },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', ing ? 'Ingredient saved' : 'Ingredient added'); onClose(); },
    onError: (x: Error) => toast('err', x.message),
  });
  return (
    <Modal title={ing ? `Edit ${ing.name}` : 'Add ingredient'} onClose={onClose}>
      <form onSubmit={f.handleSubmit((v) => m.mutate(v))}>
        <Field label="Name" error={e.name?.message}><input className="input" {...f.register('name')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit" error={e.unit?.message}><input className="input" list="units" {...f.register('unit')} /><datalist id="units">{units.data?.units?.map((u: string) => <option key={u} value={u} />)}</datalist></Field>
          <Field label="Minimum stock" error={e.minThreshold?.message}><input className="input" inputMode="decimal" {...f.register('minThreshold')} /></Field>
          <Field label="Reorder quantity"><input className="input" inputMode="decimal" {...f.register('reorderQty')} /></Field>
          <Field label="Cost per unit (PHP)"><input className="input" inputMode="decimal" {...f.register('unitCost')} /></Field>
        </div>
        <Field label="Supplier"><input className="input" {...f.register('supplier')} /></Field>
        <Field label="Description"><input className="input" {...f.register('description')} /></Field>
        {ing && <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" {...f.register('active')} />Active (untick to deactivate; history is kept)</label>}
        {!ing && <p className="text-xs text-neutral-600 mb-3">New ingredients start at 0. Use “Receive stock” to add the first delivery.</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={m.isPending}>Save</button></div>
      </form>
    </Modal>
  );
}

/* ---------- page ---------- */

export default function Inventory() {
  const { me } = useAuth(); const admin = me?.role === 'ADMIN';
  const [p, setP] = useState({ search: '', status: '', sort: 'name', dir: 'asc', page: 1, active: 'true', asOf: '' });
  const [act, setAct] = useState<{ ing: any; kind: Kind } | null>(null);
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const q = useQuery({ queryKey: ['ingredients', p], queryFn: () => api(`/ingredients${qs({ ...p, pageSize: 15 })}`) });
  // Separate, unfiltered list used only for the summary cards, alerts panel and CSV export.
  const all = useQuery({ queryKey: ['ingredients', 'summary', p.asOf], queryFn: () => api(`/ingredients${qs({ active: 'true', pageSize: 100, asOf: p.asOf })}`) });
  const dateRef = useRef<HTMLInputElement>(null);
  const todayIso = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const past = !!p.asOf && p.asOf < todayIso;
  const pickDate = (v: string) => setP({ ...p, asOf: v && v < todayIso ? v : '', page: 1 });
  const sortBy = (c: string) => setP({ ...p, sort: c, dir: p.sort === c && p.dir === 'asc' ? 'desc' : 'asc', page: 1 });

  const everything: any[] = all.data?.items ?? [];
  const alerts = everything.filter((i) => stateOf(Number(i.quantity), Number(i.minThreshold)) !== 'IN');
  const lowCount = alerts.length;
  const stockValue = everything.reduce((sum, i) => sum + Math.round(Number(i.quantity) * Number(i.unitCostCentavos ?? 0)), 0);
  const lastUpdated = everything.reduce<string | null>((latest, i) => (!latest || new Date(i.updatedAt) > new Date(latest) ? i.updatedAt : latest), null);
  const fmtDay = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const today = fmtDay(past ? new Date(`${p.asOf}T00:00:00`) : new Date());
  const rowOffset = ((q.data?.page ?? 1) - 1) * 15;

  return (
    <>
      <PageHead title="Inventory">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="relative inline-flex">
            <button type="button" className="btn" aria-label="Choose a date to view past stock" onClick={() => { const el = dateRef.current; if (el) { try { el.showPicker(); } catch { el.focus(); el.click(); } } }}><CalendarDays size={16} />{today}</button>
            <input ref={dateRef} type="date" max={todayIso} value={p.asOf || todayIso} onChange={(e) => pickDate(e.target.value)} className="pointer-events-none absolute left-0 top-full h-0 w-0 opacity-0" tabIndex={-1} aria-hidden />
          </span>
          <button className="btn" onClick={() => window.print()}><Printer size={16} />Print</button>
          <button className="btn" onClick={() => exportCsv(everything)} disabled={!everything.length}><Download size={16} />Export CSV</button>
          {admin && !past && <button className="btn btn-primary" onClick={() => setEdit('new')}><Plus size={16} />Add ingredient</button>}
        </div>
      </PageHead>
      <p className="-mt-2 mb-4 text-sm text-neutral-600">Track your stock, keep your kitchen running.</p>
      {past && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>Viewing stock as of <b>{today}</b>. This is a read-only snapshot.</span>
          <button className="btn !py-1" onClick={() => pickDate('')}>Back to today</button>
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard tone="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white" label="Total ingredients" icon={<Boxes size={18} className="text-emerald-600" />}>
          {everything.length} <span className="text-sm font-medium text-neutral-600">items</span>
        </SummaryCard>
        <SummaryCard tone="border-amber-200 bg-gradient-to-br from-amber-50 to-white" label="Low stock" icon={<AlertTriangle size={18} className="text-amber-600" />}
          sub={lowCount === 0 ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} />All good</span> : 'Needs restocking'}>
          {lowCount} <span className="text-sm font-medium text-neutral-600">items</span>
        </SummaryCard>
        <SummaryCard tone="border-sky-200 bg-gradient-to-br from-sky-50 to-white" label="Total stock value" icon={<Wallet size={18} className="text-sky-600" />}>
          {peso(stockValue)}
        </SummaryCard>
        <SummaryCard tone="border-violet-200 bg-gradient-to-br from-violet-50 to-white" label="Last updated" icon={<Clock size={18} className="text-violet-600" />}>
          <span className="text-base">{lastUpdated ? when(lastUpdated) : '—'}</span>
        </SummaryCard>
      </div>

      <div>
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input className="input !w-64 !pl-9" placeholder="Search ingredient…" aria-label="Search" value={p.search} onChange={(e) => setP({ ...p, search: e.target.value, page: 1 })} />
            </div>
            <select className="input !w-auto" aria-label="Status" value={p.status} onChange={(e) => setP({ ...p, status: e.target.value, page: 1 })}><option value="">All stock levels</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
            {admin && <select className="input !w-auto" aria-label="Active" value={p.active} onChange={(e) => setP({ ...p, active: e.target.value, page: 1 })}><option value="true">Active</option><option value="false">Inactive</option><option value="all">All</option></select>}
          </div>
          <div className="card overflow-x-auto !rounded-2xl">
            {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data.items.length ? <Empty title="No ingredients found" hint={admin ? 'Add your first ingredient, then receive stock.' : 'Ask an admin to add ingredients.'} /> : (
              <>
                <table className="w-full"><thead className="border-b border-line bg-neutral-50"><tr>
                  <th className="th w-10">#</th>
                  <th className="th"><button className="inline-flex items-center gap-1" onClick={() => sortBy('name')}>Ingredient <ArrowDownUp size={12} /></button></th>
                  <th className="th">Category</th>
                  <th className="th"><button className="inline-flex items-center gap-1" onClick={() => sortBy('quantity')}>Current stock <ArrowDownUp size={12} /></button></th>
                  <th className="th">Minimum</th><th className="th">Status</th><th className="th">Last updated</th><th className="th print:hidden">Actions</th></tr></thead>
                  <tbody className="divide-y divide-line">{q.data.items.map((i: any, idx: number) => {
                    const st = stateOf(i.quantity, i.minThreshold);
                    // Receive stays visible (most common action); the rest live in the "⋯" menu.
                    const more = [
                      ...(i.active ? [
                        { label: 'Use', onClick: () => setAct({ ing: i, kind: 'out' }) },
                        { label: 'Waste', onClick: () => setAct({ ing: i, kind: 'waste' }) },
                      ] : []),
                      ...(admin ? [
                        { label: 'Adjust', onClick: () => setAct({ ing: i, kind: 'adjust' }) },
                        { label: 'Edit', onClick: () => setEdit(i) },
                      ] : []),
                    ];
                    return (
                      <tr key={i.id} className={`${i.active ? '' : 'opacity-60'} ${st === 'OUT' ? 'bg-red-50' : st === 'LOW' ? 'bg-amber-50' : ''}`}>
                        <td className="td text-neutral-500">{rowOffset + idx + 1}</td>
                        <td className="td font-medium">
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-orange-50 text-xl" aria-hidden>{iconOf(i.name)}</span>
                            <span>{i.name}{!i.active && <span className="ml-2 text-xs text-neutral-500">(inactive)</span>}</span>
                          </div>
                        </td>
                        <td className="td"><CategoryPill name={categoryOf(i)} /></td>
                        <td className="td"><div className="flex items-center gap-3"><span className="w-20 whitespace-nowrap">{num(i.quantity)} {i.unit}</span><Gauge q={Number(i.quantity)} min={Number(i.minThreshold)} /></div></td>
                        <td className="td whitespace-nowrap">{num(i.minThreshold)} {i.unit}</td>
                        <td className="td"><Badge v={st} /></td>
                        <td className="td whitespace-nowrap text-neutral-600">{when(i.updatedAt)}</td>
                        <td className="td print:hidden"><div className="flex items-center gap-2">
                          {past ? <span className="text-xs text-neutral-500">Read-only</span> : <>
                          {admin && <button className="btn !px-2 !py-1" aria-label={`Edit ${i.name}`} onClick={() => setEdit(i)}><Pencil size={14} /></button>}
                          {i.active && <button className="btn !px-2.5 !py-1" onClick={() => setAct({ ing: i, kind: 'in' })}>Receive</button>}
                          <RowMenu items={more} />
                          </>}
                        </div></td>
                      </tr>
                    );
                  })}</tbody></table>
                <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setP({ ...p, page })} />
              </>
            )}
          </div>
        </section>

      </div>

      {act && <MovementModal {...act} onClose={() => setAct(null)} />}
      {edit && <IngredientModal ing={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}