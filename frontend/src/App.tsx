import { Navigate, Route, Routes } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { Loading } from './components/ui';
import AppLayout from './layouts/AppLayout';
import { ForgotPage, LoginPage, ResetPage } from './pages/AuthPages';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import { InventoryHub, OrdersHub, SettingsHub } from './pages/Hubs';

function Guard({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { me, loading } = useAuth();
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/login" replace />;
  if (admin && me.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPage />} />
      <Route path="/reset-password" element={<ResetPage />} />
      <Route element={<Guard><AppLayout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<OrdersHub />} />
        <Route path="menu" element={<Products />} />
        <Route path="inventory" element={<InventoryHub />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="reports" element={<Guard admin><Reports /></Guard>} />
        <Route path="settings" element={<Guard admin><SettingsHub /></Guard>} />
        {/* Old addresses still work and land on the right tab */}
        <Route path="suppliers" element={<Navigate to="/inventory?tab=suppliers" replace />} />
        <Route path="daily-sales" element={<Navigate to="/orders?tab=daily-sales" replace />} />
        <Route path="staff" element={<Navigate to="/settings?tab=staff" replace />} />
        <Route path="email" element={<Navigate to="/settings?tab=email" replace />} />
        <Route path="audit" element={<Navigate to="/settings?tab=audit" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}