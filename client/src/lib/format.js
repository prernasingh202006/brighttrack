const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const formatDate = (d) => dateFmt.format(new Date(d));
export const formatDateTime = (d) => dateTimeFmt.format(new Date(d));

export function timeAgo(d) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d)) / 1000));
  const steps = [[86400, 'd'], [3600, 'h'], [60, 'm']];
  for (const [n, u] of steps) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
  return 'just now';
}
