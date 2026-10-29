import { createAppServer } from './app.js';

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = createAppServer();

const bound = await server.start(port, host);
console.log(
  JSON.stringify({
    event: 'server_started',
    port: bound.port,
    host: bound.host,
    wsPath: '/ws',
    timestamp: new Date().toISOString(),
  }),
);

const shutdown = async (signal: string) => {
  console.log(
    JSON.stringify({
      event: 'server_stopping',
      signal,
      timestamp: new Date().toISOString(),
    }),
  );
  await server.close();
  process.exit(0);
};

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
