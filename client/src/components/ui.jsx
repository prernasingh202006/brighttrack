// Small shared UI pieces: Spinner, EmptyState, Field, StatusBadge, CopyButton, Modal.
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { formatDate } from '../lib/format';

export function Spinner({ label = 'Loading' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-12 muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-sodium-500 border-t-transparent" aria-hidden="true" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-12 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sodium-600 dark:text-sodium-400" aria-hidden="true">
        <path d="M8 21h8M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1v1h6v-1c0-.4.1-.8.5-1.1A6 6 0 0 0 12 3Z" />
      </svg>
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <p className="muted max-w-sm text-sm">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="card border-red-600/40 text-center">
      <p className="font-bold text-red-700 dark:text-red-300">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-3">
          Try again
        </button>
      )}
    </div>
  );
}

/** Label + control + error wiring (aria-invalid / aria-describedby) in one place. */
export function Field({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
        className: `input ${error ? 'input-error' : ''}`,
      })}
      {hint && !error && (
        <p id={`${id}-hint`} className="muted mt-1 text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs font-bold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

// Status is never conveyed by colour alone: each badge also has a symbol and text.
// Pending = red, In Progress = amber, Resolved = green.
const SPEC = {
  Pending: { cls: 'bg-red-100 text-red-900 dark:bg-red-400/15 dark:text-red-300', icon: '○' },
  'In Progress': { cls: 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300', icon: '◐' },
  Resolved: { cls: 'bg-green-100 text-green-900 dark:bg-green-400/15 dark:text-green-300', icon: '●' },
};

export function StatusBadge({ status }) {
  const s = SPEC[status] || SPEC.Pending;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {status}
    </span>
  );
}

/** Shown to residents (and on the public tracking page) when a complaint is Resolved: proof of what was done. */
export function ResolutionBox({ note, at }) {
  if (!note) return null;
  return (
    <div className="rounded-lg bg-green-100 p-4 text-sm dark:bg-green-400/15">
      <h3 className="mb-1 font-bold text-green-900 dark:text-green-300">✓ What was done</h3>
      <p className="text-green-950 dark:text-green-100">{note}</p>
      {at && <p className="mt-1 text-xs text-green-900/80 dark:text-green-300/80">Fixed on {formatDate(at)}</p>}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.');
    }
  }
  return (
    <button type="button" onClick={copy} className="btn-secondary" aria-label={`${label} ${text}`}>
      {copied ? 'Copied ✓' : label}
    </button>
  );
}

/** Accessible modal: role=dialog, Escape closes, focus moves in and returns on close, Tab is trapped. */
export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    const focusables = () => el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (focusables()[0] || el).focus();
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const f = [...focusables()];
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/70 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="btn-secondary !px-2.5 !py-1" aria-label="Close dialog">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
