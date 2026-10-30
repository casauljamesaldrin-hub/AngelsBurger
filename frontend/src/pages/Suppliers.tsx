import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Empty, ErrorBox, Field, Loading, Modal, PageHead, useToast } from '../components/ui';

type Supplier = {
  id: string; name: string; contactName: string | null; phone: string | null;
  email: string | null; address: string | null; active: boolean;
};

function SupplierForm({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [v, setV] = useState({
    name: supplier?.name ?? '', contactName: supplier?.contactName ?? '', phone: supplier?.phone ?? '',
    email: supplier?.email ?? '', address: supplier?.address ?? '',
  });
  const m = useMutation({
    mutationFn: () => {
      if (!v.name.trim()) throw new Error('Enter the supplier name.');
      return supplier ? api(`/suppliers/${supplier.id}`, { method: 'PATCH', body: v }) : api('/suppliers', { body: v });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast('ok', supplier ? 'Supplier saved' : 'Supplier added'); onClose(); },
    onError: (e: Error) => toast('err', e.message),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal title={supplier ? 'Edit supplier' : 'Add supplier'} onClose={onClose}>
      <Field label="Name"><input className="input" value={v.name} onChange={set('name')} maxLength={80} /></Field>
      <Field label="Contact person"><input className="input" value={v.contactName} onChange={set('contactName')} maxLength={80} /></Field>
      <Field label="Phone"><input className="input" value={v.phone} onChange={set('phone')} maxLength={40} /></Field>
      <Field label="Email"><input className="input" type="email" value={v.email} onChange={set('email')} maxLength={120} /></Field>
      <Field label="Address"><input className="input" value={v.address} onChange={set('address')} maxLength={200} /></Field>
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={m.isPending} onClick={() => m.mutate()}>Save</button>
      </div>
    </Modal>
  );
}

export function SuppliersPage() {
  const { me } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const admin = me?.role === 'ADMIN';
  const [edit, setEdit] = useState<Supplier | 'new' | null>(null);
  const q = useQuery({ queryKey: ['suppliers'], queryFn: () => api<Supplier[]>(`/suppliers${admin ? '?includeInactive=true' : ''}`) });
  const toggle = useMutation({
    mutationFn: (s: Supplier) => api(`/suppliers/${s.id}`, { method: 'PATCH', body: { active: !s.active } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast('ok', 'Saved'); },
    onError: (e: Error) => toast('err', e.message),
  });
  return (
    <>
      <PageHead title="Suppliers">
        {admin && <button className="btn btn-primary" onClick={() => setEdit('new')}><Plus size={16} />Add supplier</button>}
      </PageHead>
      <div className="card overflow-x-auto">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.length ? <Empty title="No suppliers yet" hint={admin ? 'Add the shops or people you buy ingredients from.' : 'Ask an admin to add suppliers.'} /> : (
          <table className="w-full">
            <thead className="border-b border-line"><tr>{['Name', 'Contact', 'Phone', 'Email', 'Address', 'Status', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {q.data.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'opacity-60'}>
                  <td className="td font-medium">{s.name}</td>
                  <td className="td">{s.contactName || '-'}</td>
                  <td className="td">{s.phone || '-'}</td>
                  <td className="td">{s.email || '-'}</td>
                  <td className="td">{s.address || '-'}</td>
                  <td className="td">{s.active ? 'Active' : 'Inactive'}</td>
                  <td className="td">
                    {admin && (
                      <div className="flex gap-2">
                        <button className="btn !px-2.5 !py-1" onClick={() => setEdit(s)}>Edit</button>
                        <button className="btn !px-2.5 !py-1" disabled={toggle.isPending} onClick={() => confirm(`${s.active ? 'Deactivate' : 'Reactivate'} ${s.name}?`) && toggle.mutate(s)}>{s.active ? 'Deactivate' : 'Reactivate'}</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <SupplierForm supplier={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

export default SuppliersPage;