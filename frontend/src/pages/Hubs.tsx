import { TabbedPage } from '../components/Tabs';
import Orders from './OrderPos'; // your file is named OrderPos.tsx
import DailySales from './DailySales';
import Inventory from './Inventory';
import Suppliers from './Suppliers';
import { AuditPage, EmailPage, SettingsPage, StaffPage } from './AdminPages';

// Each hub is just existing pages placed in tabs. Nothing inside those pages was changed.
// Tabs marked admin are hidden from staff accounts (the server still enforces this too).
// keepMounted keeps that tab's screen alive when you switch tabs (so an unfinished order or your filters are not lost).

// The General tab (store name and units) is hidden for now.
// To show it again, change false to true.
const SHOW_GENERAL_SETTINGS = false;

export const OrdersHub = () => (
  <TabbedPage tabs={[
    { id: 'orders', label: 'Orders', keepMounted: true, element: <Orders /> },
    { id: 'daily-sales', label: 'Daily sales', admin: true, element: <DailySales /> },
  ]} />
);

export const InventoryHub = () => (
  <TabbedPage tabs={[
    { id: 'stock', label: 'Stock', keepMounted: true, element: <Inventory /> },
    { id: 'suppliers', label: 'Suppliers', element: <Suppliers /> },
  ]} />
);

export const SettingsHub = () => (
  <TabbedPage tabs={[
    ...(SHOW_GENERAL_SETTINGS
      ? [{ id: 'general', label: 'General', admin: true, element: <SettingsPage /> }]
      : []),
    { id: 'staff', label: 'Staff', admin: true, element: <StaffPage /> },
    { id: 'email', label: 'Email alerts', admin: true, element: <EmailPage /> },
    { id: 'audit', label: 'Audit log', admin: true, element: <AuditPage /> },
  ]} />
);