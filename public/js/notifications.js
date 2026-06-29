// ------------------------------------------------------------------
//  Notification bell: unread badge + dropdown list, kept live over the
//  socket. Expects this markup somewhere on the page:
//
//    #bell-btn  #bell-badge  #notif-dropdown  #notif-list  #notif-markall
// ------------------------------------------------------------------

import { get, put } from './api.js';
import { esc, timeAgo, toast, queryParam } from './util.js';

let state = { items: [], unread: 0 };
let els = {};

export async function initNotifications(socket) {
  els = {
    btn: document.getElementById('bell-btn'),
    badge: document.getElementById('bell-badge'),
    dropdown: document.getElementById('notif-dropdown'),
    list: document.getElementById('notif-list'),
    markAll: document.getElementById('notif-markall'),
  };
  if (!els.btn) return;

  els.btn.addEventListener('click', (e) => {
    e.stopPropagation();
    els.dropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!els.dropdown.contains(e.target) && !els.btn.contains(e.target)) {
      els.dropdown.classList.add('hidden');
    }
  });
  els.markAll.addEventListener('click', markAllRead);

  // Live notifications pushed to our personal room.
  if (socket) {
    socket.on('notification', (n) => {
      state.items.unshift(n);
      state.unread += 1;
      render();
      toast(n.message);
    });
  }

  await load();
}

async function load() {
  try {
    const data = await get('/notifications');
    state.items = data.notifications || [];
    state.unread = data.unread || 0;
    render();
  } catch {
    /* non-fatal — bell just stays empty */
  }
}

function render() {
  // Badge
  if (state.unread > 0) {
    els.badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
    els.badge.classList.remove('hidden');
  } else {
    els.badge.classList.add('hidden');
  }

  // List
  if (!state.items.length) {
    els.list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  els.list.innerHTML = state.items
    .map(
      (n) => `
      <div class="notif-item ${n.read ? 'read' : 'unread'}" data-id="${n.id}" data-project="${n.projectId || ''}">
        <span class="notif-dot"></span>
        <div class="notif-body">
          <div class="t">${esc(n.message)}</div>
          <div class="time">${timeAgo(n.createdAt)}</div>
        </div>
      </div>`
    )
    .join('');

  els.list.querySelectorAll('.notif-item').forEach((row) => {
    row.addEventListener('click', () => onItemClick(row.dataset.id, row.dataset.project));
  });
}

async function onItemClick(id, projectId) {
  const item = state.items.find((n) => n.id === id);
  if (item && !item.read) {
    item.read = true;
    state.unread = Math.max(0, state.unread - 1);
    render();
    put(`/notifications/${id}/read`).catch(() => {});
  }
  // Jump to the related board if it isn't the one we're already viewing.
  if (projectId && queryParam('id') !== projectId) {
    location.href = `/board.html?id=${projectId}`;
  } else {
    els.dropdown.classList.add('hidden');
  }
}

async function markAllRead() {
  state.items.forEach((n) => (n.read = true));
  state.unread = 0;
  render();
  try {
    await put('/notifications/read-all');
  } catch {
    /* ignore */
  }
}
