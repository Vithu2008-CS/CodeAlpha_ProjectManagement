import prisma from './prisma.js';
import { emitToUser } from '../socket.js';

// Create a Notification row for a recipient and push it live to their
// personal socket room. Never notifies a user about their own action.
export async function notify({ userId, actorId, type, message, projectId = null, taskId = null }) {
  if (!userId || userId === actorId) return null;

  const notification = await prisma.notification.create({
    data: { userId, type, message, projectId, taskId },
  });

  emitToUser(userId, 'notification', notification);
  return notification;
}
