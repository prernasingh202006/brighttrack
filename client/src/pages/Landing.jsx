import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { timeAgo } from '../lib/format';
import { complaintIdSchema, parse } from '../lib/schemas';
import { LampRow } from '../components/Lamps';
import { EmptyState, ErrorState, Spinner, StatusBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const STEPS = [
  ['1', 'Report the fault', 'Tell us where the light is and what is wrong. It takes under a minute.'],
  ['2', 'Get a complaint ID', 'You get an ID like BT-AB12C to follow your report, no matter who you are.'],
  ['3', 'Watch it get fixed', 'Pending, In Progress, Resolved. Every change is logged with a timestamp.'],
];

function Stat({ label, value, tone }) {
  return (
    <div className="card !p-4">
      <p className={`font-display text-3xl font-bold ${tone || ''}`}>{value}</p>
      <p className="muted text-sm">{label}</p>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState('');
  const [id, setId] = useState('');
  const [idError, setIdError] = useState('');

  const load = useCallback(() => {
    setError('');
    Promise.all([api.get('/complaints/stats'), api.get('/complaints/recent')])
      .then(([s, r]) => {
        setStats(s.data.data);
        setRecent(r.data.data.complaints);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  function onTrack(e) {
    e.preventDefault();
    const r = parse(complaintIdSchema, id);
    if (r.errors) return setIdError(r.errors._);
    return navigate(`/track/${id.trim().toUpperCase()}`);
  }

  return (
    <div className="space-y-14">
      <section className="hero-glow relative overflow-hidden rounded-3xl bg-night-900 px-6 py-12 text-white sm:px-12 sm:py-16">
        <p className="mb-3 text-sm font-bold uppercase tracking-widest text-sodium-400">Streetlight complaints, tracked to repair</p>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
          A dark street is a <span className="text-sodium-400 animate-flicker">safety problem.</span> Report it. Track it. See it fixed.
        </h1>
        <p className="mt-4 max-w-xl text-slate-300">
          BrightTrack gives residents one place to report broken streetlights and follow each repair until the lamp is back on.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to={user ? '/report' : '/register'} className="btn-primary !px-6 !py-3 text-base">
            {user ? 'Report a fault' : 'Report a fault (free sign-up)'}
          </Link>
          <Link to="/track" className="btn border border-white/30 !px-6 !py-3 text-base text-white hover:bg-white/10">
            Track a complaint
          </Link>
        </div>
        <form onSubmit={onTrack} className="mt-8 max-w-md" noValidate>
          <label htmlFor="quick-id" className="mb-1.5 block text-sm font-bold text-slate-200">Have a complaint ID?</label>
          <div className="flex gap-2">
            <input
              id="quick-id" value={id} onChange={(e) => { setId(e.target.value); setIdError(''); }}
              placeholder="BT-AB12C" autoComplete="off" aria-invalid={idError ? true : undefined} aria-describedby={idError ? 'quick-id-err' : undefined}
              className="input !border-white/20 !bg-night-950 uppercase !text-white"
            />
            <button type="submit" className="btn-secondary whitespace-nowrap !border-white/30 !text-white hover:!bg-white/10">Look up</button>
          </div>
          {idError && <p id="quick-id-err" role="alert" className="mt-1 text-xs font-bold text-red-300">{idError}</p>}
        </form>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="mb-5 text-2xl font-bold">How it works</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(([n, t, d]) => (
            <li key={n} className="card flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sodium-500 font-display text-lg font-bold text-night-950" aria-hidden="true">{n}</span>
              <div>
                <h3 className="font-bold">{t}</h3>
                <p className="muted mt-1 text-sm">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="live">
        <h2 id="live" className="mb-5 text-2xl font-bold">Live city snapshot</h2>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !stats ? (
          <Spinner label="Loading live counts" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="Total reports" value={stats.total} />
              <Stat label="Pending" value={stats.pending} tone="text-red-700 dark:text-red-400" />
              <Stat label="In progress" value={stats.inProgress} tone="text-amber-700 dark:text-amber-400" />
              <Stat label="Resolved" value={stats.resolved} tone="text-green-700 dark:text-green-400" />
              <Stat label="Unsafe spots open" value={stats.unsafeOpen} />
            </div>
            <div className="card">
              <LampRow resolved={stats.resolved} total={stats.total} />
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="recent">
        <h2 id="recent" className="mb-5 text-2xl font-bold">Recent reports</h2>
        {error ? null : !recent ? (
          <Spinner label="Loading recent reports" />
        ) : recent.length === 0 ? (
          <EmptyState title="No reports yet" action={<Link to="/register" className="btn-primary mt-2">Be the first to report</Link>}>
            When residents report faults, the latest ones show up here.
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-night-900/10 !p-0 dark:divide-white/10">
            {recent.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <p className="font-bold">{r.location}</p>
                  <p className="muted text-sm">{r.type} · {timeAgo(r.createdAt)}</p>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
