import { Link } from 'react-router-dom';
import { ReceiptText, ShoppingBag, Wallet } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { peso, todayIso } from '../lib/format';
import { useDailySales } from '../lib/dailySales';

// Today's total income for the admin dashboard. Shows nothing for staff.
// Refreshes every 30 seconds, and whenever an order is completed or cancelled.
export function DailyIncomeCard() {
  const { me } = useAuth();
  const t = todayIso();
  const q = useDailySales(t, t, true);
  if (me?.role !== 'ADMIN') return null;

  const totals = q.data?.totals;

  return (
    <section className="card p-5 mb-4" aria-label="Today's income">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Wallet size={18} />
          </span>
          <p className="text-sm font-semibold text-neutral-600">Today's total income</p>
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Live</span>
      </div>

      {/* Body */}
      {q.isLoading ? <p className="mt-3 text-sm text-neutral-600" role="status">Loading…</p>
        : q.error || !totals ? <p className="mt-3 text-sm text-ketchup" role="alert">Could not load today's sales.</p>
        : (
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <p className="text-4xl font-extrabold" data-testid="today-income">{peso(totals.incomeCentavos)}</p>

            <div className="grid grid-cols-2 gap-3 md:w-auto">
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5">
                <ReceiptText size={20} className="text-neutral-500" />
                <div>
                  <p className="text-lg font-bold leading-tight">{totals.orders}</p>
                  <p className="text-xs text-neutral-600">completed order{totals.orders === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5">
                <ShoppingBag size={20} className="text-neutral-500" />
                <div>
                  <p className="text-lg font-bold leading-tight">{totals.itemsSold}</p>
                  <p className="text-xs text-neutral-600">item{totals.itemsSold === 1 ? '' : 's'} sold</p>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-3">
        <p className="text-xs text-neutral-600">Sales revenue only (not profit).</p>
        <Link
          to="/daily-sales"
          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1 text-sm font-medium text-neutral-800 no-underline transition-colors hover:border-bun hover:bg-bun hover:text-ink"
        >
          See sales by product →
        </Link>
      </div>
    </section>
  );
}