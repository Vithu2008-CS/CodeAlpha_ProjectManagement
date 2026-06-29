import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, badRequest } from '../lib/http.js';
import { assertMember, resolveColumn } from '../lib/access.js';
import { emitToProject } from '../socket.js';

const router = Router();
router.use(authRequired);

// POST /api/projects/:id/columns  — add a column at the end of the board.
router.post(
  '/projects/:id/columns',
  asyncHandler(async (req, res) => {
    const projectId = req.params.id;
    await assertMember(projectId, req.userId);

    const name = (req.body?.name || '').trim();
    if (!name) throw badRequest('Column name is required');

    const count = await prisma.column.count({ where: { projectId } });
    const column = await prisma.column.create({
      data: { projectId, name, position: count },
    });

    emitToProject(projectId, 'board:update', { type: 'column:created' });
    res.status(201).json({ column });
  })
);

// PUT /api/columns/:id  — rename and/or reorder a column.
router.put(
  '/columns/:id',
  asyncHandler(async (req, res) => {
    const existing = await resolveColumn(req.params.id, req.userId);

    const data = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) throw badRequest('Column name cannot be empty');
      data.name = name;
    }

    if (Object.keys(data).length) {
      await prisma.column.update({ where: { id: existing.id }, data });
    }

    // Reorder among sibling columns when a target position is supplied.
    if (req.body?.position !== undefined) {
      const target = Math.max(0, parseInt(req.body.position, 10) || 0);
      const siblings = await prisma.column.findMany({
        where: { projectId: existing.projectId, id: { not: existing.id } },
        orderBy: { position: 'asc' },
      });
      siblings.splice(target, 0, existing);
      await prisma.$transaction(
        siblings.map((c, i) =>
          prisma.column.update({ where: { id: c.id }, data: { position: i } })
        )
      );
    }

    const column = await prisma.column.findUnique({ where: { id: existing.id } });
    emitToProject(existing.projectId, 'board:update', { type: 'column:updated' });
    res.json({ column });
  })
);

// DELETE /api/columns/:id  — remove a column (its tasks cascade) and compact positions.
router.delete(
  '/columns/:id',
  asyncHandler(async (req, res) => {
    const existing = await resolveColumn(req.params.id, req.userId);

    await prisma.column.delete({ where: { id: existing.id } });

    const remaining = await prisma.column.findMany({
      where: { projectId: existing.projectId },
      orderBy: { position: 'asc' },
    });
    await prisma.$transaction(
      remaining.map((c, i) =>
        prisma.column.update({ where: { id: c.id }, data: { position: i } })
      )
    );

    emitToProject(existing.projectId, 'board:update', { type: 'column:deleted' });
    res.json({ ok: true });
  })
);

export default router;
