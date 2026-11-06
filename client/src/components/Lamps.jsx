import { formatDateTime } from '../lib/format';
import { STATUSES } from '../lib/constants';

/** Streetlight icon. `lit` lamps glow sodium-amber. */
function Lamp({ lit }) {
  return (
    <svg viewBox="0 0 40 64" className={`h-14 w-9 sm:h-16 sm:w-10 ${lit ? 'lamp-on' : ''}`} aria-hidden="true">
      <path d="M12 62V16c0-5 4-9 9-9h9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-slate-500 dark:text-slate-400" />
      <path d="M26 9h12l-3 8H29z" className={lit ? 'fill-sodium-400' : 'fill-slate-400 dark:fill-night-500'} />
      {lit && <path d="M27 18l-5 26h22l-5-26z" className="fill-sodium-400/20" />}
      <rect x="8" y="58" width="10" height="4" rx="1" className="fill-slate-500 dark:fill-slate-400" />
    </svg>
  );
}

/** Row of lamps that light up in proportion to the share of resolved complaints. */
export function LampRow({ resolved = 0, total = 0, count = 8 }) {
  const lit = total ? Math.round((resolved / total) * count) : 0;
  const pct = total ? Math.round((resolved / total) * 100) : 0;
  return (
    <figure className="m-0">
      <div role="img" aria-label={`${lit} of ${count} lamps lit: ${pct}% of reports resolved`} className="flex items-end justify-between gap-1">
        {Array.from({ length: count }, (_, i) => (
          <Lamp key={i} lit={i < lit} />
        ))}
      </div>
      <figcaption className="muted mt-2 text-xs">
        {total ? `${pct}% of all reports resolved. Each lamp = ${Math.round(100 / count)}% fixed.` : 'No reports yet. Lamps light up as faults get fixed.'}
      </figcaption>
    </figure>
  );
}

const STEP_STYLE = ['bg-red-500', 'bg-amber-500', 'bg-green-500'];

/** Pending -> In Progress -> Resolved progress bar. */
export function ProgressTracker({ status }) {
  const idx = Math.max(0, STATUSES.indexOf(status));
  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={idx + 1}
        aria-valuetext={`Step ${idx + 1} of 3: ${status}`}
        className="flex gap-1.5"
      >
        {STATUSES.map((s, i) => (
          <div key={s} className={`h-2.5 flex-1 rounded-full ${i <= idx ? STEP_STYLE[idx] : 'bg-slate-300 dark:bg-night-600'}`} />
        ))}
      </div>
      <ol className="mt-2 grid grid-cols-3 text-xs font-bold">
        {STATUSES.map((s, i) => (
          <li key={s} aria-current={i === idx ? 'step' : undefined} className={`${i === 0 ? 'text-left' : i === 2 ? 'text-right' : 'text-center'} ${i <= idx ? '' : 'muted font-normal'}`}>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Vertical status history. Admin view passes entries with changedBy.name. */
export function Timeline({ history = [] }) {
  const items = [...history].reverse();
  return (
    <ol className="relative ml-2 border-l-2 border-slate-300 dark:border-night-600">
      {items.map((h, i) => (
        <li key={`${h.status}-${h.at}-${i}`} className="mb-3 ml-5 last:mb-0">
          <span className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full ring-4 ring-white dark:ring-night-800 ${i === 0 ? 'bg-sodium-500' : 'bg-slate-400 dark:bg-night-500'}`} aria-hidden="true" />
          <p className="text-sm font-bold">{h.status}</p>
          <p className="muted text-xs">
            {formatDateTime(h.at)}
            {h.changedBy?.name ? ` · ${h.changedBy.name}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
