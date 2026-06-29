import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from './src/lib/prisma.js';

async function main() {
  console.log('🌱  Seeding demo data...');

  // --- Reset (dev only) ---------------------------------------------------
  await prisma.notification.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.column.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // --- Users (all share password "password123") ---------------------------
  const passwordHash = await bcrypt.hash('password123', 10);

  const [alice, bob, carol] = await Promise.all([
    prisma.user.create({
      data: {
        username: 'alice',
        email: 'alice@example.com',
        passwordHash,
        displayName: 'Alice Johnson',
      },
    }),
    prisma.user.create({
      data: {
        username: 'bob',
        email: 'bob@example.com',
        passwordHash,
        displayName: 'Bob Martinez',
      },
    }),
    prisma.user.create({
      data: {
        username: 'carol',
        email: 'carol@example.com',
        passwordHash,
        displayName: 'Carol Nguyen',
      },
    }),
  ]);

  // --- Shared project with 3 members and 3 columns ------------------------
  const project = await prisma.project.create({
    data: {
      name: 'Website Redesign',
      description: 'Revamp the marketing site: new brand, faster pages, and a fresh blog.',
      ownerId: alice.id,
      members: {
        create: [
          { userId: alice.id, role: 'OWNER' },
          { userId: bob.id, role: 'MEMBER' },
          { userId: carol.id, role: 'MEMBER' },
        ],
      },
      columns: {
        create: [
          { name: 'To Do', position: 0 },
          { name: 'In Progress', position: 1 },
          { name: 'Done', position: 2 },
        ],
      },
    },
    include: { columns: { orderBy: { position: 'asc' } } },
  });

  const [todo, inProgress, done] = project.columns;

  // --- Cards --------------------------------------------------------------
  const day = 24 * 60 * 60 * 1000;
  const dueIn = (d) => new Date(Date.now() + d * day);

  const t = (data) => prisma.task.create({ data: { projectId: project.id, ...data } });

  const [moodboard, copy, wireframes, hero, perf, deploy] = await Promise.all([
    t({
      columnId: todo.id,
      title: 'Collect brand moodboard',
      description: 'Gather color palettes, typography, and competitor references.',
      assigneeId: carol.id,
      position: 0,
      dueDate: dueIn(5),
      createdById: alice.id,
    }),
    t({
      columnId: todo.id,
      title: 'Write homepage copy',
      description: 'Draft hero headline, subheading, and three feature blurbs.',
      assigneeId: bob.id,
      position: 1,
      dueDate: dueIn(7),
      createdById: alice.id,
    }),
    t({
      columnId: inProgress.id,
      title: 'Design wireframes',
      description: 'Low-fidelity wireframes for home, pricing, and blog index.',
      assigneeId: carol.id,
      position: 0,
      dueDate: dueIn(3),
      createdById: alice.id,
    }),
    t({
      columnId: inProgress.id,
      title: 'Build responsive hero section',
      description: 'Implement the new hero with the marketing team’s copy.',
      assigneeId: bob.id,
      position: 1,
      dueDate: dueIn(4),
      createdById: bob.id,
    }),
    t({
      columnId: done.id,
      title: 'Audit current page performance',
      description: 'Lighthouse pass on key pages; logged the biggest offenders.',
      assigneeId: alice.id,
      position: 0,
      createdById: alice.id,
    }),
    t({
      columnId: done.id,
      title: 'Set up staging deployment',
      description: 'CI deploys the main branch to the staging environment.',
      assigneeId: bob.id,
      position: 1,
      createdById: alice.id,
    }),
  ]);

  // --- A couple of comments ----------------------------------------------
  await prisma.taskComment.createMany({
    data: [
      {
        taskId: wireframes.id,
        authorId: alice.id,
        content: 'Let’s keep the pricing page above the fold on desktop.',
      },
      {
        taskId: wireframes.id,
        authorId: carol.id,
        content: 'Agreed — I’ll post a first pass tomorrow morning.',
      },
      {
        taskId: hero.id,
        authorId: alice.id,
        content: 'Looking great! Can we try a slightly larger headline?',
      },
    ],
  });

  // --- A few notifications so the bell has unread items on first login ----
  await prisma.notification.createMany({
    data: [
      {
        userId: carol.id,
        type: 'ASSIGNED',
        message: 'You were assigned to "Design wireframes"',
        projectId: project.id,
        taskId: wireframes.id,
      },
      {
        userId: bob.id,
        type: 'ASSIGNED',
        message: 'You were assigned to "Write homepage copy"',
        projectId: project.id,
        taskId: copy.id,
      },
      {
        userId: carol.id,
        type: 'COMMENT',
        message: 'Alice Johnson commented on "Design wireframes"',
        projectId: project.id,
        taskId: wireframes.id,
      },
    ],
  });

  console.log('✅  Seed complete.');
  console.log('   Demo project : Website Redesign');
  console.log('   Login with   : alice / bob / carol   (password: password123)');
  console.log('   Or use email : alice@example.com  etc.');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
