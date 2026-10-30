import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal, useToast } from './ui';

// "Delete" button for a menu product. The server only allows it if the product was never sold.
export function DeleteProductButton({ product }: { product: { id: string; name: string } }) {
  const qc = useQueryClient(); const toast = useToast();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: () => api(`/products/${product.id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); toast('ok', `${product.name} deleted`); setOpen(false); },
    onError: (e: Error) => { toast('err', e.message); setOpen(false); },
  });
  return (
    <>
      <button className="btn btn-danger" onClick={() => setOpen(true)} aria-label={`Delete ${product.name}`}>Delete</button>
      {open && (
        <Modal title="Delete product" onClose={() => setOpen(false)}>
          <p className="text-sm mb-2">Delete <b>{product.name}</b> and its recipe?</p>
          <p className="text-xs text-neutral-600 mb-4">This cannot be undone. It is only allowed for products that were never sold. If this product is in past orders, hide it instead so the sales history stays complete.</p>
          <div className="flex justify-end gap-2"><button className="btn" onClick={() => setOpen(false)}>Keep it</button><button className="btn btn-danger" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Deleting…' : 'Delete'}</button></div>
        </Modal>
      )}
    </>
  );
}