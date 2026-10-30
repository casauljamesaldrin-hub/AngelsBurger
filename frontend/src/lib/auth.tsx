import { createContext, ReactNode, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface Me { id: string; email: string; name: string; role: 'ADMIN' | 'STAFF' }
interface Ctx { me: Me | null; loading: boolean; logout: () => Promise<void>; refresh: () => void }
const AuthCtx = createContext<Ctx>({ me: null, loading: true, logout: async () => {}, refresh: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), retry: false, staleTime: 60_000 });
  const logout = async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    qc.setQueryData(['me'], null);
    qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
  };
  return <AuthCtx.Provider value={{ me: q.data ?? null, loading: q.isLoading, logout, refresh: () => qc.invalidateQueries({ queryKey: ['me'] }) }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx); 