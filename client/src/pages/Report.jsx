import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { COMPLAINT_TYPES } from '../lib/constants';
import { complaintSchema, parse } from '../lib/schemas';
import { CopyButton, Field } from '../components/ui';

const EMPTY = { location: '', pole: '', type: '', description: '', unsafe: false };

export default function Report() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    const r = parse(complaintSchema, { ...values, pole: values.pole || undefined });
    if (r.errors) {
      setErrors(r.errors);
      toast.error('Please fix the highlighted fields');
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api.post('/complaints', r.data);
      setCreated(res.data.data.complaint);
      setValues(EMPTY);
      toast.success('Complaint submitted');
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <div className="card space-y-4" role="status">
          <p className="text-4xl" aria-hidden="true">💡</p>
          <h1 className="text-2xl font-bold">Report received</h1>
          <p className="muted text-sm">Save this ID. Anyone can use it on the Track page to see progress.</p>
          <p className="rounded-xl bg-night-900 py-4 font-display text-4xl font-bold tracking-widest text-sodium-400" aria-label={`Complaint ID ${created.complaintId.split('').join(' ')}`}>
            {created.complaintId}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <CopyButton text={created.complaintId} label="Copy ID" />
            <Link to={`/track/${created.complaintId}`} className="btn-secondary">Track it</Link>
            <Link to="/my-complaints" className="btn-secondary">My complaints</Link>
          </div>
          <button type="button" onClick={() => setCreated(null)} className="btn-primary">Report another fault</button>
        </div>
      </div>
    );
  }

  const len = values.description.length;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-2 text-3xl font-bold">Report a faulty streetlight</h1>
      <p className="muted mb-6 text-sm">The more precise the location, the faster the crew finds it.</p>
      <form onSubmit={onSubmit} noValidate className="card space-y-4">
        <Field id="location" label="Location or landmark *" error={errors.location} hint="Street, area or nearby landmark">
          {(p) => <input {...p} maxLength={120} value={values.location} onChange={set('location')} />}
        </Field>
        <Field id="pole" label="Pole number (optional)" error={errors.pole} hint="Usually printed on the pole">
          {(p) => <input {...p} maxLength={30} value={values.pole} onChange={set('pole')} />}
        </Field>
        <Field id="type" label="Problem type *" error={errors.type}>
          {(p) => (
            <select {...p} value={values.type} onChange={set('type')}>
              <option value="">Select a problem…</option>
              {COMPLAINT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          )}
        </Field>
        <Field id="description" label="Description *" error={errors.description}>
          {(p) => <textarea {...p} rows={4} maxLength={400} value={values.description} onChange={set('description')} />}
        </Field>
        <p className={`-mt-2 text-right text-xs ${len < 10 || len > 380 ? 'text-amber-700 dark:text-amber-300' : 'muted'}`} aria-live="polite">{len}/400 (min 10)</p>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-night-900/15 p-3 dark:border-white/15">
          <input type="checkbox" checked={values.unsafe} onChange={set('unsafe')} className="mt-1 h-5 w-5 accent-sodium-600" />
          <span>
            <span className="block text-sm font-bold">This is an unsafe spot</span>
            <span className="muted block text-xs">Tick if darkness here puts people at risk (crossings, parks, exposed wires). It is highlighted for the repair crew.</span>
          </span>
        </label>
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Submitting…' : 'Submit report'}</button>
      </form>
    </div>
  );
}
