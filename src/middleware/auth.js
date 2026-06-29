import { verifyToken } from '../lib/jwt.js';
import { unauthorized } from '../lib/http.js';

// Express middleware: require a valid "Authorization: Bearer <jwt>" header.
// On success attaches req.userId.
export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) return next(unauthorized('Missing Bearer token'));

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}
