import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { initSocket } from './socket.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import columnRoutes from './routes/columns.js';
import taskRoutes from './routes/tasks.js';
import notificationRoutes from './routes/notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// ---- API ----
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', columnRoutes); //  /projects/:id/columns , /columns/:id
app.use('/api', taskRoutes); //  /columns/:id/tasks , /tasks/:id , /tasks/:id/comments
app.use('/api/notifications', notificationRoutes);

// Unknown API routes -> JSON 404 (so the SPA-ish static fallback never hides them).
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));

// ---- Static frontend ----
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/', (req, res) => res.redirect('/landing.html'));

// ---- Consistent JSON error handler ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`\n  🚀  Server + Socket.io listening on http://localhost:${PORT}`);
  console.log(`      API     : http://localhost:${PORT}/api`);
  console.log(`      App     : http://localhost:${PORT}/dashboard.html\n`);
});

export default app;
