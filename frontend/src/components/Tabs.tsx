import { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// Several existing pages shown as tabs on ONE page. The chosen tab is kept in the address (?tab=staff),
// so refresh, the Back button and bookmarks all land on the same tab.
export interface TabDef {
  id: string;
  label: string;
  admin?: boolean;
  // Keep this tab alive (just hidden) when you switch to another tab, so nothing typed or chosen on it is lost.
  // Use it for the Orders screen so a half-finished order survives a look at Daily sales.
  keepMounted?: boolean;
  element: ReactNode;
}

export const visibleTabs = (tabs: TabDef[], isAdmin: boolean) => tabs.filter((t) => !t.admin || isAdmin);
// An unknown or not-allowed tab (for example staff typing ?tab=daily-sales) falls back to the first allowed one.
export const activeTab = (visible: TabDef[], wanted: string | null) => visible.find((t) => t.id === wanted) ?? visible[0];

export function TabbedPage({ tabs }: { tabs: TabDef[] }) {
  const { me } = useAuth();
  const [sp, setSp] = useSearchParams();
  const visible = visibleTabs(tabs, me?.role === 'ADMIN');
  const active = activeTab(visible, sp.get('tab'));
  if (!active) return null;
  const multi = visible.length > 1;
  const go = (id: string) => {
    const next = new URLSearchParams(sp);
    if (id === visible[0].id) next.delete('tab'); else next.set('tab', id);
    setSp(next);
  };
  return (
    // With tabs shown, the tab itself is the page title, so each inner page's own big heading is hidden
    // (still available to screen readers) and its action buttons (Print, Add account...) stay on the right.
    <div className={multi ? '[&_h1]:sr-only [&_h1+div]:ml-auto' : ''}>
      {multi && (
        // overflow-y-hidden + pb-px: the active tab sits 1px over the grey line (-mb-px). Without these two,
        // the browser adds a tiny vertical scrollbar with up/down arrows to this row.
        <div role="tablist" aria-label="Sections" className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line pb-px">
          {visible.map((t) => (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={t.id === active.id} aria-controls={`tab-panel-${t.id}`}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm ${t.id === active.id ? 'border-amber-500 font-semibold text-neutral-900' : 'border-transparent text-neutral-600 hover:text-neutral-900'}`}
              onClick={() => go(t.id)}>{t.label}</button>))}
        </div>)}
      {visible.map((t) => {
        const on = t.id === active.id;
        if (!on && !t.keepMounted) return null;
        return (
          <div key={t.id} role="tabpanel" id={`tab-panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={!on}>{t.element}</div>
        );
      })}
    </div>
  );
}