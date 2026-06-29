// ------------------------------------------------------------------
//  Kanban board: columns + draggable cards, task detail modal with
//  assignees/due dates/comments, member management, and full realtime
//  sync over Socket.io.
// ------------------------------------------------------------------

import { get, post, put, del, getUser, logout, requireAuth } from './api.js';
import { esc, avatar, toast, queryParam, formatDate, toDateInput, dueState } from './util.js';
import { openModal, confirmDialog } from './modal.js';
import { connectSocket } from './realtime.js';
import { initNotifications } from './notifications.js';

const state = {
  projectId: queryParam('id'),
  project: null,
  me: getUser(),
  socket: null,
  sortables: [],
  openTask: null, // { id, listEl } while a task modal is open
  reloadTimer: null,
};

if (requireAuth()) {
  if (!state.projectId) {
    location.href = '/dashboard.html';
  } else {
    init();
  }
}

async function init() {
  // Topbar identity / actions
  const who = document.getElementById('me');
  if (who && state.me) who.appendChild(avatar(state.me, 'sm'));
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('members-btn')?.addEventListener('click', openMembersModal);
  document.getElementById('settings-btn')?.addEventListener('click', openSettingsModal);

  // Realtime
  state.socket = connectSocket();
  if (state.socket) {
    const join = () => state.socket.emit('project:join', state.projectId);
    join();
    state.socket.on('connect', join); // re-join after a reconnect

    state.socket.on('board:update', (evt) => {
      if (evt?.type === 'project:deleted') {
        toast('This project was deleted', 'error');
        setTimeout(() => (location.href = '/dashboard.html'), 1200);
        return;
      }
      scheduleReload();
    });

    state.socket.on('comment:created', ({ taskId }) => {
      if (state.openTask && state.openTask.id === taskId) refreshOpenTaskComments();
    });
  }
  initNotifications(state.socket);

  await loadBoard();
}

// Debounced board refresh so a burst of socket events = one fetch.
function scheduleReload() {
  clearTimeout(state.reloadTimer);
  state.reloadTimer = setTimeout(loadBoard, 60);
}

async function loadBoard() {
  try {
    const { project } = await get(`/projects/${state.projectId}`);
    state.project = project;
    renderToolbar();
    renderBoard();
  } catch (err) {
    document.getElementById('board').innerHTML =
      `<div class="empty-state" style="margin:auto"><h3>Couldn’t open this board</h3><p class="muted">${esc(err.message)}</p><a class="btn btn-primary" href="/dashboard.html">Back to dashboard</a></div>`;
  }
}

function isOwner() {
  return state.project && state.project.ownerId === state.me?.id;
}

function renderToolbar() {
  document.getElementById('project-name').textContent = state.project.name;
  const desc = document.getElementById('project-desc');
  if (desc) desc.textContent = state.project.description || '';
  document.title = `${state.project.name} · Board`;
  // Only the owner sees project settings (rename/delete).
  document.getElementById('settings-btn')?.classList.toggle('hidden', !isOwner());
}

// ------------------------------------------------------------------ board
function renderBoard() {
  // Tear down old Sortable instances before rebuilding the DOM.
  state.sortables.forEach((s) => s.destroy());
  state.sortables = [];

  const board = document.getElementById('board');
  board.innerHTML = '';

  for (const col of state.project.columns) {
    board.appendChild(renderColumn(col));
  }
  board.appendChild(renderAddColumn());

  setupSortable();
}

function renderColumn(col) {
  const el = document.createElement('div');
  el.className = 'column';
  el.dataset.columnId = col.id;
  el.innerHTML = `
    <div class="column-header">
      <input class="col-name" value="${esc(col.name)}" maxlength="60" aria-label="Column name" />
      <span class="count">${col.tasks.length}</span>
      <button class="btn-icon col-del" title="Delete list">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
      </button>
    </div>
    <div class="cards" data-column-id="${col.id}"></div>
    <button class="add-card-btn">+ Add a card</button>
    <div class="composer hidden">
      <textarea placeholder="Enter a title for this card…"></textarea>
      <div class="composer-actions">
        <button class="btn btn-primary btn-sm composer-add">Add card</button>
        <button class="btn btn-ghost btn-sm composer-cancel">Cancel</button>
      </div>
    </div>`;

  const cards = el.querySelector('.cards');
  for (const task of col.tasks) cards.appendChild(renderCard(task));

  // Rename column on blur / Enter.
  const nameInput = el.querySelector('.col-name');
  const commitRename = async () => {
    const name = nameInput.value.trim();
    if (!name || name === col.name) {
      nameInput.value = col.name;
      return;
    }
    try {
      await put(`/columns/${col.id}`, { name });
      afterMutation();
    } catch (err) {
      toast(err.message, 'error');
      nameInput.value = col.name;
    }
  };
  nameInput.addEventListener('blur', commitRename);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') nameInput.blur();
    if (e.key === 'Escape') {
      nameInput.value = col.name;
      nameInput.blur();
    }
  });

  // Delete column.
  el.querySelector('.col-del').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete list',
      message: `Delete "${col.name}" and all of its cards? This can’t be undone.`,
      confirmText: 'Delete list',
      danger: true,
    });
    if (!ok) return;
    try {
      await del(`/columns/${col.id}`);
      afterMutation();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Add-card composer.
  const addBtn = el.querySelector('.add-card-btn');
  const composer = el.querySelector('.composer');
  const ta = composer.querySelector('textarea');
  addBtn.addEventListener('click', () => {
    composer.classList.remove('hidden');
    addBtn.classList.add('hidden');
    ta.focus();
  });
  const closeComposer = () => {
    composer.classList.add('hidden');
    addBtn.classList.remove('hidden');
    ta.value = '';
  };
  composer.querySelector('.composer-cancel').addEventListener('click', closeComposer);
  const submitCard = async () => {
    const title = ta.value.trim();
    if (!title) return;
    try {
      await post(`/columns/${col.id}/tasks`, { title });
      ta.value = '';
      afterMutation();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  composer.querySelector('.composer-add').addEventListener('click', submitCard);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCard();
    }
    if (e.key === 'Escape') closeComposer();
  });

  return el;
}

function renderCard(task) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.taskId = task.id;

  const chips = [];
  if (task.dueDate) {
    const ds = dueState(task.dueDate);
    chips.push(
      `<span class="badge-chip ${ds}" title="Due date">📅 ${esc(formatDate(task.dueDate))}</span>`
    );
  }
  if (task._count?.comments) {
    chips.push(`<span class="badge-chip" title="Comments">💬 ${task._count.comments}</span>`);
  }

  card.innerHTML = `
    <div class="card-title">${esc(task.title)}</div>
    <div class="card-meta">
      ${chips.join('')}
      <span class="spacer"></span>
    </div>`;

  // Hide the meta row entirely when there's nothing to show.
  const meta = card.querySelector('.card-meta');
  if (task.assignee) {
    meta.appendChild(avatar(task.assignee, 'sm'));
  } else if (!chips.length) {
    meta.remove();
  }

  card.addEventListener('click', () => openTaskModal(task.id));
  return card;
}

function renderAddColumn() {
  const wrap = document.createElement('div');
  wrap.className = 'add-column';
  wrap.innerHTML = `<button class="add-column-btn">+ Add another list</button>`;
  wrap.querySelector('button').addEventListener('click', async function () {
    const btn = this;
    btn.outerHTML = `
      <div class="column" style="padding:8px">
        <input class="col-name new-col" placeholder="List name…" style="margin-bottom:8px" />
        <div class="composer-actions">
          <button class="btn btn-primary btn-sm add-col-go">Add list</button>
          <button class="btn btn-ghost btn-sm add-col-cancel">Cancel</button>
        </div>
      </div>`;
    const input = wrap.querySelector('.new-col');
    input.focus();
    const go = async () => {
      const name = input.value.trim();
      if (!name) return;
      try {
        await post(`/projects/${state.projectId}/columns`, { name });
        afterMutation();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    wrap.querySelector('.add-col-go').addEventListener('click', go);
    wrap.querySelector('.add-col-cancel').addEventListener('click', renderBoardSoft);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
      if (e.key === 'Escape') renderBoardSoft();
    });
  });
  return wrap;
}

// Re-render board from current state without refetching (used to cancel inline editors).
function renderBoardSoft() {
  renderBoard();
}

function setupSortable() {
  document.querySelectorAll('.cards').forEach((listEl) => {
    const s = window.Sortable.create(listEl, {
      group: 'cards',
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: onCardDrop,
    });
    state.sortables.push(s);
  });
}

async function onCardDrop(evt) {
  const taskId = evt.item.dataset.taskId;
  const toColumnId = evt.to.dataset.columnId;
  const newPosition = evt.newIndex;

  // No-op drop (same column, same slot).
  if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;

  try {
    await put(`/tasks/${taskId}`, { columnId: toColumnId, position: newPosition });
    afterMutation(); // socket echo will also refresh other open boards
  } catch (err) {
    toast(err.message, 'error');
    loadBoard(); // revert optimistic move
  }
}

// After a successful write: refresh our own board immediately. If a socket
// echo also arrives, the debounce coalesces the two into one fetch.
function afterMutation() {
  scheduleReload();
}

// ------------------------------------------------------------------ task modal
async function openTaskModal(taskId) {
  let task;
  try {
    ({ task } = await get(`/tasks/${taskId}`));
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  const { body, footer, setTitle, close } = openModal({ title: task.title });

  const memberOptions = state.project.members
    .map((m) => {
      const sel = m.user.id === task.assigneeId ? 'selected' : '';
      return `<option value="${m.user.id}" ${sel}>${esc(m.user.displayName)}</option>`;
    })
    .join('');

  body.innerHTML = `
    <div class="field">
      <label>Title</label>
      <input id="t-title" type="text" value="${esc(task.title)}" maxlength="200" />
    </div>
    <div class="field">
      <label>Description</label>
      <textarea id="t-desc" placeholder="Add more detail…">${esc(task.description || '')}</textarea>
    </div>
    <div class="modal-grid">
      <div class="field">
        <label>Assignee</label>
        <select id="t-assignee">
          <option value="">Unassigned</option>
          ${memberOptions}
        </select>
      </div>
      <div class="field">
        <label>Due date</label>
        <input id="t-due" type="date" value="${toDateInput(task.dueDate)}" />
      </div>
    </div>
    <div class="muted small">Created by ${esc(task.createdBy?.displayName || 'someone')}</div>

    <div class="comments-section">
      <h4>Comments</h4>
      <div id="t-comments"></div>
      <div class="comment-form">
        <textarea id="t-comment-input" placeholder="Write a comment…" rows="1"></textarea>
        <button class="btn btn-primary btn-sm" id="t-comment-send">Send</button>
      </div>
    </div>`;

  footer.innerHTML = `
    <button class="btn btn-danger" id="t-delete">Delete</button>
    <span class="spacer"></span>
    <button class="btn" id="t-cancel">Close</button>
    <button class="btn btn-primary" id="t-save">Save changes</button>`;

  const listEl = body.querySelector('#t-comments');
  state.openTask = { id: taskId, listEl };
  renderComments(listEl, task.comments || []);

  // Save field edits (title / description / assignee / due date).
  footer.querySelector('#t-save').addEventListener('click', async (e) => {
    const title = body.querySelector('#t-title').value.trim();
    if (!title) {
      toast('Title cannot be empty', 'error');
      return;
    }
    e.target.disabled = true;
    e.target.textContent = 'Saving…';
    try {
      await put(`/tasks/${taskId}`, {
        title,
        description: body.querySelector('#t-desc').value,
        assigneeId: body.querySelector('#t-assignee').value || null,
        dueDate: body.querySelector('#t-due').value || null,
      });
      setTitle(title);
      toast('Task saved', 'success');
      afterMutation();
      closeTaskModal(close);
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
      e.target.textContent = 'Save changes';
    }
  });

  // Delete task.
  footer.querySelector('#t-delete').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete card',
      message: `Delete "${task.title}"? This can’t be undone.`,
      confirmText: 'Delete card',
      danger: true,
    });
    if (!ok) return;
    try {
      await del(`/tasks/${taskId}`);
      afterMutation();
      closeTaskModal(close);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  footer.querySelector('#t-cancel').addEventListener('click', () => closeTaskModal(close));

  // Add a comment.
  const input = body.querySelector('#t-comment-input');
  const sendComment = async () => {
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    try {
      await post(`/tasks/${taskId}/comments`, { content });
      // The comment:created echo refreshes the list; refresh now too for snappiness.
      refreshOpenTaskComments();
      afterMutation(); // update the card's comment count on the board
    } catch (err) {
      toast(err.message, 'error');
      input.value = content;
    }
  };
  body.querySelector('#t-comment-send').addEventListener('click', sendComment);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendComment();
    }
  });

  // Make sure we forget the open task when the modal closes by any means.
  const overlay = body.closest('.modal-overlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) state.openTask = null;
  });
  document.addEventListener('keydown', function escClear(e) {
    if (e.key === 'Escape') {
      state.openTask = null;
      document.removeEventListener('keydown', escClear);
    }
  });
}

function closeTaskModal(close) {
  state.openTask = null;
  close();
}

function renderComments(listEl, comments) {
  if (!comments.length) {
    listEl.innerHTML = '<p class="muted small">No comments yet. Start the conversation.</p>';
    return;
  }
  listEl.innerHTML = '';
  for (const c of comments) {
    const row = document.createElement('div');
    row.className = 'comment';
    row.appendChild(avatar(c.author, 'sm'));
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'c-body';
    bodyWrap.innerHTML = `
      <div class="c-head">
        <span class="c-author">${esc(c.author?.displayName || 'User')}</span>
        <span class="c-time">${esc(formatDate(c.createdAt))}</span>
      </div>
      <div class="c-text">${esc(c.content)}</div>`;
    row.appendChild(bodyWrap);
    listEl.appendChild(row);
  }
  listEl.scrollTop = listEl.scrollHeight;
}

async function refreshOpenTaskComments() {
  const open = state.openTask;
  if (!open) return;
  try {
    const { comments } = await get(`/tasks/${open.id}/comments`);
    if (state.openTask && state.openTask.id === open.id) {
      renderComments(open.listEl, comments);
    }
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ members modal
function openMembersModal() {
  const { body, footer, close } = openModal({ title: 'Project members' });
  body.innerHTML = `
    <div class="field">
      <label>Invite a member <span class="muted">(by username or email)</span></label>
      <div class="row">
        <input id="inv-input" type="text" placeholder="username or email" />
        <button class="btn btn-primary" id="inv-btn">Invite</button>
      </div>
      <div class="form-error hidden" id="inv-error" style="margin-top:10px"></div>
    </div>
    <div id="members-list" style="margin-top:6px"></div>`;
  footer.innerHTML = `<span class="spacer"></span><button class="btn" id="mem-close">Done</button>`;
  footer.querySelector('#mem-close').addEventListener('click', close);

  const listEl = body.querySelector('#members-list');
  const errBox = body.querySelector('#inv-error');

  const renderMembers = (members) => {
    listEl.innerHTML = '';
    for (const m of members) {
      const row = document.createElement('div');
      row.className = 'member-row';
      row.appendChild(avatar(m.user));
      const info = document.createElement('div');
      info.className = 'm-info';
      info.innerHTML = `
        <div class="m-name">${esc(m.user.displayName)} ${m.role === 'OWNER' ? '<span class="owner-tag">Owner</span>' : ''}</div>
        <div class="m-sub">@${esc(m.user.username)} · ${esc(m.user.email)}</div>`;
      row.appendChild(info);
      if (isOwner() && m.role !== 'OWNER') {
        const rm = document.createElement('button');
        rm.className = 'btn btn-ghost btn-sm';
        rm.textContent = 'Remove';
        rm.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'Remove member',
            message: `Remove ${m.user.displayName} from this project?`,
            confirmText: 'Remove',
            danger: true,
          });
          if (!ok) return;
          try {
            await del(`/projects/${state.projectId}/members/${m.user.id}`);
            await reloadMembers();
            afterMutation();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
        row.appendChild(rm);
      }
      listEl.appendChild(row);
    }
  };

  const reloadMembers = async () => {
    const { members } = await get(`/projects/${state.projectId}/members`);
    renderMembers(members);
  };

  const invite = async () => {
    const usernameOrEmail = body.querySelector('#inv-input').value.trim();
    errBox.classList.add('hidden');
    if (!usernameOrEmail) return;
    try {
      await post(`/projects/${state.projectId}/members`, { usernameOrEmail });
      body.querySelector('#inv-input').value = '';
      toast('Member added', 'success');
      await reloadMembers();
      afterMutation();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  };
  body.querySelector('#inv-btn').addEventListener('click', invite);
  body.querySelector('#inv-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') invite();
  });

  renderMembers(state.project.members);
}

// ------------------------------------------------------------------ settings modal (owner)
function openSettingsModal() {
  const { body, footer, close } = openModal({ title: 'Project settings' });
  body.innerHTML = `
    <div class="field">
      <label>Project name</label>
      <input id="s-name" type="text" value="${esc(state.project.name)}" maxlength="80" />
    </div>
    <div class="field">
      <label>Description</label>
      <textarea id="s-desc">${esc(state.project.description || '')}</textarea>
    </div>
    <div class="form-error hidden" id="s-error"></div>`;
  footer.innerHTML = `
    <button class="btn btn-danger" id="s-delete">Delete project</button>
    <span class="spacer"></span>
    <button class="btn" id="s-cancel">Cancel</button>
    <button class="btn btn-primary" id="s-save">Save</button>`;

  const errBox = body.querySelector('#s-error');
  footer.querySelector('#s-cancel').addEventListener('click', close);

  footer.querySelector('#s-save').addEventListener('click', async (e) => {
    const name = body.querySelector('#s-name').value.trim();
    if (!name) {
      errBox.textContent = 'Project name is required';
      errBox.classList.remove('hidden');
      return;
    }
    e.target.disabled = true;
    try {
      await put(`/projects/${state.projectId}`, {
        name,
        description: body.querySelector('#s-desc').value,
      });
      toast('Project updated', 'success');
      afterMutation();
      close();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
      e.target.disabled = false;
    }
  });

  footer.querySelector('#s-delete').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete project',
      message: `Permanently delete "${state.project.name}" and everything in it?`,
      confirmText: 'Delete project',
      danger: true,
    });
    if (!ok) return;
    try {
      await del(`/projects/${state.projectId}`);
      toast('Project deleted', 'success');
      location.href = '/dashboard.html';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
