// ------------------------------------------------------------------
//  Dashboard: list my projects, create new ones. Also connects the
//  socket so notifications arrive live even before opening a board.
// ------------------------------------------------------------------

import { get, post, getUser, logout, requireAuth } from './api.js';
import { esc, avatar, toast } from './util.js';
import { openModal } from './modal.js';
import { connectSocket } from './realtime.js';
import { initNotifications } from './notifications.js';

if (requireAuth()) init();

async function init() {
  const me = getUser();
  // Topbar identity + actions
  const who = document.getElementById('me');
  if (who && me) {
    who.appendChild(avatar(me, 'sm'));
    const name = document.createElement('span');
    name.textContent = me.displayName || me.username;
    name.style.fontWeight = '600';
    who.appendChild(name);
  }
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('new-project-btn')?.addEventListener('click', openCreateModal);

  const socket = connectSocket();
  initNotifications(socket);

  await loadProjects();
}

async function loadProjects() {
  const grid = document.getElementById('projects');
  grid.innerHTML = '<div class="loading"><div class="spinner"></div>Loading projects…</div>';
  try {
    const { projects } = await get('/projects');
    renderProjects(projects);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

function renderProjects(projects) {
  const grid = document.getElementById('projects');
  const me = getUser();

  if (!projects.length) {
    grid.classList.remove('projects-grid');
    grid.innerHTML = `
      <div class="empty-state">
        <div class="big">🗂️</div>
        <h3>No projects yet</h3>
        <p class="muted">Create your first board to start collaborating.</p>
        <button class="btn btn-primary" id="empty-create">+ New Project</button>
      </div>`;
    document.getElementById('empty-create').addEventListener('click', openCreateModal);
    return;
  }

  grid.classList.add('projects-grid');
  grid.innerHTML = '';
  for (const p of projects) {
    const isOwner = p.ownerId === me?.id;
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="pc-bar"></div>
      <h3>${esc(p.name)} ${isOwner ? '<span class="owner-tag">Owner</span>' : ''}</h3>
      <div class="desc">${esc(p.description || 'No description')}</div>
      <div class="pc-foot">
        <div class="avatars"></div>
        <span class="pill">${p._count?.tasks ?? 0} tasks</span>
      </div>`;

    const avatars = card.querySelector('.avatars');
    (p.members || []).slice(0, 4).forEach((m) => avatars.appendChild(avatar(m.user, 'sm')));
    if ((p.members?.length || 0) > 4) {
      const more = document.createElement('span');
      more.className = 'avatar sm';
      more.style.background = '#8993a4';
      more.textContent = `+${p.members.length - 4}`;
      avatars.appendChild(more);
    }

    card.addEventListener('click', () => (location.href = `/board.html?id=${p.id}`));
    grid.appendChild(card);
  }
}

function openCreateModal() {
  const { body, footer, close } = openModal({ title: 'Create a project', size: 'sm' });
  body.innerHTML = `
    <div class="field">
      <label for="np-name">Project name</label>
      <input id="np-name" type="text" placeholder="e.g. Marketing Sprint" maxlength="80" autofocus />
    </div>
    <div class="field">
      <label for="np-desc">Description <span class="muted">(optional)</span></label>
      <textarea id="np-desc" placeholder="What is this board about?"></textarea>
    </div>
    <div class="form-error hidden" id="np-error"></div>`;
  footer.innerHTML = `
    <span class="spacer"></span>
    <button class="btn" id="np-cancel">Cancel</button>
    <button class="btn btn-primary" id="np-create">Create project</button>`;

  const nameInput = body.querySelector('#np-name');
  const errBox = body.querySelector('#np-error');
  footer.querySelector('#np-cancel').addEventListener('click', close);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') footer.querySelector('#np-create').click();
  });

  footer.querySelector('#np-create').addEventListener('click', async (e) => {
    const name = nameInput.value.trim();
    const description = body.querySelector('#np-desc').value.trim();
    if (!name) {
      errBox.textContent = 'Please enter a project name';
      errBox.classList.remove('hidden');
      return;
    }
    e.target.disabled = true;
    e.target.textContent = 'Creating…';
    try {
      const { project } = await post('/projects', { name, description });
      toast('Project created', 'success');
      location.href = `/board.html?id=${project.id}`;
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
      e.target.disabled = false;
      e.target.textContent = 'Create project';
    }
  });

  setTimeout(() => nameInput.focus(), 30);
}
