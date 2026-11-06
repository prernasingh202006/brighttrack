const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDb, disconnectDb } = require('./config/db');
const createApp = require('./app');

async function main() {
  await connectDb(env.MONGODB_URI);
  const server = createApp().listen(env.PORT, () => logger.info(`BrightTrack API listening on :${env.PORT}`));

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
