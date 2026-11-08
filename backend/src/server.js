import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

// Bind to all interfaces for managed container hosts such as Render.
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`T-CARE backend listening on port ${env.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
