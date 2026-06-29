import prisma from './prisma.js';
import { forbidden, notFound } from './http.js';

// Return the membership row for (project, user) or null.
export function getMembership(projectId, userId) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

// Ensure the user is a member of the project; returns the membership row.
export async function assertMember(projectId, userId) {
  const membership = await getMembership(projectId, userId);
  if (!membership) throw forbidden('You are not a member of this project');
  return membership;
}

// Ensure the user is the OWNER of the project; returns the membership row.
export async function assertOwner(projectId, userId) {
  const membership = await getMembership(projectId, userId);
  if (!membership || membership.role !== 'OWNER') {
    throw forbidden('Only the project owner can perform this action');
  }
  return membership;
}

// Resolve a column and verify the requesting user is a member of its project.
export async function resolveColumn(columnId, userId) {
  const column = await prisma.column.findUnique({ where: { id: columnId } });
  if (!column) throw notFound('Column not found');
  await assertMember(column.projectId, userId);
  return column;
}

// Resolve a task and verify the requesting user is a member of its project.
export async function resolveTask(taskId, userId) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw notFound('Task not found');
  await assertMember(task.projectId, userId);
  return task;
}
