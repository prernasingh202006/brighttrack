import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { formatDate } from '../lib/format';
import { CopyButton, EmptyState, ErrorState, Spinner, StatusBadge } from '../components/ui';
import { Timeline } from '../components/Lamps';

export default function MyComplaints() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    setItems(null);
    api.get('/complaints/mine').then((r) => setItems(r.data.data.complaints)).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

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
                <p className="muted text-sm">{c.type}{c.unsafe ? ' · ⚠ Unsafe spot' : ''}</p>
                <p className="mt-1 text-sm">{c.description}</p>
              </div>
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
