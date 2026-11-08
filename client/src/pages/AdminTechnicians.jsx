import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { parse, technicianSchema } from '../lib/schemas';
import { EmptyState, ErrorState, Field, Modal, Spinner } from '../components/ui';

export function TechnicianModal({ technician, onClose, onSaved }) {
  const editing = Boolean(technician);
  const [values, setValues] = useState({ name: technician?.name || '', phone: technician?.phone || '', area: technician?.area || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const r = parse(technicianSchema, values);
    if (r.errors) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    try {
      const res = editing
        ? await api.patch(`/admin/technicians/${technician.id}`, r.data)
        : await api.post('/admin/technicians', r.data);
      toast.success(editing ? 'Technician updated' : `${r.data.name} added`);
      onSaved(res.data.data.technician);
      return onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
      return setBusy(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${technician.name}` : 'Add a technician'} onClose={onClose}>
      <form onSubmit={save} noValidate className="space-y-4">
        <Field id="tech-name" label="Name *" error={errors.name}>
          {(p) => <input {...p} maxLength={60} autoComplete="off" value={values.name} onChange={set('name')} placeholder="e.g. Ramesh Patil" />}
        </Field>
        <Field id="tech-area" label="Area covered (optional)" error={errors.area} hint="For example Bandra / Khar, or Zone 3">
          {(p) => <input {...p} maxLength={60} autoComplete="off" value={values.area} onChange={set('area')} />}
        </Field>
        <Field id="tech-phone" label="Phone (optional)" error={errors.phone} hint="10 digits, no spaces or country code">
          {(p) => <input {...p} type="tel" inputMode="numeric" maxLength={10} autoComplete="off" value={values.phone} onChange={set('phone')} />}
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : editing ? 'Save changes' : 'Add technician'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminTechnicians() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | technician
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    setError('');
    api.get('/admin/technicians').then((r) => setList(r.data.data.technicians)).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  async function toggle(t) {
    setBusyId(t.id);
    try {
      const r = await api.patch(`/admin/technicians/${t.id}`, { active: !t.active });
      setList((l) => l.map((x) => (x.id === t.id ? r.data.data.technician : x)));
      toast.success(t.active ? `${t.name} is now inactive and cannot be assigned new jobs` : `${t.name} is active again`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId('');
    }
  }

  // After an add or edit, reload so the open-job counts and ordering stay accurate.
  const saved = () => load();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Technicians</h1>
          <p className="muted text-sm">The people and crews you can assign complaints to. <Link to="/admin" className="font-bold underline">Back to complaints</Link></p>
        </div>
        <button type="button" onClick={() => setEditing('new')} className="btn-primary">＋ Add technician</button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !list ? (
        <Spinner label="Loading technicians" />
      ) : list.length === 0 ? (
        <EmptyState title="No technicians yet" action={<button type="button" onClick={() => setEditing('new')} className="btn-primary mt-2">Add your first technician</button>}>
          Add the people who repair streetlights, then assign complaints to them from the dashboard.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[640px]">
            <caption className="sr-only">Technicians</caption>
            <thead className="border-b border-night-900/10 dark:border-white/10">
              <tr>
                <th scope="col" className="th">Name</th>
                <th scope="col" className="th">Area</th>
                <th scope="col" className="th">Phone</th>
                <th scope="col" className="th">Open jobs</th>
                <th scope="col" className="th">Status</th>
                <th scope="col" className="th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-night-900/10 dark:divide-white/10">
              {list.map((t) => (
                <tr key={t.id} className={t.active ? '' : 'opacity-60'}>
                  <td className="td font-bold">{t.name}</td>
                  <td className="td">{t.area || '—'}</td>
                  <td className="td">{t.phone || '—'}</td>
                  <td className="td">{t.openJobs}</td>
                  <td className="td">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${t.active ? 'bg-green-100 text-green-900 dark:bg-green-400/15 dark:text-green-300' : 'bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-slate-300'}`}>
                      {t.active ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td className="td">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditing(t)} className="btn-secondary !py-1.5">Edit</button>
                      <button type="button" onClick={() => toggle(t)} disabled={busyId === t.id} className="btn-secondary !py-1.5">
                        {t.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted text-xs">Deactivating a technician only stops new assignments. Jobs they already have stay with them until you reassign or resolve them.</p>

      {editing && <TechnicianModal technician={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={saved} />}
    </div>
  );
}
