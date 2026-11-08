import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Complaint photos are private: this URL only works for the signed-in owner and for admins (the cookie is sent).
export const imageUrl = (id) => `${API_BASE}/images/${id}`;

// Cookies carry the JWT (httpOnly), so the client never touches the token.
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' }, // required by the server's CSRF guard
});

export const errorMessage = (err) =>
  err?.response?.data?.error?.message ||
  (err?.request ? 'Cannot reach the server. Check your connection and try again.' : 'Something went wrong.');

/** Server validation details -> { field: message } */
export const fieldErrors = (err) =>
  Object.fromEntries((err?.response?.data?.error?.details || []).map((d) => [d.field, d.message]));
