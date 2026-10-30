import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import { todayIso } from './format';

export interface DailySalesData {
  range: { from: string; to: string };
  products: { productId: string; productName: string; unitPriceCentavos: number; quantity: number; totalCentavos: number }[];
  totals: { itemsSold: number; incomeCentavos: number; orders: number };
  daily: { day: string; orders: number; incomeCentavos: number }[];
  payments: { method: string; orders: number; incomeCentavos: number }[];
  cancelledOrders: number;
}

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export function rangeFor(preset: Preset, custom: { from: string; to: string }) {
  const t = todayIso();
  if (preset === 'today') return { from: t, to: t };
  if (preset === 'yesterday') { const y = addDays(t, -1); return { from: y, to: y }; }
  if (preset === 'week') return { from: addDays(t, -6), to: t };
  if (preset === 'month') return { from: `${t.slice(0, 8)}01`, to: t };
  return custom;
}

/** Sales for a date range, straight from completed orders. Admin only; it never asks the server if you are staff. */
export function useDailySales(from: string, to: string, refresh = false) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['daily-sales', from, to],
    queryFn: () => api<DailySalesData>(`/reports/daily-sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    enabled: me?.role === 'ADMIN' && !!from && !!to && from <= to,
    refetchInterval: refresh ? 30_000 : false,
  });
}