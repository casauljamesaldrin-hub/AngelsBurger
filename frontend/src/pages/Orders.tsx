import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { peso, when } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, PageHead, Pager, useToast } from '../components/ui';

interface Line { product: any; quantity: number; optionIds: string[] }
const lineTotal = (l: Line) => (l.product.priceCentavos + l.product.options.filter((o: any) => l.optionIds.includes(o.id)).reduce((a: number, o: any) => a + o.priceCentavos, 0)) * l.quantity;

function Receipt({ order, onClose }: { order: any; onClose: () => void }) {
  return (
    <Modal title={`Order ${order.orderNumber}`} onClose={onClose}>
      <p className="text-sm text-neutral-600 mb-2">{when(order.createdAt)} · {order.user.name}</p>
      <ul className="divide-y divide-line text-sm mb-3">{order.items.map((i: any) => (
        <li key={i.id} className="py-2 flex justify-between gap-3"><span>{i.quantity} × {i.productName}{i.options.length > 0 && <span className="block text-xs text-neutral-600">+ {i.options.map((o: any) => o.name).join(', ')}</span>}</span><b>{peso(i.lineTotalCentavos)}</b></li>))}</ul>
      <p className="flex justify-between text-lg font-bold"><span>Total</span><span>{peso(order.totalCentavos)}</span></p>
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

export default function Orders() {
  const { me } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const [cart, setCart] = useState<Line[]>([]); const [pick, setPick] = useState<Line | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID()); const [method, setMethod] = useState('CASH');
  const [receipt, setReceipt] = useState<any>(null); const [cancel, setCancel] = useState<any>(null); const [page, setPage] = useState(1); const [search, setSearch] = useState('');
  const prods = useQuery({ queryKey: ['products', 'pos'], queryFn: () => api('/products?available=true') });
  const orders = useQuery({ queryKey: ['orders', page], queryFn: () => api(`/orders?page=${page}&pageSize=10`) });
  const total = cart.reduce((a, l) => a + lineTotal(l), 0);

  const place = useMutation({
    mutationFn: () => api('/orders', { body: { idempotencyKey: key, paymentMethod: method, items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity, optionIds: l.optionIds })) } }),
    onSuccess: (o) => { setReceipt(o); setCart([]); setKey(crypto.randomUUID()); qc.invalidateQueries(); },
    onError: (e: Error) => toast('err', e.message), // the same key is kept, so a retry can never double-deduct
  });
  const complete = useMutation({ mutationFn: (id: string) => api(`/orders/${id}/complete`, { body: {} }), onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Order completed and recorded as a sale'); }, onError: (e: Error) => toast('err', e.message) });

  const list = (prods.data ?? []).filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHead title="Orders and sales" />
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <section className="lg:col-span-2">
          <input className="input !w-56 mb-3" placeholder="Search menu" aria-label="Search menu" value={search} onChange={(e) => setSearch(e.target.value)} />
          {prods.isLoading ? <Loading /> : prods.error ? <ErrorBox error={prods.error} /> : !list.length ? <Empty title="No available products" hint="An admin needs to add products and mark them available." /> : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{list.map((p: any) => (
              <button key={p.id} className="card text-left p-4 hover:border-ketchup" onClick={() => setPick({ product: p, quantity: 1, optionIds: [] })}>
                <b className="block">{p.name}</b><span className="text-sm text-neutral-600">{peso(p.priceCentavos)}</span>
              </button>))}</div>)}
        </section>
        <aside className="card p-4 h-fit lg:sticky lg:top-4">
          <h2 className="font-bold mb-2">Current order</h2>
          {!cart.length ? <p className="text-sm text-neutral-600">Choose items from the menu.</p> : (
            <>
              <ul className="divide-y divide-line text-sm mb-3">{cart.map((l, i) => (
                <li key={i} className="py-2 flex justify-between gap-2"><span>{l.quantity} × {l.product.name}{l.optionIds.length > 0 && <span className="block text-xs text-neutral-600">+ {l.product.options.filter((o: any) => l.optionIds.includes(o.id)).map((o: any) => o.name).join(', ')}</span>}<button className="text-xs underline text-ketchup" onClick={() => setCart(cart.filter((_, j) => j !== i))}>Remove</button></span><b>{peso(lineTotal(l))}</b></li>))}</ul>
              <Field label="Payment method"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></Field>
              <p className="flex justify-between text-lg font-bold mb-3"><span>Total</span><span>{peso(total)}</span></p>
              <button className="btn btn-primary w-full" disabled={place.isPending} onClick={() => place.mutate()}>{place.isPending ? 'Confirming…' : 'Confirm order'}</button>
              <p className="text-xs text-neutral-600 mt-2">Confirming deducts ingredients using each product's recipe.</p>
            </>)}
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
          <div className="flex justify-end gap-2"><button className="btn" onClick={() => setPick(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { setCart([...cart, pick]); setPick(null); }}>Add to order</button></div>
        </Modal>)}
      {receipt && <Receipt order={receipt} onClose={() => setReceipt(null)} />}
      {cancel && <CancelModal order={cancel} onClose={() => setCancel(null)} />}
    </>
  );
}
