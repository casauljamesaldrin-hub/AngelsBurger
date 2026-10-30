import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  ChevronRight,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  UserRound,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
// Adjust this path if BurgerArt lives somewhere else in your project.
import { BurgerArt, BurgerLineArt } from '../components/BurgerArt';
 
const items = [
     { to: '/', label: 'Dashboard', icon: LayoutDashboard },
     { to: '/orders', label: 'Orders', icon: ReceiptText },
     { to: '/menu', label: 'Menu and recipes', icon: UtensilsCrossed },
     { to: '/inventory', label: 'Inventory', icon: Boxes },
     { to: '/transactions', label: 'Stock history', icon: History },
     { to: '/reports', label: 'Reports', icon: BarChart3, admin: true },
     { to: '/settings', label: 'Settings', icon: Settings, admin: true },
   ];

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 pb-4 pt-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100">
        <BurgerArt className="w-8" />
      </span>
      <div className="leading-tight">
        <p className="font-display text-xl font-bold italic text-white">
          Angels <span className="text-amber-400">Burger</span>
        </p>
        <p className="text-[11px] text-neutral-400">Good Food • Happy People</p>
      </div>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { me, logout } = useAuth();

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-ink text-white">
      <Brand />

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
        <nav className="flex flex-col gap-0.5 px-3 py-2" aria-label="Main">
          {items
            .filter((i) => !i.admin || me?.role === 'ADMIN')
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-amber-400 font-semibold text-neutral-900 shadow-sm'
                      : 'text-neutral-200 hover:bg-white/10'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      className={isActive ? 'text-neutral-900' : 'text-amber-400'}
                    />
                    <span className="flex-1">{label}</span>
                    {isActive && <ChevronRight size={16} />}
                  </>
                )}
              </NavLink>
            ))}
        </nav>
      </div>

      <div className="relative z-10 mx-4 shrink-0 border-t border-white/10 pb-16 pt-3">
        <div className="flex items-center gap-3 px-1">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-400 text-neutral-900">
            <UserRound size={20} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{me?.name}</p>
            <p className="text-xs text-neutral-400">
              {me?.role === 'ADMIN' ? 'Admin' : 'Staff'}
            </p>
          </div>
        </div>

        <button
          className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-amber-400 hover:font-semibold hover:text-neutral-900"
          onClick={logout}
        >
          <LogOut size={18} className="text-amber-400" />
          Sign out
        </button>
      </div>

      {/* Decorative footer: wave + burger line art */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14" aria-hidden="true">
        <svg
          className="absolute bottom-0 left-0 w-full"
          viewBox="0 0 240 56"
          preserveAspectRatio="none"
          height="56"
        >
          <path
            d="M0 26 C40 10 80 42 140 28 C190 18 220 8 240 14 L240 56 L0 56 Z"
            fill="rgba(251,191,36,0.14)"
          />
          <path
            d="M0 26 C40 10 80 42 140 28 C190 18 220 8 240 14"
            fill="none"
            stroke="rgba(251,191,36,0.7)"
            strokeWidth="2"
          />
        </svg>
        <BurgerLineArt className="absolute -bottom-2 right-2 w-20 text-amber-400 opacity-80" />
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);

  // Close the drawer with Escape and lock page scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
        <SidebarBody />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu />
        </button>
        <span className="font-display font-bold italic">
          Angels <span className="text-amber-400">Burger</span>
        </span>
        <button onClick={logout} aria-label="Sign out">
          <LogOut size={20} />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="relative w-72 max-w-[85vw]"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarBody onNavigate={() => setOpen(false)} />
            <button
              className="absolute right-3 top-4 rounded-lg p-1 text-neutral-300 hover:bg-white/10"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}

      <main className="min-w-0 flex-1 p-4 lg:p-6">
        <Outlet />
      </main>
    </div>
  );
}