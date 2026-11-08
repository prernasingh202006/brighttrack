import { useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { formatCoords, geolocationMessage, osmEmbedUrl, osmLink } from '../lib/geo';

/**
 * Real-place chooser. The complaint's location can only be (a) a result of the address search or
 * (b) the user's GPS position turned into an address. Free text cannot be submitted.
 *
 * value: null | { label, lat, lng, token }   (token is signed by the server and sent with the complaint)
 */
export default function LocationPicker({ value, onChange, error }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null = nothing searched yet
  const [busy, setBusy] = useState('');          // '' | 'searching' | 'locating'
  const [message, setMessage] = useState('');
  const latest = useRef(0); // ignore answers that arrive after a newer request

  async function search() {
    const q = query.trim();
    if (q.length < 3) {
      setResults(null);
      setMessage('Type at least 3 characters (a street, area or landmark), then press Search.');
      return;
    }
    latest.current += 1;
    const mine = latest.current;
    setBusy('searching');
    setMessage('');
    try {
      const r = await api.get('/geo/search', { params: { q } });
      if (mine !== latest.current) return;
      setResults(r.data.data.results);
      if (r.data.data.results.length === 0) setMessage('No matching place found. Try the area and city, for example "Linking Road Bandra".');
    } catch (err) {
      if (mine !== latest.current) return;
      setResults(null);
      setMessage(errorMessage(err));
    } finally {
      if (mine === latest.current) setBusy('');
    }
  }

  function locate() {
    if (!('geolocation' in navigator)) {
      setMessage('This browser cannot share your location. Search for the place instead.');
      return;
    }
    latest.current += 1;
    const mine = latest.current;
    setBusy('locating');
    setMessage('');
    setResults(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await api.get('/geo/reverse', { params: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
          if (mine !== latest.current) return;
          choose(r.data.data.place);
        } catch (err) {
          if (mine === latest.current) setMessage(errorMessage(err));
        } finally {
          if (mine === latest.current) setBusy('');
        }
      },
      (err) => {
        if (mine !== latest.current) return;
        setBusy('');
        setMessage(geolocationMessage(err));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function choose(place) {
    latest.current += 1; // drop any search still in flight
    setResults(null);
    setQuery('');
    setMessage('');
    setBusy('');
    onChange(place);
  }

  return (
    <div>
      <p id="loc-label" className="label">Location *</p>

      {value ? (
        <div className="space-y-3 rounded-xl border border-green-600/40 bg-green-50 p-3 dark:border-green-400/30 dark:bg-green-400/10">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold">✓ {value.label}</p>
              <p className="muted text-xs">Verified place · {formatCoords(value.lat, value.lng)}</p>
            </div>
            <button type="button" onClick={() => onChange(null)} className="btn-secondary !py-1.5">Change</button>
          </div>
          <iframe
            title="Map showing the selected location"
            src={osmEmbedUrl(value.lat, value.lng)}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-44 w-full rounded-lg border-0"
          />
          <p className="muted text-xs">
            Is the pin in the right spot? If not, press Change and pick a more exact place.{' '}
            <a href={osmLink(value.lat, value.lng)} target="_blank" rel="noopener noreferrer" className="font-bold underline">Open larger map</a>
            {' · © OpenStreetMap contributors'}
          </p>
        </div>
      ) : (
        <div className="space-y-3" aria-labelledby="loc-label">
          <div className="flex gap-2">
            <input
              id="loc-q"
              type="search"
              className={`input ${error ? 'input-error' : ''}`}
              placeholder="Street, area or landmark, e.g. Linking Road Bandra"
              aria-label="Search for the location"
              aria-invalid={error ? true : undefined}
              aria-describedby="loc-hint"
              maxLength={100}
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); search(); } // do not submit the whole report form
              }}
            />
            <button type="button" onClick={search} disabled={busy !== ''} className="btn-primary shrink-0">
              {busy === 'searching' ? 'Searching…' : 'Search'}
            </button>
          </div>
          <button type="button" onClick={locate} disabled={busy !== ''} className="btn-secondary w-full sm:w-auto">
            {busy === 'locating' ? 'Finding you…' : '📍 Use my current location'}
          </button>
          <p id="loc-hint" className="muted text-xs">
            Search, then pick the exact place from the list. Only real places can be reported, so typed text on its own cannot be submitted.
          </p>

          <div aria-live="polite">
            {message && <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-400/15 dark:text-amber-200">{message}</p>}
          </div>

          {results && results.length > 0 && (
            <div>
              <p className="muted mb-1 text-xs">Choose the correct place:</p>
              <ul className="divide-y divide-night-900/10 overflow-hidden rounded-xl border border-night-900/15 dark:divide-white/10 dark:border-white/15">
                {results.map((p) => (
                  <li key={p.token}>
                    <button type="button" onClick={() => choose(p)} className="w-full px-3 py-2.5 text-left text-sm hover:bg-sodium-500/15 focus:bg-sodium-500/15 focus:outline-none">
                      <span className="mr-1" aria-hidden="true">📍</span>{p.label}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="muted mt-1 text-xs">© OpenStreetMap contributors</p>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-1 text-xs font-bold text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}
