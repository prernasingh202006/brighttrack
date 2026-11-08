import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api';
import { MAX_IMAGES } from '../lib/constants';
import { formatDate } from '../lib/format';
import { osmLink } from '../lib/geo';
import { uploadImages } from '../lib/upload';
import { CopyButton, EmptyState, ErrorState, ResolutionBox, Spinner, StatusBadge } from '../components/ui';
import { Timeline } from '../components/Lamps';
import { PhotoGallery, PhotoPicker, releasePhotos } from '../components/PhotoPicker';

export function PhotoManager({ complaint, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState('');
  const images = complaint.images || [];
  const open = complaint.status !== 'Resolved'; // photos are locked once the complaint is resolved
  const room = MAX_IMAGES - images.length;

  async function remove(imageId) {
    setRemovingId(imageId);
    try {
      const r = await api.delete(`/complaints/${complaint.complaintId}/images/${imageId}`);
      onUpdate({ ...complaint, images: r.data.data.images });
      toast.success('Photo removed');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemovingId('');
    }
  }

  async function upload() {
    setBusy(true);
    const result = await uploadImages(complaint.complaintId, picked.map((p) => p.blob));
    releasePhotos(picked);
    setPicked([]);
    setBusy(false);
    if (result.images) onUpdate({ ...complaint, images: result.images });
    if (result.failed.length === 0) {
      toast.success(result.uploaded === 1 ? 'Photo added' : `${result.uploaded} photos added`);
      setAdding(false);
    } else {
      toast.error(`${result.failed.length} could not be uploaded: ${result.failed[0].message}`);
    }
  }

  function cancel() {
    releasePhotos(picked);
    setPicked([]);
    setAdding(false);
  }

  if (images.length === 0 && !open) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">Photos ({images.length}/{MAX_IMAGES})</p>
      <PhotoGallery images={images} onRemove={open ? remove : undefined} removingId={removingId} />
      {open && room > 0 && !adding && (
        <button type="button" onClick={() => setAdding(true)} className="btn-secondary !py-1.5">📷 {images.length ? 'Add more photos' : 'Add photos'}</button>
      )}
      {open && adding && (
        <div className="space-y-3 rounded-xl border border-night-900/15 p-3 dark:border-white/15">
          <PhotoPicker value={picked} onChange={setPicked} max={room} disabled={busy} />
          <div className="flex gap-2">
            <button type="button" onClick={upload} disabled={busy || picked.length === 0} className="btn-primary !py-1.5">{busy ? 'Uploading…' : `Upload ${picked.length || ''}`.trim()}</button>
            <button type="button" onClick={cancel} disabled={busy} className="btn-secondary !py-1.5">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyComplaints() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    setItems(null);
    api.get('/complaints/mine').then((r) => setItems(r.data.data.complaints)).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);
  const update = (updated) => setItems((list) => list.map((x) => (x.complaintId === updated.complaintId ? updated : x)));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">My complaints</h1>
        <Link to="/report" className="btn-primary">Report a fault</Link>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !items ? (
        <Spinner label="Loading your complaints" />
      ) : items.length === 0 ? (
        <EmptyState title="You have not reported anything yet" action={<Link to="/report" className="btn-primary mt-2">Report your first fault</Link>}>
          Reported faults and their repair status will appear here.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((c) => (
            <li key={c.complaintId} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xl font-bold tracking-wide">{c.complaintId}</p>
                  <p className="muted text-xs">Reported {formatDate(c.createdAt)}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div>
                <p className="font-bold">{c.location}{c.pole ? ` · Pole ${c.pole}` : ''}</p>
                {c.coords && (
                  <p className="text-xs">
                    <a href={osmLink(c.coords.lat, c.coords.lng)} target="_blank" rel="noopener noreferrer" className="font-bold underline">📍 View on map</a>
                  </p>
                )}
                <p className="muted text-sm">{c.type}{c.unsafe ? ' · ⚠ Unsafe spot' : ''}</p>
                <p className="mt-1 text-sm">{c.description}</p>
              </div>
              <PhotoManager complaint={c} onUpdate={update} />
              {c.assignedTo && c.status !== 'Resolved' && <p className="text-sm"><b>Assigned to:</b> {c.assignedTo}</p>}
              {c.status === 'Resolved' && <ResolutionBox note={c.resolutionNote} at={c.resolvedAt} />}
              <details className="rounded-lg bg-night-900/5 p-3 dark:bg-white/5">
                <summary className="cursor-pointer text-sm font-bold">Status history ({c.history.length})</summary>
                <div className="mt-3"><Timeline history={c.history} /></div>
              </details>
              <div className="flex gap-2">
                <CopyButton text={c.complaintId} label="Copy ID" />
                <Link to={`/track/${c.complaintId}`} className="btn-secondary">Track</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
