import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { fromCentavos, num, peso, toCentavos } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, PageHead, useToast } from '../components/ui';
import { DeleteProductButton } from '../components/DeleteProductButton';
const PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='240'><rect width='100%' height='100%' fill='%23e8e8e3'/><text x='50%' y='50%' text-anchor='middle' fill='%23888' font-family='sans-serif' font-size='16'>No image</text></svg>";

function ProductModal({ product, onClose }: { product?: any; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [v, setV] = useState({ name: product?.name ?? '', description: product?.description ?? '', price: product ? fromCentavos(product.priceCentavos) : '', category: product?.category ?? '', productType: product?.productType ?? 'SINGLE', active: product?.active ?? true, available: product?.available ?? true });
  const [file, setFile] = useState<File | null>(null);
  const preview = file ? URL.createObjectURL(file) : product?.imageUrl ?? PLACEHOLDER;
  const m = useMutation({
    mutationFn: async () => {
      if (!v.name.trim()) throw new Error('Enter a product name.');
      if (!(Number(v.price) >= 0) || v.price === '') throw new Error('Enter a price in pesos.');
      const body = { name: v.name, description: v.description || null, priceCentavos: toCentavos(v.price), category: v.category || null, productType: v.productType, active: v.active, available: v.available };
      const saved = product ? await api(`/products/${product.id}`, { method: 'PATCH', body }) : await api('/products', { body });
      if (file) { const form = new FormData(); form.append('image', file); await api(`/products/${saved.id}/image`, { form }); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast('ok', 'Product saved'); onClose(); },
    onError: (e: Error) => toast('err', e.message),
  });
  const removeImg = useMutation({ mutationFn: () => api(`/products/${product.id}/image`, { method: 'DELETE' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast('ok', 'Image removed'); onClose(); }, onError: (e: Error) => toast('err', e.message) });
  return (
    <Modal title={product ? `Edit ${product.name}` : 'Add product'} onClose={onClose}>
      <img src={preview} alt="Preview" className="w-full h-40 object-cover rounded mb-2" />
      <div className="flex gap-2 mb-3"><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Product image" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm flex-1" />{product?.imageUrl && <button className="btn btn-danger" onClick={() => removeImg.mutate()}>Remove image</button>}</div>
      <Field label="Name"><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Description"><input className="input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Price (PHP)"><input className="input" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /></Field>
        <Field label="Category"><input className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} /></Field>
        <Field label="Type"><select className="input" value={v.productType} onChange={(e) => setV({ ...v, productType: e.target.value })}><option value="SINGLE">Single</option><option value="COMBO">Combo</option><option value="DRINK">Drink</option><option value="OTHER">Other</option></select></Field>
      </div>
      <div className="flex gap-4 text-sm mb-3"><label className="flex gap-2"><input type="checkbox" checked={v.available} onChange={(e) => setV({ ...v, available: e.target.checked })} />Available to order</label><label className="flex gap-2"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />On the menu</label></div>
      <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => m.mutate()} disabled={m.isPending}>Save</button></div>
    </Modal>
  );
}

function RecipeModal({ product, onClose }: { product: any; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const ings = useQuery({ queryKey: ['ing-all'], queryFn: () => api('/ingredients?pageSize=100') });
  const [rows, setRows] = useState<{ ingredientId: string; quantity: string }[]>(product.recipe.map((r: any) => ({ ingredientId: r.ingredientId, quantity: num(r.quantity) })));
  const m = useMutation({
    mutationFn: () => {
      if (!rows.length) throw new Error('Add at least one ingredient.');
      if (rows.some((r) => !r.ingredientId || !(Number(r.quantity) > 0))) throw new Error('Every row needs an ingredient and a quantity above 0.');
      return api(`/products/${product.id}/recipes`, { body: { items: rows.map((r) => ({ ingredientId: r.ingredientId, quantity: Number(r.quantity) })) } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast('ok', 'Recipe saved'); onClose(); },
    onError: (e: Error) => toast('err', e.message),
  });
  const unit = (id: string) => ings.data?.items.find((i: any) => i.id === id)?.unit ?? '';
  return (
    <Modal title={`Recipe — ${product.name}`} onClose={onClose} wide>
      <p className="text-sm text-neutral-600 mb-3">Quantity used for one serving. Past orders keep the recipe they were made with.</p>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 mb-2 items-center">
          <select className="input" aria-label="Ingredient" value={r.ingredientId} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, ingredientId: e.target.value } : x))}><option value="">Choose ingredient</option>{ings.data?.items.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <input className="input !w-28" aria-label="Quantity" inputMode="decimal" value={r.quantity} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
          <span className="w-12 text-sm">{unit(r.ingredientId)}</span>
          <button className="p-2" aria-label="Remove row" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
        </div>))}
      <button className="btn mb-4" onClick={() => setRows([...rows, { ingredientId: '', quantity: '1' }])}><Plus size={16} />Add ingredient</button>
      <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => m.mutate()} disabled={m.isPending}>Save recipe</button></div>
    </Modal>
  );
}

function OptionModal({ products, onClose }: { products: any[]; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const ings = useQuery({ queryKey: ['ing-all'], queryFn: () => api('/ingredients?pageSize=100') });
  const [name, setName] = useState(''); const [price, setPrice] = useState('0'); const [pids, setPids] = useState<string[]>([]);
  const [rows, setRows] = useState<{ ingredientId: string; quantity: string }[]>([]);
  const m = useMutation({
    mutationFn: () => { if (!name.trim()) throw new Error('Enter a name.'); return api('/products/options', { body: { name, priceCentavos: toCentavos(price), productIds: pids, items: rows.filter((r) => r.ingredientId).map((r) => ({ ingredientId: r.ingredientId, quantity: Number(r.quantity) })) } }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['options'] }); toast('ok', 'Add-on saved'); onClose(); },
    onError: (e: Error) => toast('err', e.message),
  });
  return (
    <Modal title="Add an add-on" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3"><Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Extra price (PHP)"><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field></div>
      <p className="label">Offered with</p>
      <div className="flex flex-wrap gap-3 mb-3 text-sm">{products.map((p) => <label key={p.id} className="flex gap-1.5"><input type="checkbox" checked={pids.includes(p.id)} onChange={(e) => setPids(e.target.checked ? [...pids, p.id] : pids.filter((x) => x !== p.id))} />{p.name}</label>)}</div>
      <p className="label">Extra ingredients used</p>
      {rows.map((r, i) => (<div key={i} className="flex gap-2 mb-2"><select className="input" aria-label="Ingredient" value={r.ingredientId} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, ingredientId: e.target.value } : x))}><option value="">Choose ingredient</option>{ings.data?.items.map((g: any) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}</select><input className="input !w-28" aria-label="Quantity" value={r.quantity} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} /></div>))}
      <button className="btn mb-4" onClick={() => setRows([...rows, { ingredientId: '', quantity: '1' }])}><Plus size={16} />Add ingredient</button>
      <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => m.mutate()} disabled={m.isPending}>Save add-on</button></div>
    </Modal>
  );
}

export default function Products() {
  const { me } = useAuth(); const admin = me?.role === 'ADMIN';
  const [search, setSearch] = useState(''); const [avail, setAvail] = useState(false);
  const [edit, setEdit] = useState<any | 'new' | null>(null); const [recipe, setRecipe] = useState<any>(null); const [opt, setOpt] = useState(false);
  const q = useQuery({ queryKey: ['products', search, avail, admin], queryFn: () => api(`/products?search=${encodeURIComponent(search)}${avail ? '&available=true' : ''}${admin ? '&includeInactive=true' : ''}`) });
  const opts = useQuery({ queryKey: ['options'], queryFn: () => api('/products/options'), enabled: admin });
  return (
    <>
      <PageHead title="Menu and recipes">{admin && <><button className="btn" onClick={() => setOpt(true)}>Add-on</button><button className="btn btn-primary" onClick={() => setEdit('new')}><Plus size={16} />Add product</button></>}</PageHead>
      <div className="flex flex-wrap gap-3 mb-3 items-center"><input className="input !w-56" placeholder="Search menu" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} /><label className="flex gap-2 text-sm"><input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} />Available only</label></div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data.length ? <Empty title="No products yet" hint={admin ? 'Add a product, then set its recipe so orders can deduct stock.' : 'Ask an admin to set up the menu.'} /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">{q.data.map((p: any) => (
                    <article key={p.id} className={`card overflow-hidden flex flex-col border-t-4 border-t-amber-400 transition hover:shadow-md ${p.active ? '' : 'opacity-60'}`}>
<div className="flex justify-center pt-5"><img src={p.imageUrl ?? PLACEHOLDER} alt={p.name} className="h-20 w-20 rounded-xl object-cover" loading="lazy" /></div>
            <div className="p-4 flex flex-1 flex-col">
             <div><h2 className="font-bold leading-snug line-clamp-2" title={p.name}>{p.name}</h2><b className="text-ketchup">{peso(p.priceCentavos)}</b></div>
              <p className="text-sm text-neutral-600 line-clamp-2 min-h-[2.5rem]" title={p.description ?? ''}>{p.description}</p>
              <div className="flex items-center gap-2 mt-2 text-xs"><span className={`rounded-full px-2 py-0.5 ${p.available ? 'bg-green-100 text-green-900' : 'bg-neutral-200'}`}>{p.available ? 'Available' : 'Unavailable'}</span>{!p.recipe.length && <span className="rounded-full px-2 py-0.5 bg-amber-100 text-amber-900">No recipe</span>}{!p.active && <span>Hidden</span>}</div>
              {p.recipe.length > 0 && <p className="text-xs text-neutral-600 mt-2" title={p.recipe.map((r: any) => `${num(r.quantity)} ${r.ingredient.unit} ${r.ingredient.name}`).join(', ')}>{p.recipe.length} ingredient{p.recipe.length === 1 ? '' : 's'} in recipe</p>}
         {admin && <div className="grid grid-cols-3 gap-1.5 mt-auto pt-3"><button className="btn w-full !px-2" onClick={() => setEdit(p)}>Edit</button><button className="btn w-full !px-2" onClick={() => setRecipe(p)}>Recipe</button><DeleteProductButton product={p} /></div>}
            </div>
          </article>))}</div>)}
      {admin && opts.data?.length > 0 && (<section className="card p-4 mt-6"><h2 className="font-bold mb-2">Add-ons</h2><ul className="text-sm divide-y divide-line">{opts.data.map((o: any) => <li key={o.id} className="py-2 flex flex-wrap justify-between gap-2"><span><b>{o.name}</b> <span className="text-neutral-600">for {o.products.map((x: any) => x.name).join(', ') || 'no products yet'}</span></span><span>+{peso(o.priceCentavos)} {!o.active && <Badge v="CANCELLED" />}</span></li>)}</ul></section>)}
      {edit && <ProductModal product={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {recipe && <RecipeModal product={recipe} onClose={() => setRecipe(null)} />}
      {opt && <OptionModal products={q.data ?? []} onClose={() => setOpt(false)} />}
    </>
  );
}
