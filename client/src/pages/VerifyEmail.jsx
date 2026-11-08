import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';
import { parse, verifyCodeSchema } from '../lib/schemas';
import { Field } from '../components/ui';

// The server says "Please wait 42 seconds ..."; show the same countdown.
const secondsFrom = (message) => Number((/(\d+)\s+seconds?/.exec(message || '') || [])[1]) || 0;

export default function VerifyEmail() {
  const { user, verifyEmail, resendCode } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState(state?.email || '');
  const [step, setStep] = useState(state?.email ? 'code' : 'email'); // 'email' = ask which address first
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [info, setInfo] = useState(state?.fromLogin ? 'We sent you a new code.' : '');
  const [cooldown, setCooldown] = useState(state?.resendAfterSeconds || 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/report'} replace />;

  async function sendCode(e) {
    e?.preventDefault();
    setFormError('');
    setInfo('');
    const r = parse(verifyCodeSchema.pick({ email: true }), { email });
    if (r.errors) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    try {
      const sent = await resendCode(r.data.email);
      setEmail(r.data.email);
      setStep('code');
      setCode('');
      setCooldown(sent.resendAfterSeconds || 60);
      setInfo(`If ${r.data.email} is waiting to be verified, a code is on its way.`);
    } catch (err) {
      const wait = secondsFrom(errorMessage(err));
      if (wait) {
        // a code was sent very recently and is still valid: go on to the code screen
        setEmail(r.data.email);
        setStep('code');
        setCooldown(wait);
        setInfo('A code was sent a moment ago. Enter it below.');
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e) {
    e.preventDefault();
    setFormError('');
    const r = parse(verifyCodeSchema, { email, code });
    if (r.errors) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    try {
      const u = await verifyEmail(r.data);
      toast.success(`Email verified. Welcome, ${u.name.split(' ')[0]}!`);
      navigate(u.role === 'admin' ? '/admin' : '/report', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setFormError('');
    setBusy(true);
    try {
      const sent = await resendCode(email);
      setCooldown(sent.resendAfterSeconds || 60);
      setInfo('A new code is on its way. Any earlier code no longer works.');
      setCode('');
    } catch (err) {
      const wait = secondsFrom(errorMessage(err));
      if (wait) setCooldown(wait);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'email') {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-3xl font-bold">Verify your email</h1>
        <p className="muted mb-6 text-sm">Enter the email you signed up with and we will send you a new 6-digit code.</p>
        <form onSubmit={sendCode} noValidate className="card space-y-4">
          {formError && <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-900 dark:bg-red-400/15 dark:text-red-300">{formError}</p>}
          <Field id="email" label="Email" error={errors.email}>
            {(p) => <input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Sending…' : 'Send me a code'}</button>
          <p className="muted text-center text-sm">
            No account yet? <Link to="/register" className="font-bold underline">Sign up</Link>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-3xl font-bold">Check your email</h1>
      <p className="muted mb-6 text-sm">
        We sent a 6-digit code to <b className="text-night-900 dark:text-slate-100">{email}</b>. It expires in {state?.expiresInMinutes || 10} minutes. Look in your spam folder if you do not see it.
      </p>
      <form onSubmit={onVerify} noValidate className="card space-y-4">
        {info && <p role="status" className="rounded-lg bg-green-100 px-3 py-2 text-sm text-green-900 dark:bg-green-400/15 dark:text-green-200">{info}</p>}
        {formError && <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-900 dark:bg-red-400/15 dark:text-red-300">{formError}</p>}
        <Field id="code" label="6-digit code" error={errors.code}>
          {(p) => (
            <input
              {...p}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className={`${p.className} text-center font-display text-2xl tracking-[0.5em]`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          )}
        </Field>
        <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full">{busy ? 'Checking…' : 'Verify and continue'}</button>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" onClick={onResend} disabled={busy || cooldown > 0} className="btn-secondary">
            {cooldown > 0 ? `Send a new code (${cooldown}s)` : 'Send a new code'}
          </button>
          <button type="button" onClick={() => { setStep('email'); setFormError(''); setInfo(''); }} className="font-bold underline">
            Use a different email
          </button>
        </div>
      </form>
    </div>
  );
}
