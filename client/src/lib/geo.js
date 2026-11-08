// Small helpers for showing a place on the free OpenStreetMap embed (no API key, no map library).
export const formatCoords = (lat, lng) => `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;

/** URL for an <iframe> map with a marker on the point. */
export function osmEmbedUrl(lat, lng, span = 0.004) {
  const bbox = [lng - span, lat - span * 0.75, lng + span, lat + span * 0.75].map((n) => n.toFixed(6)).join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
}

/** Link that opens the point on openstreetmap.org. */
export const osmLink = (lat, lng, zoom = 18) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;

/** Friendly text for a browser geolocation error. */
export function geolocationMessage(err) {
  if (!err) return 'We could not get your location. Search for the place instead.';
  if (err.code === 1) return 'Location permission was denied. Allow it in your browser settings, or search for the place instead.';
  if (err.code === 3) return 'Finding your location took too long. Move to an open area and try again, or search for the place instead.';
  return 'Your device could not work out its location. Search for the place instead.';
}
