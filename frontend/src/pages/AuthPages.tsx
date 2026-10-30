import { ReactNode, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { api, apiFull } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field } from '../components/ui';
import { AuthShell } from '../components/AuthShell';

// Shared password validation
const passwordSchema = z.string()
  .min(1, 'Enter your password')
  .regex(/^\S+$/, 'Password must not contain spaces');

// Password validation for new passwords
const newPasswordSchema = z.string()
  .min(10, 'Use at least 10 characters')
  .regex(/^\S+$/, 'Password must not contain spaces')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

// Removes any whitespace as the user types or pastes
const noSpaces = (reg: UseFormRegisterReturn): UseFormRegisterReturn => ({
  ...reg,
  onChange: (e: { target: any; type?: any }) => {
    e.target.value = e.target.value.replace(/\s/g, '');
    return reg.onChange(e);
  },
});

// Authentication layout
function Shell({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <AuthShell>
      {title && (
        <h1 className="mb-4 text-center text-base font-bold text-gray-900">
          {title}
        </h1>
      )}
      {children}
    </AuthShell>
  );
}

const primaryBtn = 'btn btn-primary w-full !bg-red-600 hover:!bg-red-700';

// LOGIN PAGE
export function LoginPage() {
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);

  const f = useForm({
    resolver: zodResolver(
      z.object({
        email: z.string().email('Enter a valid email'),
        password: passwordSchema,
      })
    ),
  });

  if (me) return <Navigate to="/" replace />;

  return (
    <Shell>
      <form
        onSubmit={f.handleSubmit(async (v) => {
          setErr('');
          try {
            await api('/auth/login', { body: v });
            refresh();
            nav('/');
          } catch (e: any) {
            setErr(e.message);
          }
        })}
      >
        <Field
          label="Email"
          error={f.formState.errors.email?.message as string}
        >
          <input
            className="input"
            type="email"
            autoComplete="username"
            {...noSpaces(f.register('email'))}
          />
        </Field>

        <Field
          label="Password"
          error={f.formState.errors.password?.message as string}
        >
          <span className="relative block">
            <input
              className="input pr-10"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              {...noSpaces(f.register('password'))}
            />

            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-700"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </Field>

        {err && (
          <p className="err mb-2" role="alert">
            {err}
          </p>
        )}

        <button
          className={primaryBtn}
          disabled={f.formState.isSubmitting}
        >
          Log In
        </button>

        <p className="mt-3 text-center text-xs">
          <Link
            className="text-red-600 hover:underline"
            to="/forgot-password"
          >
            Forgot your password?
          </Link>
        </p>
      </form>
    </Shell>
  );
}

// FORGOT PASSWORD PAGE
export function ForgotPage() {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const f = useForm({
    resolver: zodResolver(
      z.object({
        email: z.string().email('Enter a valid email'),
      })
    ),
  });

  return (
    <Shell title="Reset password">
      {msg ? (
        <p role="status">{msg}</p>
      ) : (
        <form
          onSubmit={f.handleSubmit(async (v) => {
            setErr('');
            try {
              setMsg(
                (await apiFull('/auth/forgot-password', {
                  body: v,
                })).message
              );
            } catch (e: any) {
              setErr(e.message);
            }
          })}
        >
          <Field
            label="Account email"
            error={f.formState.errors.email?.message as string}
          >
            <input
              className="input"
              type="email"
              {...noSpaces(f.register('email'))}
            />
          </Field>

          {err && (
            <p className="err mb-2" role="alert">
              {err}
            </p>
          )}

          <button
            className={primaryBtn}
            disabled={f.formState.isSubmitting}
          >
            Send reset link
          </button>
        </form>
      )}

      <p className="mt-3 text-center text-xs">
        <Link className="text-red-600 hover:underline" to="/login">
          Back to sign in
        </Link>
      </p>
    </Shell>
  );
}

// RESET PASSWORD PAGE
export function ResetPage() {
  const [sp] = useSearchParams();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const schema = z.object({
    password: newPasswordSchema,
    confirm: z.string()
      .min(1, 'Please confirm your password')
      .regex(/^\S+$/, 'Password must not contain spaces'),
  }).refine(
    (v) => v.password === v.confirm,
    {
      path: ['confirm'],
      message: 'Passwords do not match',
    }
  );

  const f = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <Shell title="Choose a new password">
      {done ? (
        <p role="status">
          Password updated.{' '}
          <Link className="text-red-600 hover:underline" to="/login">
            Sign in
          </Link>
        </p>
      ) : (
        <form
          onSubmit={f.handleSubmit(async (v) => {
            setErr('');
            try {
              await api('/auth/reset-password', {
                body: {
                  token: sp.get('token') ?? '',
                  password: v.password,
                },
              });
              setDone(true);
            } catch (e: any) {
              setErr(e.message);
            }
          })}
        >
          <Field
            label="New password"
            error={f.formState.errors.password?.message as string}
          >
            <span className="relative block">
              <input
                className="input pr-10"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                {...noSpaces(f.register('password'))}
              />

              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </Field>

          <Field
            label="Confirm password"
            error={f.formState.errors.confirm?.message as string}
          >
            <span className="relative block">
              <input
                className="input pr-10"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                {...noSpaces(f.register('confirm'))}
              />

              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-700"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </Field>

          {err && (
            <p className="err mb-2" role="alert">
              {err}
            </p>
          )}

          <button
            className={primaryBtn}
            disabled={f.formState.isSubmitting}
          >
            Save password
          </button>
        </form>
      )}
    </Shell>
  );
}
