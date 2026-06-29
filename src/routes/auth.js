import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, badRequest, conflict, unauthorized } from '../lib/http.js';
import { publicUser } from '../lib/select.js';

const router = Router();

// POST /api/auth/register
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    let { username, email, password, displayName } = req.body || {};
    username = (username || '').trim().toLowerCase();
    email = (email || '').trim().toLowerCase();
    displayName = (displayName || '').trim();

    if (!username || !email || !password) {
      throw badRequest('username, email and password are required');
    }
    if (password.length < 6) {
      throw badRequest('password must be at least 6 characters');
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      throw conflict('A user with that username or email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName: displayName || username,
      },
      select: publicUser,
    });

    const token = signToken({ userId: user.id });
    res.status(201).json({ token, user });
  })
);

// POST /api/auth/login  — body: { login, password }  (login = username or email)
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { login, password } = req.body || {};
    const identifier = (login || '').trim().toLowerCase();

    if (!identifier || !password) {
      throw badRequest('login (username or email) and password are required');
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
    if (!user) throw unauthorized('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw unauthorized('Invalid credentials');

    const token = signToken({ userId: user.id });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
    });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: publicUser,
    });
    if (!user) throw unauthorized('User no longer exists');
    res.json({ user });
  })
);

export default router;
