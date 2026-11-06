import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api';
import { STATUSES } from '../lib/constants';
import { formatDate } from '../lib/format';
import { EmptyState, ErrorState, Modal, Spinner, StatusBadge } from '../components/ui';
import { Timeline } from '../components/Lamps';

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function StatCards({ stats }) {
  const cards = [
    ['Total', stats?.total, ''],
    ['Pending', stats?.pending, 'text-red-700 dark:text-red-400'],
    ['In progress', stats?.inProgress, 'text-amber-700 dark:text-amber-400'],
    ['Resolved', stats?.resolved, 'text-green-700 dark:text-green-400'],
    ['Unsafe spots open', stats?.unsafeOpen, 'text-red-700 dark:text-red-400'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map(([label, value, tone]) => (
        <div key={label} className="card !p-4">
          <p className={`font-display text-3xl font-bold ${tone}`}>{value ?? '–'}</p>
          <p className="muted text-sm">{label}</p>
        </div>
      ))}
    </div>
  );
}

function NoteModal({ complaint, onClose, onSaved }) {
  const [note, setNote] = useState(complaint.adminNote || '');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.patch(`/admin/complaints/${complaint.complaintId}/note`, { note });
      toast.success('Note saved');
      onSaved(r.data.data.complaint);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`${complaint.complaintId} details`} onClose={onClose}>
      <p className="mb-1 text-sm"><b>{complaint.location}</b>{complaint.pole ? ` · Pole ${complaint.pole}` : ''}</p>
      <p className="muted mb-1 text-sm">{complaint.type}{complaint.unsafe ? ' · ⚠ Unsafe spot' : ''}</p>
      <p className="mb-4 text-sm">{complaint.description}</p>
      <form onSubmit={save} className="mb-5">
        <label htmlFor="admin-note" className="label">Admin note (internal, max 500)</label>
        <textarea id="admin-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="input" />
        <button type="submit" disabled={busy} className="btn-primary mt-2">{busy ? 'Saving…' : 'Save note'}</button>
      </form>
      <h3 className="mb-2 font-bold">Status history</h3>
      <Timeline history={complaint.history} />
    </Modal>
  );
}

function ConfirmDelete({ complaint, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    try {
      await api.delete(`/admin/complaints/${complaint.complaintId}`);
      toast.success(`${complaint.complaintId} deleted`);
      onDeleted();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Modal title="Delete complaint?" onClose={onClose}>
      <p className="mb-5 text-sm">
        This permanently deletes <b>{complaint.complaintId}</b> ({complaint.location}) and its history. This cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="button" onClick={del} disabled={busy} className="btn-danger">{busy ? 'Deleting…' : 'Delete permanently'}</button>
      </div>
    </Modal>
  );
}

const COLUMNS = [
  ['complaintId', 'ID', false],
  ['location', 'Location', true],
  ['type', 'Problem', false],
  ['reporter', 'Reporter', false],
  ['createdAt', 'Reported', true],
  ['status', 'Status', true],
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [hotspots, setHotspots] = useState(null);
  const [hotError, setHotError] = useState('');
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [noteFor, setNoteFor] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null);
  const [busyId, setBusyId] = useState('');
  const debounced = useDebounced(search);

  const loadSide = useCallback(() => {
    api.get('/complaints/stats').then((r) => setStats(r.data.data)).catch(() => {});
    api.get('/admin/hotspots').then((r) => setHotspots(r.data.data.hotspots)).catch((e) => { setHotspots([]); setHotError(errorMessage(e)); });
  }, []);

  const params = { search: debounced || undefined, status: status || undefined };
  const loadRows = useCallback(() => {
    setError('');
    api
      .get('/admin/complaints', { params: { ...params, sort, order, page, limit: 10 } })
      .then((r) => { setRows(r.data.data.complaints); setMeta(r.data.meta); })
      .catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, status, sort, order, page]);

  useEffect(loadSide, [loadSide]);
  useEffect(loadRows, [loadRows]);
  useEffect(() => setPage(1), [debounced, status]);

  function toggleSort(col) {
    if (sort === col) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(col); setOrder('asc'); }
  }

  async function changeStatus(c, next) {
    setBusyId(c.complaintId);
    try {
      const r = await api.patch(`/admin/complaints/${c.complaintId}/status`, { status: next });
      setRows((rs) => rs.map((x) => (x.complaintId === c.complaintId ? r.data.data.complaint : x)));
      toast.success(`${c.complaintId} is now ${next}`);
      loadSide();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId('');
    }
  }

  async function exportCsv() {
    try {
      const r = await api.get('/admin/complaints/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = Object.assign(document.createElement('a'), { href: url, download: `brighttrack-complaints-${new Date().toISOString().slice(0, 10)}.csv` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Admin dashboard</h1>
      <StatCards stats={stats} />

      <section aria-labelledby="complaints-h" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="complaints-h" className="text-xl font-bold">Complaints</h2>
          <button type="button" onClick={exportCsv} className="btn-secondary">Export CSV</button>
        </div>
        <div className="card flex flex-col gap-3 !p-4 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="search" className="sr-only">Search complaints</label>
            <input id="search" type="search" placeholder="Search ID, location, pole or description" value={search} onChange={(e) => setSearch(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="status-filter" className="sr-only">Filter by status</label>
            <select id="status-filter" value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={loadRows} />
        ) : !rows ? (
          <Spinner label="Loading complaints" />
        ) : rows.length === 0 ? (
          <EmptyState title="No complaints match">Try a different search or clear the status filter.</EmptyState>
        ) : (
          <div className="card overflow-x-auto !p-0">
            <table className="w-full min-w-[820px]">
              <caption className="sr-only">Complaints, {meta.total} in total</caption>
              <thead className="border-b border-night-900/10 dark:border-white/10">
                <tr>
                  {COLUMNS.map(([key, label, sortable]) => (
                    <th key={key} scope="col" className="th" aria-sort={sort === key ? (order === 'asc' ? 'ascending' : 'descending') : undefined}>
                      {sortable ? (
                        <button type="button" onClick={() => toggleSort(key)} className="font-bold uppercase">
                          {label} {sort === key ? (order === 'asc' ? '▲' : '▼') : ''}
                        </button>
                      ) : label}
                    </th>
                  ))}
                  <th scope="col" className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-900/10 dark:divide-white/10">
                {rows.map((c) => (
                  <tr key={c.complaintId}>
                    <td className="td font-bold">{c.complaintId}</td>
                    <td className="td">
                      {c.location}
                      {c.pole && <span className="muted block text-xs">Pole {c.pole}</span>}
                      {c.unsafe && c.status !== 'Resolved' && <span className="block text-xs font-bold text-red-700 dark:text-red-300">⚠ Unsafe spot</span>}
                    </td>
                    <td className="td">{c.type}</td>
                    <td className="td">{c.user?.name || '—'}<span className="muted block text-xs">{c.user?.email}</span></td>
                    <td className="td whitespace-nowrap">{formatDate(c.createdAt)}</td>
                    <td className="td">
                      <StatusBadge status={c.status} />
                      <label htmlFor={`st-${c.complaintId}`} className="sr-only">Change status of {c.complaintId}</label>
                      <select
                        id={`st-${c.complaintId}`} value={c.status} disabled={busyId === c.complaintId}
                        onChange={(e) => changeStatus(c, e.target.value)} className="input mt-2 !py-1.5"
                      >
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="td">
                      <div className="flex flex-col gap-1.5">
                        <button type="button" onClick={() => setNoteFor(c)} className="btn-secondary !py-1.5">
                          {c.adminNote ? 'Note & history ●' : 'Note & history'}
                        </button>
                        <button type="button" onClick={() => setDeleteFor(c)} className="btn-secondary !py-1.5 !text-red-700 dark:!text-red-300">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows && rows.length > 0 && (
          <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
            <p className="muted">Page {meta.page} of {meta.pages} · {meta.total} complaints</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className="btn-secondary" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </nav>
        )}
      </section>

      <section aria-labelledby="hot-h">
        <h2 id="hot-h" className="mb-3 text-xl font-bold">Repeat problem areas</h2>
        {hotError ? (
          <ErrorState message={`Could not load hotspots: ${hotError}`} onRetry={() => { setHotError(''); loadSide(); }} />
        ) : !hotspots ? (
          <Spinner label="Loading hotspots" />
        ) : hotspots.length === 0 ? (
          <EmptyState title="No repeat locations">Locations reported more than once will be listed here.</EmptyState>
        ) : (
          <ul className="card divide-y divide-night-900/10 !p-0 dark:divide-white/10">
            {hotspots.map((h) => (
              <li key={h.location} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <p className="font-bold">{h.location}</p>
                  <p className="muted text-xs">Last reported {formatDate(h.lastReportedAt)}</p>
                </div>
                <p className="text-sm"><b>{h.count}</b> reports · <b className={h.open ? 'text-red-700 dark:text-red-300' : ''}>{h.open}</b> still open</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {noteFor && (
        <NoteModal
          complaint={noteFor} onClose={() => setNoteFor(null)}
          onSaved={(c) => setRows((rs) => rs.map((x) => (x.complaintId === c.complaintId ? c : x)))}
        />
      )}
      {deleteFor && <ConfirmDelete complaint={deleteFor} onClose={() => setDeleteFor(null)} onDeleted={() => { loadRows(); loadSide(); }} />}
    </div>
  );
}
