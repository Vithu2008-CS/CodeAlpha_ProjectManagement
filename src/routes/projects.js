import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, badRequest, notFound, conflict } from '../lib/http.js';
import { assertMember, assertOwner } from '../lib/access.js';
import { publicUser, taskInclude } from '../lib/select.js';
import { emitToProject } from '../socket.js';
import { notify } from '../lib/notify.js';

const router = Router();
router.use(authRequired);

// Shape returned by GET /projects/:id — the full board.
const fullProjectInclude = {
  owner: { select: publicUser },
  members: {
    include: { user: { select: publicUser } },
    orderBy: { role: 'asc' },
  },
  columns: {
    orderBy: { position: 'asc' },
    include: {
      tasks: { orderBy: { position: 'asc' }, include: taskInclude },
    },
  },
};

// GET /api/projects  — projects the current user belongs to.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { members: { some: { userId: req.userId } } },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: publicUser },
        members: { include: { user: { select: publicUser } } },
        _count: { select: { tasks: true, columns: true, members: true } },
      },
    });
    res.json({ projects });
  })
);

// POST /api/projects  — create a project (owner membership + default columns).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = (req.body?.name || '').trim();
    const description = (req.body?.description || '').trim() || null;
    if (!name) throw badRequest('Project name is required');

    const project = await prisma.project.create({
      data: {
        name,
        description,
        ownerId: req.userId,
        members: { create: { userId: req.userId, role: 'OWNER' } },
        columns: {
          create: [
            { name: 'To Do', position: 0 },
            { name: 'In Progress', position: 1 },
            { name: 'Done', position: 2 },
          ],
        },
      },
      include: fullProjectInclude,
    });

    res.status(201).json({ project });
  })
);

// GET /api/projects/:id  — full board (columns, tasks, members).
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertMember(req.params.id, req.userId);
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: fullProjectInclude,
    });
    if (!project) throw notFound('Project not found');
    res.json({ project });
  })
);

// PUT /api/projects/:id  — rename / edit description (owner only).
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertOwner(req.params.id, req.userId);

    const data = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) throw badRequest('Project name cannot be empty');
      data.name = name;
    }
    if (req.body?.description !== undefined) {
      data.description = String(req.body.description).trim() || null;
    }

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data,
      include: fullProjectInclude,
    });

    emitToProject(project.id, 'board:update', { type: 'project:updated' });
    res.json({ project });
  })
);

// DELETE /api/projects/:id  — owner only.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertOwner(req.params.id, req.userId);
    await prisma.project.delete({ where: { id: req.params.id } });
    emitToProject(req.params.id, 'board:update', { type: 'project:deleted' });
    res.json({ ok: true });
  })
);

// GET /api/projects/:id/members
router.get(
  '/:id/members',
  asyncHandler(async (req, res) => {
    await assertMember(req.params.id, req.userId);
    const members = await prisma.projectMember.findMany({
      where: { projectId: req.params.id },
      include: { user: { select: publicUser } },
      orderBy: { role: 'asc' },
    });
    res.json({ members });
  })
);

// POST /api/projects/:id/members  — invite by username OR email.
router.post(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const projectId = req.params.id;
    await assertMember(projectId, req.userId);

    const identifier = (req.body?.usernameOrEmail || req.body?.login || '')
      .trim()
      .toLowerCase();
    if (!identifier) throw badRequest('Provide a username or email to invite');

    const user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
      select: publicUser,
    });
    if (!user) throw notFound('No user found with that username or email');

    const already = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (already) throw conflict('That user is already a member');

    const member = await prisma.projectMember.create({
      data: { projectId, userId: user.id, role: 'MEMBER' },
      include: { user: { select: publicUser } },
    });

    const project = await prisma.project.findUnique({ where: { id: projectId } });

    // Live board refresh for everyone + a personal notification for the invitee.
    emitToProject(projectId, 'board:update', { type: 'member:added' });
    await notify({
      userId: user.id,
      actorId: req.userId,
      type: 'MEMBER_ADDED',
      message: `You were added to project "${project?.name ?? 'a project'}"`,
      projectId,
    });

    res.status(201).json({ member });
  })
);

// DELETE /api/projects/:id/members/:userId  — owner only; cannot remove owner.
router.delete(
  '/:id/members/:userId',
  asyncHandler(async (req, res) => {
    const projectId = req.params.id;
    await assertOwner(projectId, req.userId);

    const target = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: req.params.userId } },
    });
    if (!target) throw notFound('That user is not a member');
    if (target.role === 'OWNER') throw badRequest('The project owner cannot be removed');

    await prisma.projectMember.delete({ where: { id: target.id } });
    emitToProject(projectId, 'board:update', { type: 'member:removed' });
    res.json({ ok: true });
  })
);

export default router;
