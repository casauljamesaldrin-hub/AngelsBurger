const BASE: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
interface Opts { method?: string; body?: unknown; form?: FormData }

export async function apiFull<T = any>(path: string, o: Opts = {}): Promise<{ data: T; message: string }> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: o.method ?? (o.body || o.form ? 'POST' : 'GET'), credentials: 'include',
      headers: { 'X-Requested-With': 'angels-burger', ...(o.body ? { 'Content-Type': 'application/json' } : {}) },
      body: o.form ?? (o.body ? JSON.stringify(o.body) : undefined),
    });
  } catch {
    throw new ApiError('NETWORK', 'Cannot reach the server. Check your connection and that the backend is running.', 0);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new ApiError(json?.error?.code ?? 'ERROR', json?.error?.message ?? 'The request failed.', res.status);
  return { data: json.data, message: json.message };
}
export const api = <T = any>(path: string, o?: Opts) => apiFull<T>(path, o).then((r) => r.data);
export const apiUrl = (path: string) => BASE + path;
export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== null) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
