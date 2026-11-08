import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { COMPLAINT_TYPES } from '../lib/constants';
import { complaintSchema, parse } from '../lib/schemas';
import { uploadImages } from '../lib/upload';
import { CopyButton, Field } from '../components/ui';
import LocationPicker from '../components/LocationPicker';
import { PhotoPicker, releasePhotos } from '../components/PhotoPicker';

const EMPTY = { pole: '', type: '', description: '', unsafe: false };

export default function Report() {
  const [values, setValues] = useState(EMPTY);
  const [place, setPlace] = useState(null); // verified place from the address search / GPS
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState(''); // '' | 'submitting' | 'uploading'
  const [created, setCreated] = useState(null); // { complaint, upload }
  const busy = phase !== '';

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    const r = parse(complaintSchema, { ...values, locationToken: place?.token, pole: values.pole || undefined });
    if (r.errors) {
      setErrors(r.errors);
      toast.error(r.errors.locationToken ? 'Choose the location first' : 'Please fix the highlighted fields');
      return;
    }
    setErrors({});
    setPhase('submitting');
    try {
      const res = await api.post('/complaints', r.data);
      const complaint = res.data.data.complaint;
      // The report exists now. Photos are optional extras: a failed photo never loses the report.
      let upload = null;
      if (photos.length > 0) {
        setPhase('uploading');
        upload = await uploadImages(complaint.complaintId, photos.map((p) => p.blob));
      }
      releasePhotos(photos);
      setPhotos([]);
      setPlace(null);
      setValues(EMPTY);
      setCreated({ complaint, upload });
      toast.success('Complaint submitted');
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (fe.locationToken) setPlace(null); // expired or invalid: the user must pick the place again
      toast.error(errorMessage(err));
    } finally {
      setPhase('');
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <div className="card space-y-4" role="status">
          <p className="text-4xl" aria-hidden="true">💡</p>
          <h1 className="text-2xl font-bold">Report received</h1>
          <p className="text-sm font-bold">📍 {created.complaint.location}</p>
          <p className="muted text-sm">Save this ID. Anyone can use it on the Track page to see progress.</p>
          <p className="rounded-xl bg-night-900 py-4 font-display text-4xl font-bold tracking-widest text-sodium-400" aria-label={`Complaint ID ${created.complaint.complaintId.split('').join(' ')}`}>
            {created.complaint.complaintId}
          </p>
          {created.upload && created.upload.uploaded > 0 && (
            <p className="text-sm text-green-800 dark:text-green-300">📷 {created.upload.uploaded} {created.upload.uploaded === 1 ? 'photo' : 'photos'} attached.</p>
          )}
          {created.upload && created.upload.failed.length > 0 && (
            <p role="alert" className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-400/15 dark:text-amber-200">
              {created.upload.failed.length} {created.upload.failed.length === 1 ? 'photo' : 'photos'} could not be uploaded ({created.upload.failed[0].message}). Your report is saved. You can add photos from My complaints.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <CopyButton text={created.complaint.complaintId} label="Copy ID" />
            <Link to={`/track/${created.complaint.complaintId}`} className="btn-secondary">Track it</Link>
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
      <p className="muted mb-6 text-sm">Pick the exact place and add photos if you can: it helps the crew find the light faster.</p>
      <form onSubmit={onSubmit} noValidate className="card space-y-4">
        <LocationPicker value={place} onChange={setPlace} error={errors.locationToken} />
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
        <div>
          <p className="label">Photos (optional)</p>
          <PhotoPicker value={photos} onChange={setPhotos} disabled={busy} />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-night-900/15 p-3 dark:border-white/15">
          <input type="checkbox" checked={values.unsafe} onChange={set('unsafe')} className="mt-1 h-5 w-5 accent-sodium-600" />
          <span>
            <span className="block text-sm font-bold">This is an unsafe spot</span>
            <span className="muted block text-xs">Tick if darkness here puts people at risk (crossings, parks, exposed wires). It is highlighted for the repair crew.</span>
          </span>
        </label>
        <button type="submit" disabled={busy} className="btn-primary w-full">{phase === 'uploading' ? 'Uploading photos…' : phase === 'submitting' ? 'Submitting…' : 'Submit report'}</button>
      </form>
    </div>
  );
}
