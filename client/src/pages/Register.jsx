import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { errorMessage, fieldErrors } from '../lib/api';
import { parse, registerSchema } from '../lib/schemas';
import { Field } from '../components/ui';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/my-complaints" replace />;
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    const r = parse(registerSchema, { ...values, phone: values.phone || undefined });
    if (r.errors) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    try {
      await register({ ...values });
      toast.success('Account created. You are logged in.');
      navigate('/report', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-3xl font-bold">Create your account</h1>
      <form onSubmit={onSubmit} noValidate className="card space-y-4">
        {formError && <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-900 dark:bg-red-400/15 dark:text-red-300">{formError}</p>}
        <Field id="name" label="Full name" error={errors.name}>
          {(p) => <input {...p} autoComplete="name" value={values.name} onChange={set('name')} />}
        </Field>
        <Field id="email" label="Email" error={errors.email}>
          {(p) => <input {...p} type="email" autoComplete="email" value={values.email} onChange={set('email')} />}
        </Field>
        <Field id="phone" label="Phone (optional)" error={errors.phone} hint="10 digits, no spaces or country code">
          {(p) => <input {...p} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={values.phone} onChange={set('phone')} />}
        </Field>
        <Field id="password" label="Password" error={errors.password} hint="At least 8 characters">
          {(p) => <input {...p} type="password" autoComplete="new-password" value={values.password} onChange={set('password')} />}
        </Field>
        <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword}>
          {(p) => <input {...p} type="password" autoComplete="new-password" value={values.confirmPassword} onChange={set('confirmPassword')} />}
        </Field>
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Creating account…' : 'Sign up'}</button>
        <p className="muted text-center text-sm">
          Already registered? <Link to="/login" className="font-bold underline">Log in</Link>
        </p>
      </form>
    </div>
  );
}
