import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api';
import { complaintIdSchema, parse } from '../lib/schemas';
import { formatDate } from '../lib/format';
import { Field, Spinner, StatusBadge } from '../components/ui';
import { ProgressTracker, Timeline } from '../components/Lamps';

export default function Track() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(id || '');
  const [inputError, setInputError] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  useEffect(() => {
    if (!id) return setState({ status: 'idle' });
    const parsed = parse(complaintIdSchema, id);
    if (parsed.errors) return setState({ status: 'error', message: parsed.errors._ });
    let cancelled = false;
    setState({ status: 'loading' });
    api
      .get(`/complaints/track/${parsed.data}`)
      .then((r) => !cancelled && setState({ status: 'ok', complaint: r.data.data.complaint }))
      .catch((e) => {
        if (cancelled) return;
        setState({ status: 'error', message: errorMessage(e) });
        toast.error(errorMessage(e));
      });
    return () => { cancelled = true; };
  }, [id]);

  function onSubmit(e) {
    e.preventDefault();
    const r = parse(complaintIdSchema, input);
    if (r.errors) return setInputError(r.errors._);
    setInputError('');
    return navigate(`/track/${r.data}`);
  }

  const c = state.complaint;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-3xl font-bold">Track a complaint</h1>
      <form onSubmit={onSubmit} noValidate className="card mb-6 flex items-end gap-2">
        <div className="flex-1">
          <Field id="track-id" label="Complaint ID" error={inputError}>
            {(p) => <input {...p} value={input} onChange={(e) => setInput(e.target.value)} placeholder="BT-AB12C" autoComplete="off" className={`${p.className} uppercase`} />}
          </Field>
        </div>
        <button type="submit" className="btn-primary">Track</button>
      </form>

      {state.status === 'loading' && <Spinner label="Looking up your complaint" />}
      {state.status === 'error' && (
        <p role="alert" className="card border-red-600/40 text-center font-bold text-red-700 dark:text-red-300">{state.message}</p>
      )}
      {state.status === 'ok' && (
        <div className="card space-y-6" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-display text-2xl font-bold tracking-wide">{c.complaintId}</p>
              <p className="muted text-sm">{c.type} · {c.location}</p>
              <p className="muted text-xs">Reported {formatDate(c.createdAt)}</p>
            </div>
            <StatusBadge status={c.status} />
          </div>
          <ProgressTracker status={c.status} />
          <div>
            <h2 className="mb-3 text-lg font-bold">History</h2>
            <Timeline history={c.history} />
          </div>
        </div>
      )}
    </div>
  );
}
