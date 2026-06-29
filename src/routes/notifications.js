import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, notFound, forbidden } from '../lib/http.js';

const router = Router();
router.use(authRequired);

// GET /api/notifications  — current user's notifications + unread count.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unread = await prisma.notification.count({
      where: { userId: req.userId, read: false },
    });
    res.json({ notifications, unread });
  })
);

// PUT /api/notifications/:id/read  — mark one as read.
router.put(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
    });
    if (!notification) throw notFound('Notification not found');
    if (notification.userId !== req.userId) throw forbidden();

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true },
    });
    res.json({ notification: updated });
  })
);

// PUT /api/notifications/read-all  — mark every notification read.
router.put(
  '/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.userId, read: false },
      data: { read: true },
    });
    res.json({ ok: true });
  })
);

export default router;
