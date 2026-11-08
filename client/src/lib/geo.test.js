import { describe, expect, it } from 'vitest';
import { formatCoords, geolocationMessage, osmEmbedUrl, osmLink } from './geo';

describe('map helpers', () => {
  it('builds an OpenStreetMap embed URL with a marker on the point and a box around it', () => {
    const url = new URL(osmEmbedUrl(19.0654, 72.8353));
    expect(url.origin + url.pathname).toBe('https://www.openstreetmap.org/export/embed.html');
    expect(url.searchParams.get('marker')).toBe('19.065400,72.835300');
    const [minLng, minLat, maxLng, maxLat] = url.searchParams.get('bbox').split(',').map(Number);
    expect(minLng < 72.8353 && 72.8353 < maxLng).toBe(true);
    expect(minLat < 19.0654 && 19.0654 < maxLat).toBe(true);
  });

  it('links to the point on openstreetmap.org', () => {
    expect(osmLink(19.0654, 72.8353)).toBe('https://www.openstreetmap.org/?mlat=19.0654&mlon=72.8353#map=18/19.0654/72.8353');
  });

  it('formats coordinates to 5 decimals', () => {
    expect(formatCoords(19.06543219, 72.8353)).toBe('19.06543, 72.83530');
  });

  it('turns browser geolocation errors into helpful sentences', () => {
    expect(geolocationMessage({ code: 1 })).toMatch(/permission/i);
    expect(geolocationMessage({ code: 3 })).toMatch(/too long/i);
    expect(geolocationMessage({ code: 2 })).toMatch(/search/i);
    expect(geolocationMessage(undefined)).toMatch(/search/i);
  });
});
