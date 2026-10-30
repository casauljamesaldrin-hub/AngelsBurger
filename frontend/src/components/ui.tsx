import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`card w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-b-lg`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="p-1 rounded hover:bg-board" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export const Field = ({ label, error, children }: { label: string; error?: string; children: ReactNode }) => (
  <label className="block mb-3"><span className="label">{label}</span>{children}{error && <p className="err">{error}</p>}</label>
);

export const Empty = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="text-center py-10 px-4"><p className="font-semibold">{title}</p>{hint && <p className="text-sm text-neutral-600 mt-1">{hint}</p>}</div>
);
export const Loading = () => <p className="p-6 text-sm text-neutral-600" role="status">Loading…</p>;
export const ErrorBox = ({ error }: { error: unknown }) => <p className="p-4 text-sm text-ketchup" role="alert">{(error as Error)?.message ?? 'Something went wrong.'}</p>;

const tone: Record<string, string> = {
  IN: 'bg-green-100 text-green-900', LOW: 'bg-amber-100 text-amber-900', OUT: 'bg-red-100 text-red-900',
  COMPLETED: 'bg-green-100 text-green-900', CONFIRMED: 'bg-amber-100 text-amber-900', CANCELLED: 'bg-neutral-200 text-neutral-700',
  ACCEPTED: 'bg-green-100 text-green-900', PENDING: 'bg-neutral-200 text-neutral-700', RETRYING: 'bg-amber-100 text-amber-900', FAILED: 'bg-red-100 text-red-900',
  // Stock movement types
  STOCK_IN: 'bg-green-100 text-green-900', STOCK_OUT: 'bg-amber-100 text-amber-900', WASTE: 'bg-red-100 text-red-900',
  ADJUSTMENT: 'bg-sky-100 text-sky-900', REVERSAL: 'bg-purple-100 text-purple-900', ORDER_DEDUCTION: 'bg-neutral-200 text-neutral-700',
  // Account / supplier status
  ACTIVE: 'bg-green-100 text-green-900', INACTIVE: 'bg-neutral-200 text-neutral-700',
};
const words: Record<string, string> = { IN: 'In stock', LOW: 'Low stock', OUT: 'Out of stock' };
export const Badge = ({ v }: { v: string }) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tone[v] ?? 'bg-neutral-200'}`}>{words[v] ?? v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>;

/**
 * A "⋯" button that opens a small action menu.
 * The menu is positioned on screen (fixed), so it is never cut off by a scrolling table.
 */
export function RowMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', key);
    };
  }, [pos]);

  if (!items.length) return null;

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const h = items.length * 36 + 8;
    setPos({ top: r.bottom + h > window.innerHeight ? r.top - h - 4 : r.bottom + 4, right: window.innerWidth - r.right });
  };

  return (
    <>
      <button ref={btn} type="button" className="btn !px-2 !py-1" aria-label="More actions" aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}>
        <MoreHorizontal size={16} />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setPos(null)} />
          <div role="menu" className="fixed z-50 w-40 rounded-md border border-line bg-white py-1 shadow-lg" style={{ top: pos.top, right: pos.right }}>
            {items.map((it) => (
              <button key={it.label} role="menuitem" type="button" className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-bun hover:text-ink"
                onClick={() => { setPos(null); it.onClick(); }}>
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm border-t border-line">
      <span>{total} total</span>
      <div className="flex items-center gap-2">
        <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export const PageHead = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h1 className="text-2xl font-bold">{title}</h1><div className="flex flex-wrap gap-2">{children}</div></div>
);

type Toast = { id: number; kind: 'ok' | 'err'; text: string };
const ToastCtx = createContext<(kind: 'ok' | 'err', text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((kind: 'ok' | 'err', text: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, kind, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 6000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm" aria-live="polite">
        {list.map((t) => <div key={t.id} role={t.kind === 'err' ? 'alert' : 'status'} className={`rounded-md px-4 py-3 text-sm text-white shadow ${t.kind === 'ok' ? 'bg-pickle' : 'bg-ketchup'}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}