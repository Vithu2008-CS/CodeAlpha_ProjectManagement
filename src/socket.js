import { Server } from 'socket.io';
import { verifyToken } from './lib/jwt.js';
import { getMembership } from './lib/access.js';

let io = null;

// Initialise Socket.io on top of the HTTP server.
// - Authenticates the handshake using the same JWT as the REST API.
// - Joins every socket to its personal room  user:<id>
// - Lets a client join/leave a board room  project:<id>  (membership checked)
export function initSocket(server) {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // Handshake authentication.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyToken(token);
      socket.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    // Personal room for direct notifications.
    socket.join(`user:${socket.userId}`);

    // Join a board room only if the user is actually a member of the project.
    socket.on('project:join', async (projectId) => {
      if (!projectId) return;
      try {
        const membership = await getMembership(projectId, socket.userId);
        if (membership) socket.join(`project:${projectId}`);
      } catch {
        /* ignore — simply don't join */
      }
    });

    socket.on('project:leave', (projectId) => {
      if (projectId) socket.leave(`project:${projectId}`);
    });
  });

  return io;
}

// Broadcast a board event to everyone viewing a project.
export function emitToProject(projectId, event, payload) {
  if (io && projectId) io.to(`project:${projectId}`).emit(event, payload);
}

// Send a direct event (e.g. a notification) to one user's personal room.
export function emitToUser(userId, event, payload) {
  if (io && userId) io.to(`user:${userId}`).emit(event, payload);
}
