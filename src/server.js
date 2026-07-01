import 'dotenv/config';
import http from 'node:http';
import app from './app.js';
import { initSocket } from './socket.js';

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`\n  🚀  Server + Socket.io listening on http://localhost:${PORT}`);
  console.log(`      API     : http://localhost:${PORT}/api`);
  console.log(`      App     : http://localhost:${PORT}/dashboard.html\n`);
});
