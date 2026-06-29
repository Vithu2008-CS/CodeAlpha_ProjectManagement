// Small HTTP helpers for consistent error handling across routes.

// Wraps an async route handler so thrown/rejected errors flow to the
// Express error middleware instead of crashing the process.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Build an Error carrying an HTTP status code.
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export const badRequest = (msg) => httpError(400, msg);
export const unauthorized = (msg = 'Authentication required') => httpError(401, msg);
export const forbidden = (msg = 'You do not have access to this resource') => httpError(403, msg);
export const notFound = (msg = 'Not found') => httpError(404, msg);
export const conflict = (msg) => httpError(409, msg);
