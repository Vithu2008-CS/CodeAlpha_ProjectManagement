import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, badRequest, notFound } from '../lib/http.js';
import { resolveColumn, resolveTask, getMembership } from '../lib/access.js';
import { publicUser, taskInclude } from '../lib/select.js';
import { emitToProject } from '../socket.js';
import { notify } from '../lib/notify.js';

const router = Router();
router.use(authRequired);

// Validate that an assignee (if provided) is a member of the project.
async function assertAssigneeIsMember(projectId, assigneeId) {
  if (!assigneeId) return;
  const membership = await getMembership(projectId, assigneeId);
  if (!membership) throw badRequest('Assignee must be a member of the project');
}

// Parse an incoming dueDate value into a Date or null. Throws on garbage.
function parseDueDate(value) {
  if (value === undefined) return undefined; // not provided -> leave unchanged
  if (value === null || value === '') return null; // clear it
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest('Invalid dueDate');
  return d;
}

// Move a task to (columnId, position) and densely renumber affected columns.
async function moveTask(task, newColumnId, newPosition) {
  const targetColumnId = newColumnId || task.columnId;
  const oldColumnId = task.columnId;

  const targetSiblings = await prisma.task.findMany({
    where: { columnId: targetColumnId, id: { not: task.id } },
    orderBy: { position: 'asc' },
  });

  const index =
    newPosition === undefined || newPosition === null
      ? targetSiblings.length
      : Math.max(0, Math.min(parseInt(newPosition, 10) || 0, targetSiblings.length));

  targetSiblings.splice(index, 0, task);

  const ops = targetSiblings.map((t, i) =>
    prisma.task.update({
      where: { id: t.id },
      data: { position: i, columnId: targetColumnId },
    })
  );

  // If the task changed columns, compact the column it left behind too.
  if (oldColumnId !== targetColumnId) {
    const oldSiblings = await prisma.task.findMany({
      where: { columnId: oldColumnId, id: { not: task.id } },
      orderBy: { position: 'asc' },
    });
    oldSiblings.forEach((t, i) =>
      ops.push(prisma.task.update({ where: { id: t.id }, data: { position: i } }))
    );
  }

  await prisma.$transaction(ops);
}

// POST /api/columns/:id/tasks  — create a card at the end of a column.
router.post(
  '/columns/:id/tasks',
  asyncHandler(async (req, res) => {
    const column = await resolveColumn(req.params.id, req.userId);

    const title = (req.body?.title || '').trim();
    if (!title) throw badRequest('Task title is required');

    const description = (req.body?.description || '').trim() || null;
    const assigneeId = req.body?.assigneeId || null;
    const dueDate = parseDueDate(req.body?.dueDate) ?? null;
    await assertAssigneeIsMember(column.projectId, assigneeId);

    const count = await prisma.task.count({ where: { columnId: column.id } });
    const created = await prisma.task.create({
      data: {
        columnId: column.id,
        projectId: column.projectId,
        title,
        description,
        assigneeId,
        dueDate,
        position: count,
        createdById: req.userId,
      },
      include: taskInclude,
    });

    emitToProject(column.projectId, 'board:update', { type: 'task:created' });

    if (assigneeId) {
      await notify({
        userId: assigneeId,
        actorId: req.userId,
        type: 'ASSIGNED',
        message: `You were assigned to "${created.title}"`,
        projectId: column.projectId,
        taskId: created.id,
      });
    }

    res.status(201).json({ task: created });
  })
);

// GET /api/tasks/:id  — a single task with comments.
router.get(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    await resolveTask(req.params.id, req.userId);
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        ...taskInclude,
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: publicUser } },
        },
      },
    });
    res.json({ task });
  })
);

// PUT /api/tasks/:id  — edit fields, (re)assign, and/or move between columns.
router.put(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const existing = await resolveTask(req.params.id, req.userId);
    const body = req.body || {};

    // ---- simple field edits ----
    const data = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) throw badRequest('Task title cannot be empty');
      data.title = title;
    }
    if (body.description !== undefined) {
      data.description = String(body.description).trim() || null;
    }
    const due = parseDueDate(body.dueDate);
    if (due !== undefined) data.dueDate = due;

    let newAssignee;
    if (body.assigneeId !== undefined) {
      newAssignee = body.assigneeId || null;
      await assertAssigneeIsMember(existing.projectId, newAssignee);
      data.assigneeId = newAssignee;
    }

    // ---- validate move target (same project) ----
    let targetColumnId;
    if (body.columnId !== undefined && body.columnId !== existing.columnId) {
      const target = await prisma.column.findUnique({ where: { id: body.columnId } });
      if (!target || target.projectId !== existing.projectId) {
        throw badRequest('Target column is not part of this project');
      }
      targetColumnId = body.columnId;
    }

    if (Object.keys(data).length) {
      await prisma.task.update({ where: { id: existing.id }, data });
    }

    const moveRequested =
      targetColumnId !== undefined || body.position !== undefined;
    if (moveRequested) {
      await moveTask(existing, targetColumnId ?? existing.columnId, body.position);
    }

    const task = await prisma.task.findUnique({
      where: { id: existing.id },
      include: taskInclude,
    });

    emitToProject(existing.projectId, 'board:update', {
      type: moveRequested ? 'task:moved' : 'task:updated',
    });

    // Notify a newly-assigned member (only when the assignee actually changed).
    if (
      newAssignee &&
      newAssignee !== existing.assigneeId &&
      newAssignee !== req.userId
    ) {
      await notify({
        userId: newAssignee,
        actorId: req.userId,
        type: 'ASSIGNED',
        message: `You were assigned to "${task.title}"`,
        projectId: existing.projectId,
        taskId: existing.id,
      });
    }

    res.json({ task });
  })
);

// DELETE /api/tasks/:id
router.delete(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const existing = await resolveTask(req.params.id, req.userId);
    await prisma.task.delete({ where: { id: existing.id } });

    // Compact remaining cards in the column.
    const siblings = await prisma.task.findMany({
      where: { columnId: existing.columnId },
      orderBy: { position: 'asc' },
    });
    await prisma.$transaction(
      siblings.map((t, i) =>
        prisma.task.update({ where: { id: t.id }, data: { position: i } })
      )
    );

    emitToProject(existing.projectId, 'board:update', { type: 'task:deleted' });
    res.json({ ok: true });
  })
);

// GET /api/tasks/:id/comments
router.get(
  '/tasks/:id/comments',
  asyncHandler(async (req, res) => {
    await resolveTask(req.params.id, req.userId);
    const comments = await prisma.taskComment.findMany({
      where: { taskId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: publicUser } },
    });
    res.json({ comments });
  })
);

// POST /api/tasks/:id/comments
router.post(
  '/tasks/:id/comments',
  asyncHandler(async (req, res) => {
    const task = await resolveTask(req.params.id, req.userId);

    const content = (req.body?.content || '').trim();
    if (!content) throw badRequest('Comment content is required');

    const comment = await prisma.taskComment.create({
      data: { taskId: task.id, authorId: req.userId, content },
      include: { author: { select: publicUser } },
    });

    // Push the new comment to open boards and refresh card comment counts.
    emitToProject(task.projectId, 'comment:created', { taskId: task.id, comment });
    emitToProject(task.projectId, 'board:update', { type: 'comment:created' });

    // Notify the assignee and the task creator (never the commenter).
    const recipients = new Set();
    if (task.assigneeId) recipients.add(task.assigneeId);
    if (task.createdById) recipients.add(task.createdById);
    recipients.delete(req.userId);
    for (const userId of recipients) {
      await notify({
        userId,
        actorId: req.userId,
        type: 'COMMENT',
        message: `${comment.author.displayName} commented on "${task.title}"`,
        projectId: task.projectId,
        taskId: task.id,
      });
    }

    res.status(201).json({ comment });
  })
);

export default router;
