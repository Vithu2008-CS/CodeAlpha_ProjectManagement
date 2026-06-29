// ------------------------------------------------------------------
//  Small DOM + formatting helpers shared across pages.
// ------------------------------------------------------------------

// Escape user-supplied text before injecting into innerHTML.
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Initials for an avatar bubble, e.g. "Alice Johnson" -> "AJ".
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic avatar colour from a string id.
const AVATAR_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
];
export function colorFor(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Build an avatar element for a user-ish object.
export function avatar(user, size = '') {
  const span = document.createElement('span');
  span.className = `avatar ${size}`.trim();
  span.textContent = initials(user?.displayName || user?.username || '?');
  span.style.background = colorFor(user?.id || user?.username || '');
  span.title = user?.displayName || user?.username || '';
  return span;
}

// "just now" / "5m ago" / "Jun 12" style relative time.
export function timeAgo(value) {
  const d = new Date(value);
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return 'just now';
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.round(sec / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Friendly due-date label, e.g. "Jun 30".
export function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// yyyy-mm-dd for <input type="date"> values.
export function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

// Classify a due date relative to today.
export function dueState(value) {
  if (!value) return '';
  const due = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due - today) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff <= 2) return 'due-soon';
  return '';
}

// Lightweight toast notifications.
let toastHost;
export function toast(message, type = '') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = `toast ${type ? `toast-${type}` : ''}`.trim();
  el.textContent = message;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

// Read a query-string param.
export function queryParam(name) {
  return new URLSearchParams(location.search).get(name);
}
