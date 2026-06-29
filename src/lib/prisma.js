import { PrismaClient } from '@prisma/client';

// Single shared Prisma client for the whole app.
const prisma = new PrismaClient();

export default prisma;
