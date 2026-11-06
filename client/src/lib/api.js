import axios from 'axios';

// Cookies carry the JWT (httpOnly), so the client never touches the token.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' }, // required by the server's CSRF guard
});

export const errorMessage = (err) =>
  err?.response?.data?.error?.message ||
  (err?.request ? 'Cannot reach the server. Check your connection and try again.' : 'Something went wrong.');

/** Server validation details -> { field: message } */
export const fieldErrors = (err) =>
  Object.fromEntries((err?.response?.data?.error?.details || []).map((d) => [d.field, d.message]));
