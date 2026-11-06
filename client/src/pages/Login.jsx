import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { errorMessage, fieldErrors } from '../lib/api';
import { loginSchema, parse } from '../lib/schemas';
import { Field } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/my-complaints'} replace />;
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    const r = parse(loginSchema, values);
    if (r.errors) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    try {
      const u = await login(r.data);
      toast.success(`Welcome back, ${u.name.split(' ')[0]}`);
      navigate(location.state?.from || (u.role === 'admin' ? '/admin' : '/my-complaints'), { replace: true });
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
      <h1 className="mb-6 text-3xl font-bold">Log in</h1>
      <form onSubmit={onSubmit} noValidate className="card space-y-4">
        {formError && <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-900 dark:bg-red-400/15 dark:text-red-300">{formError}</p>}
        <Field id="email" label="Email" error={errors.email}>
          {(p) => <input {...p} type="email" autoComplete="email" value={values.email} onChange={set('email')} />}
        </Field>
        <Field id="password" label="Password" error={errors.password}>
          {(p) => <input {...p} type="password" autoComplete="current-password" value={values.password} onChange={set('password')} />}
        </Field>
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Logging in…' : 'Log in'}</button>
        <p className="muted text-center text-sm">
          New here? <Link to="/register" className="font-bold underline">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
