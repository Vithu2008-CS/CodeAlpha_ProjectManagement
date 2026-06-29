// Reusable Prisma "select" shapes so we never leak passwordHash to clients.

export const publicUser = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  createdAt: true,
};

export const taskInclude = {
  assignee: { select: publicUser },
  createdBy: { select: publicUser },
  _count: { select: { comments: true } },
};
