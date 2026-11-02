import { createServer } from './src/server.js';

const PORT = Number(process.env.PORT || 8080);
createServer(PORT);
