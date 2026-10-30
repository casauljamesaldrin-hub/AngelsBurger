import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { peso, when } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, PageHead, Pager, useToast } from '../components/ui';

// Point-of-sale style Orders page. Same server rules as the old page:
// confirming an order deducts ingredients from each product's recipe, and an order counts as a sale once completed.

interface Line { product: any; quantity: number; optionIds: string[] }
const unitPrice = (l: Line) => l.product.priceCentavos + l.product.options.filter((o: any) => l.optionIds.includes(o.id)).reduce((a: number, o: any) => a + o.priceCentavos, 0);
const lineTotal = (l: Line) => unitPrice(l) * l.quantity;
const sameLine = (a: Line, b: Line) => a.product.id === b.product.id && a.optionIds.length === b.optionIds.length && a.optionIds.every((id) => b.optionIds.includes(id));
const optionNames = (l: Line) => l.product.options.filter((o: any) => l.optionIds.includes(o.id)).map((o: any) => o.name).join(', ');

function Thumb({ product }: { product: any }) {
  return product.imageUrl
    ? <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" />
    : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-lg font-bold text-amber-800" aria-hidden="true">{product.name.charAt(0)}</span>;
}

function Receipt({ order, onClose }: { order: any; onClose: () => void }) {
  return (
    <Modal title={`Order ${order.orderNumber}`} onClose={onClose}>
      <p className="text-sm text-neutral-600 mb-2">{when(order.createdAt)} · {order.user.name}</p>
      <ul className="divide-y divide-line text-sm mb-3">{order.items.map((i: any) => (
        <li key={i.id} className="py-2 flex justify-between gap-3"><span>{i.quantity} × {i.productName}{i.options.length > 0 && <span className="block text-xs text-neutral-600">+ {i.options.map((o: any) => o.name).join(', ')}</span>}</span><b>{peso(i.lineTotalCentavos)}</b></li>))}</ul>
      <p className="flex justify-between text-lg font-bold"><span>Total</span><span>{peso(order.totalCentavos)}</span></p>
      {order.notes && <p className="text-sm mt-2">{order.notes}</p>}
      <p className="text-xs text-neutral-600 mt-2">Status: {order.status.toLowerCase()}. Ingredients were deducted when this order was confirmed. It counts as a sale once marked completed.</p>
      <div className="flex justify-end mt-4"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

function CancelModal({ order, onClose }: { order: any; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [reason, setReason] = useState(''); const [restore, setRestore] = useState(false);
  const m = useMutation({ mutationFn: () => api(`/orders/${order.id}/cancel`, { body: { reason, restoreStock: restore } }), onSuccess: () => { qc.invalidateQueries(); toast('ok', restore ? 'Order cancelled, stock restored' : 'Order cancelled, stock not restored'); onClose(); }, onError: (e: Error) => toast('err', e.message) });
  return (
    <Modal title={`Cancel ${order.orderNumber}`} onClose={onClose}>
      <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <label className="flex gap-2 text-sm mb-1"><input type="checkbox" checked={restore} onChange={(e) => setRestore(e.target.checked)} />Return the ingredients to stock</label>
      <p className="text-xs text-neutral-600 mb-4">Only tick this if the food was not prepared. Ticking it adds linked reversal entries to stock history; unticking leaves stock as it is.</p>
      <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Keep order</button><button className="btn btn-danger" onClick={() => m.mutate()} disabled={m.isPending || reason.trim().length < 3}>Cancel order</button></div>
    </Modal>
  );
}

export default function OrdersPos() {
  const { me } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const [cart, setCart] = useState<Line[]>([]); const [pick, setPick] = useState<Line | null>(null);
  // One key per cart. A retry or double-click of the SAME cart can never record two orders; changing the cart gives it a new key.
  const [key, setKey] = useState(() => crypto.randomUUID()); const [method, setMethod] = useState('CASH'); const [customer, setCustomer] = useState('');
  const [receipt, setReceipt] = useState<any>(null); const [cancel, setCancel] = useState<any>(null); const [page, setPage] = useState(1); const [search, setSearch] = useState('');
  const prods = useQuery({ queryKey: ['products', 'pos'], queryFn: () => api('/products?available=true') });
  const orders = useQuery({ queryKey: ['orders', page], queryFn: () => api(`/orders?page=${page}&pageSize=10`) });
  const total = cart.reduce((a, l) => a + lineTotal(l), 0);
  const count = cart.reduce((a, l) => a + l.quantity, 0);

  const changeCart = (fn: (c: Line[]) => Line[]) => { setCart(fn); setKey(crypto.randomUUID()); };
  const addLine = (line: Line) => changeCart((c) => {
    const i = c.findIndex((l) => sameLine(l, line));
    if (i < 0) return [...c, line];
    return c.map((l, j) => (j === i ? { ...l, quantity: Math.min(500, l.quantity + line.quantity) } : l));
  });
  const step = (i: number, delta: number) => changeCart((c) => c.flatMap((l, j) => {
    if (j !== i) return [l];
    const q = Math.min(500, l.quantity + delta);
    return q <= 0 ? [] : [{ ...l, quantity: q }];
  }));

  const place = useMutation({
    mutationFn: async (payNow: boolean) => {
      const order = await api('/orders', { body: {
        idempotencyKey: key, paymentMethod: method, notes: customer.trim() ? `Customer: ${customer.trim()}` : undefined,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity, optionIds: l.optionIds })),
      } });
      if (!payNow) return { order, paid: false, completeError: '' };
      try { return { order: await api(`/orders/${order.id}/complete`, { body: { paymentMethod: method } }), paid: true, completeError: '' }; }
      catch (e) { return { order, paid: false, completeError: (e as Error).message }; } // the order itself was saved
    },
    onSuccess: (r) => {
      setReceipt(r.order); setCart([]); setCustomer(''); setKey(crypto.randomUUID()); qc.invalidateQueries();
      if (r.completeError) toast('err', `Order confirmed, but it could not be marked completed: ${r.completeError} Use "Mark completed" below.`);
      else toast('ok', r.paid ? 'Paid. Recorded as a sale.' : 'Order confirmed');
    },
    onError: (e: Error) => toast('err', e.message), // the same key is kept, so a retry can never double-deduct
  });
  const complete = useMutation({ mutationFn: (id: string) => api(`/orders/${id}/complete`, { body: {} }), onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Order completed and recorded as a sale'); }, onError: (e: Error) => toast('err', e.message) });

  const list = (prods.data ?? []).filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase()));
  const inCart = (id: string) => cart.filter((l) => l.product.id === id).reduce((a, l) => a + l.quantity, 0);

  return (
    <>
      <PageHead title="Orders and sales" />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 mb-6">
        <section>
          <input className="input !w-64 mb-3" placeholder="Search menu" aria-label="Search menu" value={search} onChange={(e) => setSearch(e.target.value)} />
          {prods.isLoading ? <Loading /> : prods.error ? <ErrorBox error={prods.error} /> : !list.length ? <Empty title="No available products" hint="An admin needs to add products and mark them available." /> : (
                      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">{list.map((p: any) => {
              const n = inCart(p.id);
              const left: number | null = p.maxServings ?? null; // how many the current stock can still make
              const out = left === 0;
              return (
                <button key={p.id} type="button" disabled={out} aria-label={out ? `${p.name} is out of stock` : `Add ${p.name}`}
                  className={`relative flex items-center justify-between gap-3 rounded-xl border-2 bg-white p-3 text-left transition ${out ? 'cursor-not-allowed border-neutral-200 opacity-50' : `hover:shadow-md active:scale-[0.98] ${n > 0 ? 'border-red-400 ring-2 ring-red-200' : 'border-amber-200 hover:border-amber-400'}`}`}
                  onClick={() => {
                    if (left !== null && n >= left) { toast('err', `Only ${left} ${p.name} can be made with the current stock.`); return; }
                    if (p.options.length > 0) setPick({ product: p, quantity: 1, optionIds: [] });
                    else addLine({ product: p, quantity: 1, optionIds: [] });
                  }}>
                  <span className="min-w-0">
                    <b className="block text-sm leading-snug line-clamp-2">{p.name}</b>
                    <span className="text-sm font-semibold text-amber-800">{peso(p.priceCentavos)}</span>
                    {out && <span className="mt-1 block text-xs font-bold text-red-700">Out of stock</span>}
                    {!out && left !== null && left <= 5 && <span className="mt-1 block text-xs font-semibold text-amber-700">Only {left} left</span>}
                  </span>
                  <Thumb product={p} />
                  {n > 0 && <span className="absolute -right-2 -top-2 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{n}</span>}
                </button>);
            })}</div>)}
        </section>

        <aside className="card p-4 h-fit lg:sticky lg:top-4 border-2 border-amber-200">
          <div className="flex items-center justify-between mb-2"><h2 className="font-bold">Current order</h2><span className="text-xs rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{count} item{count === 1 ? '' : 's'}</span></div>
          {!cart.length ? <p className="text-sm text-neutral-600 py-6 text-center">Tap a menu item to start an order.</p> : (
            <ul className="divide-y divide-line text-sm mb-3">{cart.map((l, i) => (
              <li key={`${l.product.id}-${l.optionIds.join('-')}`} className="py-2 flex items-center justify-between gap-2">
                <span className="min-w-0"><b className="block leading-snug">{l.product.name}</b>{l.optionIds.length > 0 && <span className="block text-xs text-neutral-600">+ {optionNames(l)}</span>}<span className="text-xs text-neutral-600">{peso(unitPrice(l))} each</span></span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <button type="button" className="btn !p-1.5" aria-label={`Fewer ${l.product.name}`} onClick={() => step(i, -1)}><Minus size={14} /></button>
                  <b className="w-6 text-center">{l.quantity}</b>
                  <button type="button" className="btn !p-1.5" aria-label={`More ${l.product.name}`} onClick={() => step(i, 1)}><Plus size={14} /></button>
                </span>
                <b className="w-20 text-right shrink-0">{peso(lineTotal(l))}</b>
              </li>))}</ul>)}
          <input className="input mb-2" placeholder="Customer name (optional)" aria-label="Customer name" maxLength={60} value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <select className="input mb-3" aria-label="Customer paid by" value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select>
          <div className="rounded-lg border border-line px-3 py-2 mb-3"><div className="flex justify-between text-sm text-neutral-600"><span>Subtotal</span><span>{peso(total)}</span></div><div className="flex justify-between text-2xl font-extrabold mt-1"><span>Total</span><span data-testid="order-total">{peso(total)}</span></div></div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className="col-span-2 rounded-lg bg-green-700 py-3 text-lg font-extrabold tracking-wide text-white hover:bg-green-800 disabled:opacity-40" disabled={!cart.length || place.isPending} onClick={() => place.mutate(true)}>{place.isPending ? 'Saving…' : 'PAID'}</button>
            <button type="button" className="rounded-lg bg-red-700 py-3 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-40" disabled={!cart.length || place.isPending} onClick={() => changeCart(() => [])}>CLEAR</button>
          </div>
                   <p className="text-xs text-neutral-600 mt-2">Press PAID after the customer has paid (cash or GCash). This records the payment, deducts ingredients using each recipe, and counts the sale. It does not collect money. Clear only empties this screen.</p>
        </aside>
      </div>

      <h2 className="text-xl font-bold mb-2">Recent orders</h2>
      <div className="card overflow-x-auto">
        {orders.isLoading ? <Loading /> : orders.error ? <ErrorBox error={orders.error} /> : !orders.data.items.length ? <Empty title="No orders yet" /> : (<>
          <table className="w-full"><thead className="border-b border-line"><tr>{['Order', 'When', 'Items', 'Total', 'Status', 'By', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{orders.data.items.map((o: any) => (
              <tr key={o.id}><td className="td font-medium"><button className="underline" onClick={() => setReceipt(o)}>{o.orderNumber}</button></td><td className="td">{when(o.createdAt)}</td><td className="td">{o.items.map((i: any) => `${i.quantity} ${i.productName}`).join(', ')}</td><td className="td">{peso(o.totalCentavos)}</td><td className="td"><Badge v={o.status} /></td><td className="td">{o.user.name}</td>
                <td className="td"><div className="flex gap-1.5">{o.status === 'CONFIRMED' && <button className="btn !px-2.5 !py-1" disabled={complete.isPending} onClick={() => complete.mutate(o.id)}>Mark completed</button>}{me?.role === 'ADMIN' && o.status !== 'CANCELLED' && <button className="btn btn-danger !px-2.5 !py-1" onClick={() => setCancel(o)}>Cancel</button>}</div></td></tr>))}</tbody></table>
          <Pager page={orders.data.page} pageSize={orders.data.pageSize} total={orders.data.total} onPage={setPage} /></>)}
      </div>

      {pick && (
        <Modal title={pick.product.name} onClose={() => setPick(null)}>
          <div className="flex items-center gap-3 mb-3"><span className="label !mb-0">Quantity</span>
            <button className="btn !p-2" aria-label="Fewer" onClick={() => setPick({ ...pick, quantity: Math.max(1, pick.quantity - 1) })}><Minus size={14} /></button><b className="w-8 text-center">{pick.quantity}</b>
            <button className="btn !p-2" aria-label="More" onClick={() => setPick({ ...pick, quantity: Math.min(500, pick.quantity + 1) })}><Plus size={14} /></button></div>
          {pick.product.options.length > 0 && <fieldset className="mb-3"><legend className="label">Add-ons</legend>{pick.product.options.map((o: any) => (
            <label key={o.id} className="flex gap-2 text-sm py-1"><input type="checkbox" checked={pick.optionIds.includes(o.id)} onChange={(e) => setPick({ ...pick, optionIds: e.target.checked ? [...pick.optionIds, o.id] : pick.optionIds.filter((x) => x !== o.id) })} />{o.name} (+{peso(o.priceCentavos)})</label>))}</fieldset>}
          <p className="flex justify-between font-bold mb-4"><span>Subtotal</span><span>{peso(lineTotal(pick))}</span></p>
          <div className="flex justify-end gap-2"><button className="btn" onClick={() => setPick(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { addLine(pick); setPick(null); }}>Add to order</button></div>
        </Modal>)}
      {receipt && <Receipt order={receipt} onClose={() => setReceipt(null)} />}
      {cancel && <CancelModal order={cancel} onClose={() => setCancel(null)} />}
    </>
  );
}