import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  Eye,
  FileText,
  KeyRound,
  LayoutGrid,
  LogIn,
  Package,
  Plus,
  ShoppingCart,
  User as UserIcon,
  UserCheck,
  Zap,
} from 'lucide-react';
import { api, apiFull } from '../lib/api';
import { when } from '../lib/format';
import { useAuth } from '../lib/auth';
import {
  Badge,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  PageHead,
  Pager,
  useToast,
} from '../components/ui';

function NewUser({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();

  const [v, setV] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF',
  });

  const [passwordError, setPasswordError] = useState('');

  // Prevent spaces and other whitespace in passwords.
  const handlePasswordChange = (value: string) => {
    if (/\s/.test(value)) {
      setPasswordError('Password must not contain spaces.');
      value = value.replace(/\s/g, '');
    } else {
      setPasswordError('');
    }

    setV((prev) => ({
      ...prev,
      password: value,
    }));
  };

  // Validate temporary password.
  const validatePassword = () => {
    if (!v.password) {
      return 'Password is required.';
    }

    if (v.password.length < 10) {
      return 'Password must be at least 10 characters.';
    }

    if (!/[A-Za-z]/.test(v.password)) {
      return 'Password must contain at least one letter.';
    }

    if (!/\d/.test(v.password)) {
      return 'Password must contain at least one number.';
    }

    if (/\s/.test(v.password)) {
      return 'Password must not contain spaces.';
    }

    return '';
  };

  const passwordValidationError = validatePassword();

  const m = useMutation({
    mutationFn: () => {
      const error = validatePassword();

      if (error) {
        throw new Error(error);
      }

      return api('/users', { body: v });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast('ok', 'Account created');
      onClose();
    },
    onError: (e: Error) => toast('err', e.message),
  });

  return (
    <Modal title="Add staff account" onClose={onClose}>
      <Field label="Name">
        <input
          className="input"
          value={v.name}
          onChange={(e) =>
            setV({ ...v, name: e.target.value })
          }
        />
      </Field>

      <Field label="Email">
        <input
          className="input"
          type="email"
          value={v.email}
          onChange={(e) =>
            setV({ ...v, email: e.target.value })
          }
        />
      </Field>

      <Field label="Temporary password (10+ characters, with a letter and a number)">
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={v.password}
          onChange={(e) => handlePasswordChange(e.target.value)}
          required
        />

        {passwordError && (
          <p className="err mt-1" role="alert">
            {passwordError}
          </p>
        )}

        {!passwordError && passwordValidationError && v.password.length > 0 && (
          <p className="text-xs text-neutral-500 mt-1">
            {passwordValidationError}
          </p>
        )}

        {!passwordError && !passwordValidationError && v.password.length > 0 && (
          <p className="text-xs text-green-600 mt-1">
            Password meets all requirements.
          </p>
        )}
      </Field>

      <Field label="Role">
        <select
          className="input"
          value={v.role}
          onChange={(e) =>
            setV({ ...v, role: e.target.value })
          }
        >
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Admin</option>
        </select>
      </Field>

      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>

        <button
          className="btn btn-primary"
          disabled={
            m.isPending ||
            !!passwordValidationError ||
            !v.name.trim() ||
            !v.email.trim()
          }
          onClick={() => m.mutate()}
        >
          {m.isPending ? 'Creating...' : 'Create account'}
        </button>
      </div>
    </Modal>
  );
}

export function StaffPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [add, setAdd] = useState(false);

  const q = useQuery({
    queryKey: ['users'],
    queryFn: () => api('/users'),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      api(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast('ok', 'Saved');
    },
    onError: (e: Error) => toast('err', e.message),
  });

  return (
    <>
      <PageHead title="Staff">
        <button
          className="btn btn-primary"
          onClick={() => setAdd(true)}
        >
          <Plus size={16} />
          Add account
        </button>
      </PageHead>

      <p className="text-sm text-neutral-600 mb-3">
        Email alerts go only to the active accounts ticked below.
      </p>

      <div className="card overflow-x-auto">
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} />
        ) : (
          <table className="w-full">
            <thead className="border-b border-line">
              <tr>
                {[
                  'Name',
                  'Email',
                  'Role',
                  'Status',
                  'Low stock',
                  'Out of stock',
                  'Daily summary',
                  '',
                ].map((h) => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {q.data.map((u: any) => (
                <tr
                  key={u.id}
                  className={u.active ? '' : 'opacity-60'}
                >
                  <td className="td font-medium">{u.name}</td>
                  <td className="td">{u.email}</td>
                  <td className="td">
                    {u.role === 'ADMIN' ? 'Admin' : 'Staff'}
                  </td>
                  <td className="td">
                    {u.active ? 'Active' : 'Deactivated'}
                  </td>

                  {(
                    [
                      'notifyLowStock',
                      'notifyOutOfStock',
                      'notifyDailySummary',
                    ] as const
                  ).map((k) => (
                    <td key={k} className="td">
                      <input
                        type="checkbox"
                        aria-label={`${k} for ${u.name}`}
                        checked={u[k]}
                        onChange={(e) =>
                          patch.mutate({
                            id: u.id,
                            body: { [k]: e.target.checked },
                          })
                        }
                      />
                    </td>
                  ))}

                  <td className="td">
                    {u.id !== me?.id && (
                      <button
                        className="btn !px-2.5 !py-1"
                        onClick={() =>
                          confirm(
                            `${u.active ? 'Deactivate' : 'Reactivate'} ${u.name}?`
                          ) &&
                          patch.mutate({
                            id: u.id,
                            body: { active: !u.active },
                          })
                        }
                      >
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {add && <NewUser onClose={() => setAdd(false)} />}
    </>
  );
}

export function EmailPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);

  const st = useQuery({
    queryKey: ['email-status'],
    queryFn: () => api('/email/status'),
  });

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api('/users'),
  });

  const [to, setTo] = useState('');

  const hist = useQuery({
    queryKey: ['email-hist', page],
    queryFn: () => api(`/email/notifications?page=${page}&pageSize=15`),
  });

  const test = useMutation({
    mutationFn: () =>
      apiFull('/email/test', { body: { userId: to || undefined } }),
    onSuccess: (r) => {
      toast('ok', r.message);
      qc.invalidateQueries({ queryKey: ['email-hist'] });
    },
    onError: (e: Error) => {
      toast('err', e.message);
      qc.invalidateQueries({ queryKey: ['email-hist'] });
    },
  });

  const proc = useMutation({
    mutationFn: () => api('/email/process', { body: {} }),
    onSuccess: (r: any) => {
      toast(
        'ok',
        `Processed ${r.processed}: ${r.accepted} accepted, ${r.failed} failed`
      );
      qc.invalidateQueries({ queryKey: ['email-hist'] });
    },
    onError: (e: Error) => toast('err', e.message),
  });

  return (
    <>
      <PageHead title="Email notifications" />

      <section className="card p-4 mb-4">
        {st.data && (
          st.data.configured
            ? null
            : (
              <p className="text-sm text-ketchup" role="alert">
                Email is not configured. Missing on the server:{' '}
                <b>{st.data.missing.join(', ')}</b>.
                Add them to the backend environment and restart.
                See the README.
              </p>
            )
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          <select
            className="input !w-auto"
            aria-label="Send test to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
            <option value="">Me</option>
            {users.data
              ?.filter((u: any) => u.active)
              .map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
          </select>

          <button
            className="btn btn-primary"
            disabled={test.isPending}
            onClick={() => test.mutate()}
          >
            {test.isPending ? 'Sending…' : 'Send test email'}
          </button>

          <button
            className="btn"
            disabled={proc.isPending}
            onClick={() => proc.mutate()}
          >
            Retry pending emails
          </button>
        </div>

        <p className="text-xs text-neutral-600 mt-2">
          Choose who receives low-stock, out-of-stock and daily-summary emails on the Staff page.
        </p>
      </section>

      <div className="card overflow-x-auto">
        {hist.isLoading ? (
          <Loading />
        ) : hist.error ? (
          <ErrorBox error={hist.error} />
        ) : !hist.data.items.length ? (
          <Empty title="No emails sent yet" />
        ) : (
          <>
            <table className="w-full">
              <thead className="border-b border-line">
                <tr>
                  {[
                    'When',
                    'Type',
                    'To',
                    'Subject',
                    'Status',
                    'Tries',
                    'Note',
                  ].map((h) => (
                    <th key={h} className="th">{h}</th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-line">
                {hist.data.items.map((n: any) => (
                  <tr key={n.id}>
                    <td className="td">{when(n.createdAt)}</td>
                    <td className="td">
                      {n.type.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="td">{n.recipient}</td>
                    <td className="td">{n.subject}</td>
                    <td className="td"><Badge v={n.status} /></td>
                    <td className="td">{n.attempts}</td>
                    <td className="td text-xs text-neutral-600">
                      {n.error ?? n.providerMessageId ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pager
              page={hist.data.page}
              pageSize={hist.data.pageSize}
              total={hist.data.total}
              onPage={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}

// ---------- Audit log helpers ----------

const ACTION_STYLES: Record<
  string,
  { label: string; cls: string; icon: ReactNode }
> = {
  login: {
    label: 'Login',
    cls: 'bg-green-100 text-green-700',
    icon: <LogIn size={12} />,
  },
  order_confirmed: {
    label: 'Order Confirmed',
    cls: 'bg-purple-100 text-purple-700',
    icon: <CheckCircle2 size={12} />,
  },
  order_completed: {
    label: 'Order Completed',
    cls: 'bg-blue-100 text-blue-700',
    icon: <CheckCircle2 size={12} />,
  },
  password_reset: {
    label: 'Password Reset',
    cls: 'bg-amber-100 text-amber-700',
    icon: <KeyRound size={12} />,
  },
  export: {
    label: 'Export',
    cls: 'bg-teal-100 text-teal-700',
    icon: <Download size={12} />,
  },
  create: {
    label: 'Create',
    cls: 'bg-emerald-100 text-emerald-700',
    icon: <Plus size={12} />,
  },
};

const MODULE_STYLES: Record<
  string,
  { label: string; cls: string; icon: ReactNode }
> = {
  User: {
    label: 'User',
    cls: 'bg-violet-100 text-violet-700',
    icon: <UserIcon size={12} />,
  },
  Order: {
    label: 'Orders',
    cls: 'bg-orange-100 text-orange-700',
    icon: <ShoppingCart size={12} />,
  },
  InventoryTransaction: {
    label: 'Inventory',
    cls: 'bg-teal-100 text-teal-700',
    icon: <Package size={12} />,
  },
};

const titleCase = (s: string) =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function ActionBadge({ action }: { action: string }) {
  const key = action.toLowerCase();
  const s = ACTION_STYLES[key] ?? {
    label: titleCase(action),
    cls: 'bg-neutral-100 text-neutral-700',
    icon: <Circle size={12} />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${s.cls}`}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

function ModuleBadge({ entity }: { entity: string }) {
  const s = MODULE_STYLES[entity] ?? {
    label: entity,
    cls: 'bg-neutral-100 text-neutral-700',
    icon: <LayoutGrid size={12} />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${s.cls}`}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

// Turn the raw action + details JSON into a readable sentence.
function describe(a: any): string {
  const action = String(a.action ?? '').toLowerCase();
  const d = a.details ?? {};
  const moduleLabel = (MODULE_STYLES[a.entity]?.label ?? a.entity ?? '').toLowerCase();

  switch (action) {
    case 'login':
      return 'User logged in successfully';
    case 'password_reset':
      return 'Password reset requested';
    case 'order_confirmed':
      return d.orderNumber ? `Order #${d.orderNumber} confirmed` : 'Order confirmed';
    case 'order_completed':
      return d.orderNumber ? `Order #${d.orderNumber} completed` : 'Order completed';
    case 'export':
      return `Exported ${moduleLabel} report${d.rows != null ? ` (rows: ${d.rows})` : ''}`;
    default:
      return a.details ? JSON.stringify(a.details) : titleCase(String(a.action));
  }
}

function LogDetailModal({ log, onClose }: { log: any; onClose: () => void }) {
  const rows: [string, ReactNode][] = [
    ['When', when(log.createdAt)],
    ['Who', log.actor?.name ?? 'System'],
    ['Action', <ActionBadge key="a" action={log.action} />],
    ['Module', <ModuleBadge key="m" entity={log.entity} />],
    ['Details', describe(log)],
  ];

  return (
    <Modal title="Log details" onClose={onClose}>
      <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-sm mb-4">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-neutral-500">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {log.details && (
        <>
          <p className="text-xs text-neutral-500 mb-1">Raw data</p>
          <pre className="rounded-lg bg-neutral-100 p-3 text-xs overflow-x-auto mb-4">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </>
      )}

      <div className="flex justify-end">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function pageWindow(page: number, totalPages: number): number[] {
  const size = 5;
  let start = Math.max(1, page - Math.floor(size / 2));
  const end = Math.min(totalPages, start + size - 1);
  start = Math.max(1, end - size + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// ---------- Audit log page ----------

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any | null>(null);

  const q = useQuery({
    queryKey: ['audit', page],
    queryFn: () => api(`/audit-logs?page=${page}&pageSize=25`),
  });

  const headers: { label: string; icon: ReactNode }[] = [
    { label: 'When', icon: <Calendar size={14} /> },
    { label: 'Who', icon: <UserIcon size={14} /> },
    { label: 'Action', icon: <Zap size={14} /> },
    { label: 'Module', icon: <LayoutGrid size={14} /> },
    { label: 'Details', icon: <FileText size={14} /> },
    { label: '', icon: null },
  ];

  return (
    <>
      <PageHead title="Audit log" />

      <div className="card overflow-hidden rounded-2xl border border-amber-200/70 shadow-sm">
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} />
        ) : !q.data.items.length ? (
          <Empty title="Nothing logged yet" />
        ) : (
          (() => {
            const { items, total, pageSize } = q.data;
            const current = q.data.page;
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const from = (current - 1) * pageSize + 1;
            const to = Math.min(current * pageSize, total);

            return (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-100/80">
                      <tr>
                        {headers.map((h, i) => (
                          <th
                            key={i}
                            className="px-4 py-3 text-left text-xs font-semibold text-neutral-800 whitespace-nowrap"
                          >
                            <span className="inline-flex items-center gap-2">
                              {h.icon}
                              {h.label}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {items.map((a: any) => (
                        <tr
                          key={a.id}
                          className="odd:bg-white even:bg-amber-50/60 hover:bg-amber-100/50 transition-colors"
                        >
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {when(a.createdAt)}
                          </td>

                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-2">
                              <UserCheck size={14} className="text-neutral-500" />
                              {a.actor?.name ?? 'System'}
                            </span>
                          </td>

                          <td className="px-4 py-2.5">
                            <ActionBadge action={a.action} />
                          </td>

                          <td className="px-4 py-2.5">
                            <ModuleBadge entity={a.entity} />
                          </td>

                          <td className="px-4 py-2.5 text-neutral-700">
                            {describe(a)}
                          </td>

                          <td className="px-4 py-2.5 text-right">
                            <button
                              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1 text-xs font-medium hover:bg-neutral-50"
                              onClick={() => setSelected(a)}
                            >
                              <Eye size={14} />
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200/70 bg-white px-4 py-3">
                  <p className="text-xs text-neutral-600">
                    Showing {from}–{to} of {total} logs
                  </p>

                  <div className="flex items-center gap-1">
                    <button
                      className="grid h-8 w-8 place-items-center rounded-lg hover:bg-neutral-100 disabled:opacity-40"
                      disabled={current <= 1}
                      onClick={() => setPage(current - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    {pageWindow(current, totalPages).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        aria-current={p === current ? 'page' : undefined}
                        className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-medium ${
                          p === current
                            ? 'bg-amber-400 text-neutral-900'
                            : 'hover:bg-neutral-100'
                        }`}
                      >
                        {p}
                      </button>
                    ))}

                    <button
                      className="grid h-8 w-8 place-items-center rounded-lg hover:bg-neutral-100 disabled:opacity-40"
                      disabled={current >= totalPages}
                      onClick={() => setPage(current + 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            );
          })()
        )}
      </div>

      {selected && (
        <LogDetailModal log={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: ['settings'],
    queryFn: () => api('/settings'),
  });

  const [name, setName] = useState<string | null>(null);
  const [units, setUnits] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      api('/settings', {
        method: 'PUT',
        body: {
          storeName: name ?? q.data.storeName,
          units: (units ?? q.data.units.join(','))
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast('ok', 'Settings saved');
    },
    onError: (e: Error) => toast('err', e.message),
  });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;

  return (
    <>
      <PageHead title="Settings" />

      <section className="card p-4 max-w-lg">
        <Field label="Store name">
          <input
            className="input"
            value={name ?? q.data.storeName}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Units you use (comma separated)">
          <input
            className="input"
            value={units ?? q.data.units.join(', ')}
            onChange={(e) => setUnits(e.target.value)}
          />
        </Field>

        <button
          className="btn btn-primary"
          disabled={m.isPending}
          onClick={() => m.mutate()}
        >
          Save settings
        </button>
      </section>
    </>
  );
}