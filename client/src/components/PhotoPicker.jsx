import { useEffect, useRef, useState } from 'react';
import { MAX_IMAGES } from '../lib/constants';
import { prepareImage } from '../lib/image';
import { imageUrl } from '../lib/api';

/** Free the preview URLs held by a picker's list (call after a successful upload or when discarding). */
export function releasePhotos(list) {
  list.forEach((p) => URL.revokeObjectURL(p.url));
}

let counter = 0;

/**
 * Choose up to `max` photos. Each is shrunk in the browser right away (see lib/image.js).
 * value: [{ key, blob, url, name }]  (controlled by the parent)
 */
export function PhotoPicker({ value, onChange, max = MAX_IMAGES, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => () => releasePhotos(latest.current), []); // free previews if the page is left

  const room = max - value.length;

  async function onFiles(e) {
    const files = [...e.target.files];
    e.target.value = ''; // lets the same file be chosen again
    if (files.length === 0) return;
    const take = files.slice(0, Math.max(0, room));
    const notes = [];
    if (files.length > take.length) notes.push(`You can add up to ${max} photos, so ${files.length - take.length} ${files.length - take.length === 1 ? 'was' : 'were'} skipped.`);
    setBusy(true);
    const added = [];
    for (const file of take) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const blob = await prepareImage(file);
        counter += 1;
        added.push({ key: `p${counter}`, blob, url: URL.createObjectURL(blob), name: file.name });
      } catch (err) {
        notes.push(err.message);
      }
    }
    setBusy(false);
    setProblems(notes);
    if (added.length) onChange([...latest.current, ...added]);
  }

  function remove(key) {
    const item = value.find((p) => p.key === key);
    if (item) URL.revokeObjectURL(item.url);
    onChange(value.filter((p) => p.key !== key));
  }

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {value.map((p, i) => (
            <li key={p.key} className="relative">
              <img src={p.url} alt={`Selected photo ${i + 1}`} className="h-24 w-24 rounded-xl border border-night-900/15 object-cover dark:border-white/15" />
              <button
                type="button"
                onClick={() => remove(p.key)}
                disabled={disabled}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-night-900 text-sm font-bold text-white shadow dark:bg-slate-100 dark:text-night-900"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {room > 0 && (
        <label className={`btn-secondary cursor-pointer focus-within:ring-2 focus-within:ring-sodium-500 ${disabled || busy ? 'pointer-events-none opacity-60' : ''}`}>
          <input type="file" accept="image/*" multiple={room > 1} className="sr-only" onChange={onFiles} disabled={disabled || busy} />
          {busy ? 'Preparing photo…' : value.length ? '＋ Add another photo' : '📷 Add photos'}
        </label>
      )}
      <p className="muted text-xs">
        Up to {max} photos of the light and what is around it (the pole, the street, a nearby shop or sign). Photos are resized automatically and their hidden location data is removed.
      </p>
      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 text-xs font-bold text-red-700 dark:text-red-300">
          {problems.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * Photos already stored on a complaint (shown to the owner and to admins).
 * images: [{ id }]   onRemove(id) is optional: pass it to show remove buttons.
 */
export function PhotoGallery({ images = [], onRemove, removingId = '' }) {
  const [broken, setBroken] = useState({});
  if (images.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {images.map((img, i) => (
        <li key={img.id} className="relative">
          {broken[img.id] ? (
            <span className="muted flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-night-900/30 p-1 text-center text-xs dark:border-white/30">Photo unavailable</span>
          ) : (
            <a href={imageUrl(img.id)} target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${i + 1} full size`}>
              <img
                src={imageUrl(img.id)}
                alt={`Photo ${i + 1} of the streetlight and its surroundings`}
                loading="lazy"
                onError={() => setBroken((b) => ({ ...b, [img.id]: true }))}
                className="h-20 w-20 rounded-lg border border-night-900/15 object-cover dark:border-white/15"
              />
            </a>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(img.id)}
              disabled={removingId === img.id}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-night-900 text-xs font-bold text-white shadow dark:bg-slate-100 dark:text-night-900"
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
